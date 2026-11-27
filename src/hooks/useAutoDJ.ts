import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Song } from '@/Types';
// import { aiDJVoiceService } from '@/services/aiDJVoiceService';

interface AutoDJState {
  isEnabled: boolean;
  currentSongIndex: number;
  nextSongIndex: number;
  activeDeck: 'A' | 'B';
  isTransitioning: boolean;
  transitionProgress: number;
  transitionDuration: number; // seconds before end to start transition
  crossfadeSpeed: number; // seconds to complete crossfade
}

interface DeckStateLike {
  currentTrack: Song | null;
  isPlaying: boolean;
  position?: number;
  duration?: number;
}

interface AutoDJHookProps {
  songs: Song[];
  deckA: DeckStateLike;
  deckB: DeckStateLike;
  loadTrackToDeckA: (song: Song) => void;
  loadTrackToDeckB: (song: Song) => void;
  toggleDeckA: () => void;
  toggleDeckB: () => void;
  updateCrossfader: (value: number) => void;
  crossfader: number;
  handleSongUpdate: (song: Song, action: 'play' | 'pause' | 'stop', position?: number) => void;
  tiktokRequestCoinsBySongId?: Record<string, number>;
  onConsumeTikTokRequest?: (songId: string, deck?: 'A' | 'B') => void;
}

export const useAutoDJ = ({
  songs,
  deckA,
  deckB,
  loadTrackToDeckA,
  loadTrackToDeckB,
  toggleDeckA,
  toggleDeckB,
  updateCrossfader,
  crossfader,
  handleSongUpdate,
  tiktokRequestCoinsBySongId,
  onConsumeTikTokRequest,
}: AutoDJHookProps) => {
  const [autoDJState, setAutoDJState] = useState<AutoDJState>({
    isEnabled: false,
    currentSongIndex: 0,
    nextSongIndex: 1,
    activeDeck: 'A',
    isTransitioning: false,
    transitionProgress: 0,
    transitionDuration: 15, // Start transition 15 seconds before end
    crossfadeSpeed: 6, // 6 seconds to complete crossfade
  });

  const transitionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const monitorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bidClearingTrackerRef = useRef<Set<string>>(new Set());

  // --- Audible Playback Time Tracking for Bid Clearing ---
  const playbackTimeRef = useRef(0);
  const bidClearedRef = useRef<string | null>(null);
  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Stable Regular-Playlist Cursor ---
  // Tracks the last non-request track played from the alphabetical base playlist.
  // Priority requests (PlayMyJam ZAR bids & TikTok requests) play immediately next
  // WITHOUT moving this cursor, so regular playback resumes cleanly at index+1 afterwards.
  const lastRegularSongIdRef = useRef<string | null>(null);
  const lastRegularIndexRef = useRef<number>(-1);
  // Tracks whether the currently playing track ID entered playback as a priority request
  // (so clearing its bid/request mid-song doesn't mistakenly anchor the regular cursor to it).
  const currentPlayingPriorityTrackIdRef = useRef<string | null>(null);

  // Live refs to avoid stale closures inside transition/load timers
  const deckARef = useRef(deckA);
  const deckBRef = useRef(deckB);
  const songsRef = useRef(songs);
  const tiktokCoinsRef = useRef(tiktokRequestCoinsBySongId);
  const onConsumeTikTokRequestRef = useRef(onConsumeTikTokRequest);

  // Keep refs synchronously up-to-date so callbacks & memos never read 1-render-stale state
  deckARef.current = deckA;
  deckBRef.current = deckB;
  songsRef.current = songs;
  tiktokCoinsRef.current = tiktokRequestCoinsBySongId;
  onConsumeTikTokRequestRef.current = onConsumeTikTokRequest;

  // Stable alphabetical base playlist (matches MusicLibrary's default ordering)
  const basePlaylist = useMemo(() => {
    return [...songs].sort((a, b) => {
      const titleCmp = (a.title || '').localeCompare(b.title || '');
      if (titleCmp !== 0) return titleCmp;
      return (a.id || '').localeCompare(b.id || '');
    });
  }, [songs]);

  const basePlaylistRef = useRef(basePlaylist);
  basePlaylistRef.current = basePlaylist;

  // Helper: check whether a song currently has an active PlayMyJam bid or TikTok request
  const isPrioritySong = useCallback(
    (song: Song | null | undefined, coinsMap?: Record<string, number>): boolean => {
      if (!song) return false;
      const liveSong = songsRef.current.find((s) => s.id === song.id) || song;
      const bid = liveSong.currentBid || 0;
      const ttCoins = (coinsMap ?? tiktokCoinsRef.current)?.[song.id] || 0;
      return bid > 0 || ttCoins > 0;
    },
    []
  );

  // Helper: compare priority requests (PlayMyJam ZAR bids first, then TikTok coins, then title)
  const comparePrioritySongs = useCallback(
    (a: Song, b: Song, coinsMap?: Record<string, number>) => {
      const bidA = a.currentBid || 0;
      const bidB = b.currentBid || 0;
      if (bidA !== bidB) return bidB - bidA;
      const map = coinsMap ?? tiktokCoinsRef.current;
      const ttA = map?.[a.id] || 0;
      const ttB = map?.[b.id] || 0;
      if (ttA !== ttB) return ttB - ttA;
      const titleCmp = (a.title || '').localeCompare(b.title || '');
      return titleCmp !== 0 ? titleCmp : (a.id || '').localeCompare(b.id || '');
    },
    []
  );

  // Core selector: always picks highest-priority pending request first;
  // otherwise resumes the base playlist right after `lastRegularSongIdRef` (never resetting to 0, 1, 2!).
  const pickNextSong = useCallback(
    (
      currentlyPlayingSong: Song | null | undefined,
      options?: { excludeIds?: string[]; coinsMap?: Record<string, number> }
    ): { song: Song | null; isPriority: boolean; baseIndex: number } => {
      const playlist = basePlaylistRef.current;
      if (playlist.length === 0) {
        return { song: null, isPriority: false, baseIndex: -1 };
      }

      const coinsMap = options?.coinsMap ?? tiktokCoinsRef.current;
      const excluded = new Set<string>(options?.excludeIds || []);
      if (currentlyPlayingSong?.id) {
        excluded.add(currentlyPlayingSong.id);
      }

      // 1. Pending priority requests (PlayMyJam ZAR bids & TikTok requests) always jump to next
      const pendingRequests = playlist
        .filter((s) => !excluded.has(s.id) && ((s.currentBid || 0) > 0 || (coinsMap?.[s.id] || 0) > 0))
        .sort((a, b) => comparePrioritySongs(a, b, coinsMap));

      if (pendingRequests.length > 0) {
        const chosen = pendingRequests[0];
        const baseIndex = playlist.findIndex((s) => s.id === chosen.id);
        return { song: chosen, isPriority: true, baseIndex };
      }

      // 2. No pending requests — resume regular base playlist right after the last regular track
      let anchorIdx = -1;
      if (lastRegularSongIdRef.current) {
        anchorIdx = playlist.findIndex((s) => s.id === lastRegularSongIdRef.current);
      }
      if (anchorIdx === -1 && lastRegularIndexRef.current >= 0) {
        anchorIdx = Math.min(lastRegularIndexRef.current, playlist.length - 1);
      }
      if (anchorIdx === -1 && currentlyPlayingSong?.id) {
        anchorIdx = playlist.findIndex((s) => s.id === currentlyPlayingSong.id);
      }

      // Walk forward linearly from (anchorIdx + 1), wrapping to 0 only after the end of the playlist
      for (let offset = 1; offset <= playlist.length; offset++) {
        const idx = (anchorIdx + offset + playlist.length) % playlist.length;
        const candidate = playlist[idx];
        if (candidate && !excluded.has(candidate.id)) {
          return { song: candidate, isPriority: false, baseIndex: idx };
        }
      }

      // Fallback (e.g. single-track library)
      return { song: playlist[0], isPriority: false, baseIndex: 0 };
    },
    [comparePrioritySongs]
  );

  // Schedule a single non-overlapping load onto the standby deck
  const scheduleStandbyLoad = useCallback(
    (deck: 'A' | 'B', song: Song, delayMs = 350) => {
      if (pendingLoadTimeoutRef.current) {
        clearTimeout(pendingLoadTimeoutRef.current);
        pendingLoadTimeoutRef.current = null;
      }
      pendingLoadTimeoutRef.current = setTimeout(() => {
        pendingLoadTimeoutRef.current = null;
        if (deck === 'A') {
          loadTrackToDeckA(song);
        } else {
          loadTrackToDeckB(song);
        }
      }, delayMs);
    },
    [loadTrackToDeckA, loadTrackToDeckB]
  );

  // Create a signature that changes when bids, TikTok requests, or library tracks change
  const songsSignature = useMemo(() => {
    return basePlaylist
      .map((song) => `${song.id}:${song.currentBid || 0}:${tiktokRequestCoinsBySongId?.[song.id] || 0}`)
      .join('|');
  }, [basePlaylist, tiktokRequestCoinsBySongId]);

  // Resolve the live active-deck Song object (with latest Firestore bid info)
  const activeDeckTrack = autoDJState.activeDeck === 'A' ? deckA.currentTrack : deckB.currentTrack;
  const standbyDeckTrack = autoDJState.activeDeck === 'A' ? deckB.currentTrack : deckA.currentTrack;

  const currentSong = useMemo(() => {
    if (activeDeckTrack?.id) {
      return songs.find((s) => s.id === activeDeckTrack.id) || activeDeckTrack;
    }
    return basePlaylist[autoDJState.currentSongIndex] || basePlaylist[0];
  }, [activeDeckTrack, songs, basePlaylist, autoDJState.currentSongIndex]);

  // Compute the logical Up Next song cleanly (always matches what standby deck should hold)
  const nextSong = useMemo(() => {
    if (!autoDJState.isEnabled) {
      return basePlaylist[autoDJState.nextSongIndex] || basePlaylist[1] || basePlaylist[0];
    }
    if (basePlaylist.length === 0) return undefined;
    const picked = pickNextSong(currentSong, { coinsMap: tiktokRequestCoinsBySongId });
    return picked.song || standbyDeckTrack || undefined;
  }, [
    autoDJState.isEnabled,
    autoDJState.nextSongIndex,
    basePlaylist,
    currentSong,
    pickNextSong,
    standbyDeckTrack,
    tiktokRequestCoinsBySongId,
  ]);

  // Keep the regular-playlist cursor synced if the DJ manually loads/plays a regular track on the active deck
  useEffect(() => {
    if (!autoDJState.isEnabled || autoDJState.isTransitioning) return;
    if (!activeDeckTrack?.id) return;

    // Never overwrite the regular cursor when the active track is (or entered as) a priority request
    if (
      currentPlayingPriorityTrackIdRef.current === activeDeckTrack.id ||
      isPrioritySong(activeDeckTrack)
    ) {
      return;
    }

    const idxInBase = basePlaylist.findIndex((s) => s.id === activeDeckTrack.id);
    if (idxInBase >= 0 && lastRegularSongIdRef.current !== activeDeckTrack.id) {
      lastRegularSongIdRef.current = activeDeckTrack.id;
      lastRegularIndexRef.current = idxInBase;
    }
  }, [autoDJState.isEnabled, autoDJState.isTransitioning, activeDeckTrack, basePlaylist, isPrioritySong]);

  // Helper function to safely trigger bid clearing
  const triggerBidClearing = useCallback(
    (song: Song, context: string) => {
      if (!song || !song.id) return;

      if (bidClearingTrackerRef.current.has(song.id)) {
        console.log(`⚠️ ${context}: Bid clearing already triggered for ${song.title}, skipping`);
        return;
      }

      const latestSong = songsRef.current.find((s) => s.id === song.id) || song;
      if (latestSong.currentBid && latestSong.currentBid > 0) {
        console.log(`💰 ${context}: Triggering bid clearing for: ${latestSong.title} (Bid: ${latestSong.currentBid})`);
        bidClearingTrackerRef.current.add(latestSong.id);
        handleSongUpdate(latestSong, 'play', 0);

        setTimeout(() => {
          bidClearingTrackerRef.current.delete(latestSong.id);
        }, 50000);
      }
    },
    [handleSongUpdate]
  );

  // Dynamically update the standby deck when new bids/requests arrive (or get cancelled/rejected)
  const handleQueueUpdate = useCallback(() => {
    if (!autoDJState.isEnabled || autoDJState.isTransitioning) return;

    const currentPlayingSong =
      autoDJState.activeDeck === 'A' ? deckARef.current.currentTrack : deckBRef.current.currentTrack;
    const currentStandbySong =
      autoDJState.activeDeck === 'A' ? deckBRef.current.currentTrack : deckARef.current.currentTrack;

    if (!currentPlayingSong) return;

    const picked = pickNextSong(currentPlayingSong);
    const desiredNextSong = picked.song;
    if (!desiredNextSong || desiredNextSong.id === currentPlayingSong.id) return;

    const currentBaseIndex = basePlaylistRef.current.findIndex((s) => s.id === currentPlayingSong.id);
    const nextBaseIndex = picked.baseIndex >= 0 ? picked.baseIndex : 0;

    if (desiredNextSong.id !== currentStandbySong?.id) {
      const inactiveDeck: 'A' | 'B' = autoDJState.activeDeck === 'A' ? 'B' : 'A';
      console.log(
        `🔄 QUEUE UPDATE: "${currentStandbySong?.title || 'Empty'}" → "${desiredNextSong.title}" (${
          picked.isPriority ? 'PRIORITY REQUEST' : `Regular #${nextBaseIndex}`
        }) on Deck ${inactiveDeck}`
      );
      scheduleStandbyLoad(inactiveDeck, desiredNextSong, 350);

      setAutoDJState((prev) => ({
        ...prev,
        currentSongIndex: currentBaseIndex >= 0 ? currentBaseIndex : prev.currentSongIndex,
        nextSongIndex: nextBaseIndex,
      }));
    }
  }, [autoDJState.isEnabled, autoDJState.isTransitioning, autoDJState.activeDeck, pickNextSong, scheduleStandbyLoad]);

  // Monitor for queue changes (new bids, TikTok requests, or library updates)
  useEffect(() => {
    if (autoDJState.isEnabled && !autoDJState.isTransitioning) {
      handleQueueUpdate();
    }
  }, [songsSignature, autoDJState.isEnabled, autoDJState.isTransitioning, handleQueueUpdate]);

  // Calculate time remaining in current track
  const getCurrentTrackTimeRemaining = useCallback(() => {
    const activeDeckData = autoDJState.activeDeck === 'A' ? deckA : deckB;
    if (!activeDeckData?.currentTrack || !activeDeckData?.duration || activeDeckData.duration === 0) {
      return 0;
    }

    const position = activeDeckData.position || 0;
    const duration = activeDeckData.duration;
    return Math.max(0, duration - position);
  }, [deckA, deckB, autoDJState.activeDeck]);

  // Start Auto DJ
  const startAutoDJ = useCallback(() => {
    const playlist = basePlaylistRef.current;
    console.log('🚀 AUTO DJ START FUNCTION CALLED', { count: playlist.length });

    if (playlist.length < 2) {
      console.warn('❌ Need at least 2 songs for Auto DJ');
      alert('Need at least 2 songs in your library to use Auto DJ');
      return;
    }

    const deckAPlaying = deckARef.current.isPlaying;
    const deckBPlaying = deckBRef.current.isPlaying;
    const currentTrackA = deckARef.current.currentTrack;
    const currentTrackB = deckBRef.current.currentTrack;

    let activeDeck: 'A' | 'B' = 'A';
    let currentPlayingSong: Song | null = null;

    if (deckAPlaying && currentTrackA) {
      activeDeck = 'A';
      currentPlayingSong = currentTrackA;
    } else if (deckBPlaying && currentTrackB) {
      activeDeck = 'B';
      currentPlayingSong = currentTrackB;
    }

    if (currentPlayingSong) {
      const idx = playlist.findIndex((s) => s.id === currentPlayingSong!.id);
      const startedOnPriority = isPrioritySong(currentPlayingSong);
      if (startedOnPriority) {
        currentPlayingPriorityTrackIdRef.current = currentPlayingSong.id;
        // Preserve existing regular cursor if we already have one; otherwise leave at -1 so next regular is index 0
      } else {
        currentPlayingPriorityTrackIdRef.current = null;
        if (idx >= 0) {
          lastRegularSongIdRef.current = currentPlayingSong.id;
          lastRegularIndexRef.current = idx;
        }
      }

      const pickedNext = pickNextSong(currentPlayingSong);
      const nextToLoad = pickedNext.song;
      const inactiveDeck: 'A' | 'B' = activeDeck === 'A' ? 'B' : 'A';

      updateCrossfader(activeDeck === 'A' ? 0 : 100);

      if (nextToLoad) {
        console.log(`📀 Loading next song "${nextToLoad.title}" to Deck ${inactiveDeck}`);
        scheduleStandbyLoad(inactiveDeck, nextToLoad, 500);
      }

      setAutoDJState((prev) => ({
        ...prev,
        isEnabled: true,
        currentSongIndex: idx >= 0 ? idx : 0,
        nextSongIndex: pickedNext.baseIndex >= 0 ? pickedNext.baseIndex : 0,
        activeDeck,
        isTransitioning: false,
        transitionProgress: 0,
      }));
      return;
    }

    // No deck is currently playing — load the highest-priority request (or index 0) to Deck A, and next to Deck B
    lastRegularSongIdRef.current = null;
    lastRegularIndexRef.current = -1;
    const pickedFirst = pickNextSong(null);
    const firstSong = pickedFirst.song || playlist[0];

    if (pickedFirst.isPriority) {
      currentPlayingPriorityTrackIdRef.current = firstSong.id;
    } else {
      currentPlayingPriorityTrackIdRef.current = null;
      lastRegularSongIdRef.current = firstSong.id;
      lastRegularIndexRef.current = pickedFirst.baseIndex >= 0 ? pickedFirst.baseIndex : 0;
    }

    const pickedSecond = pickNextSong(firstSong);
    const secondSong = pickedSecond.song || playlist[1];

    updateCrossfader(0);
    if (firstSong) {
      loadTrackToDeckA(firstSong);
    }
    if (secondSong) {
      loadTrackToDeckB(secondSong);
    }

    setAutoDJState((prev) => ({
      ...prev,
      isEnabled: true,
      currentSongIndex: pickedFirst.baseIndex >= 0 ? pickedFirst.baseIndex : 0,
      nextSongIndex: pickedSecond.baseIndex >= 0 ? pickedSecond.baseIndex : 1,
      activeDeck: 'A',
      isTransitioning: false,
      transitionProgress: 0,
    }));
  }, [isPrioritySong, pickNextSong, updateCrossfader, scheduleStandbyLoad, loadTrackToDeckA, loadTrackToDeckB]);

  // Stop Auto DJ
  const stopAutoDJ = useCallback(() => {
    console.log('🛑 Stopping Auto DJ');

    setAutoDJState((prev) => ({
      ...prev,
      isEnabled: false,
      isTransitioning: false,
    }));

    if (transitionIntervalRef.current) {
      clearInterval(transitionIntervalRef.current);
      transitionIntervalRef.current = null;
    }
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current);
      monitorIntervalRef.current = null;
    }
    if (pendingLoadTimeoutRef.current) {
      clearTimeout(pendingLoadTimeoutRef.current);
      pendingLoadTimeoutRef.current = null;
    }

    bidClearingTrackerRef.current.clear();
  }, []);

  // Start transition between decks
  const startTransition = useCallback(() => {
    if (autoDJState.isTransitioning) {
      return;
    }

    const prevActiveDeck = autoDJState.activeDeck;
    const nextDeck: 'A' | 'B' = prevActiveDeck === 'A' ? 'B' : 'A';
    const nextDeckData = nextDeck === 'A' ? deckARef.current : deckBRef.current;

    if (!nextDeckData?.currentTrack) {
      console.error(`❌ Cannot transition - Deck ${nextDeck} has no track loaded!`);
      return;
    }

    const nextSongToPlay = nextDeckData.currentTrack;
    // Snapshot whether the incoming track is a priority request BEFORE its bid/TikTok status is consumed
    const incomingWasPriority = isPrioritySong(nextSongToPlay);
    const incomingHadTikTokRequest = Boolean(tiktokCoinsRef.current?.[nextSongToPlay.id]);

    console.log(
      `🔄 Transition Deck ${prevActiveDeck} → Deck ${nextDeck}: "${nextSongToPlay.title}" (${
        incomingWasPriority ? 'PRIORITY REQUEST' : 'REGULAR'
      })`
    );

    setAutoDJState((prev) => ({
      ...prev,
      isTransitioning: true,
      transitionProgress: 0,
    }));

    // Start playing the next deck immediately for seamless overlap
    if (nextDeck === 'B' && !deckBRef.current.isPlaying) {
      toggleDeckB();
      setTimeout(() => {
        if (nextSongToPlay && deckBRef.current.isPlaying) {
          triggerBidClearing(nextSongToPlay, 'Auto DJ Transition to B');
        }
      }, 1000);
    } else if (nextDeck === 'A' && !deckARef.current.isPlaying) {
      toggleDeckA();
      setTimeout(() => {
        if (nextSongToPlay && deckARef.current.isPlaying) {
          triggerBidClearing(nextSongToPlay, 'Auto DJ Transition to A');
        }
      }, 1000);
    }

    // Animate crossfader
    const startCrossfader = crossfader;
    const targetCrossfader = prevActiveDeck === 'A' ? 100 : 0;
    const crossfadeSteps = Math.max(20, autoDJState.crossfadeSpeed * 10);
    let currentStep = 0;

    transitionIntervalRef.current = setInterval(() => {
      currentStep++;
      const progress = Math.min(currentStep / crossfadeSteps, 1);

      if (progress >= 1) {
        updateCrossfader(targetCrossfader);

        // Stop the previous deck only if it is still playing (never accidentally unpause it)
        if (prevActiveDeck === 'A' && deckARef.current.isPlaying) {
          toggleDeckA();
        } else if (prevActiveDeck === 'B' && deckBRef.current.isPlaying) {
          toggleDeckB();
        }

        const newActiveDeck = nextDeck;
        const newStandbyDeck: 'A' | 'B' = newActiveDeck === 'A' ? 'B' : 'A';
        const playlist = basePlaylistRef.current;
        const playingBaseIndex = playlist.findIndex((s) => s.id === nextSongToPlay.id);

        // CRITICAL FIX: Only advance the regular-playlist cursor when playing a REGULAR track,
        // OR when a requested track happened to be the exact next regular slot (so it won't replay right after).
        // For any other PlayMyJam bid or TikTok request, keep `lastRegularSongIdRef` anchored at
        // the last regular track (e.g. index 2) so playback resumes cleanly at index 3 next!
        const currentAnchorIdx = lastRegularSongIdRef.current
          ? playlist.findIndex((s) => s.id === lastRegularSongIdRef.current)
          : lastRegularIndexRef.current;
        const expectedNextRegularIdx =
          playlist.length > 0 && currentAnchorIdx >= 0
            ? (currentAnchorIdx + 1) % playlist.length
            : -1;

        if (incomingWasPriority && playingBaseIndex !== expectedNextRegularIdx) {
          currentPlayingPriorityTrackIdRef.current = nextSongToPlay.id;
        } else {
          currentPlayingPriorityTrackIdRef.current = incomingWasPriority ? nextSongToPlay.id : null;
          lastRegularSongIdRef.current = nextSongToPlay.id;
          if (playingBaseIndex >= 0) {
            lastRegularIndexRef.current = playingBaseIndex;
          }
        }

        // Consume TikTok request right away so the next pick won't re-pick this same track
        if (nextSongToPlay.id && incomingHadTikTokRequest) {
          onConsumeTikTokRequestRef.current?.(nextSongToPlay.id, newActiveDeck);
        }

        // Pick the upcoming track using live refs (excluding the song that just became active)
        const pickedUpcoming = pickNextSong(nextSongToPlay, {
          excludeIds: [nextSongToPlay.id],
        });
        const upcomingSong = pickedUpcoming.song;

        setAutoDJState((prev) => ({
          ...prev,
          activeDeck: newActiveDeck,
          currentSongIndex: playingBaseIndex >= 0 ? playingBaseIndex : prev.currentSongIndex,
          nextSongIndex: pickedUpcoming.baseIndex >= 0 ? pickedUpcoming.baseIndex : 0,
          isTransitioning: false,
          transitionProgress: 100,
        }));

        if (upcomingSong) {
          console.log(
            `📀 Loading upcoming track "${upcomingSong.title}" (${
              pickedUpcoming.isPriority ? 'PRIORITY REQUEST' : `Regular #${pickedUpcoming.baseIndex}`
            }) to Deck ${newStandbyDeck}`
          );
          scheduleStandbyLoad(newStandbyDeck, upcomingSong, 450);
        }

        if (transitionIntervalRef.current) {
          clearInterval(transitionIntervalRef.current);
          transitionIntervalRef.current = null;
        }
      } else {
        const newCrossfaderValue = startCrossfader + (targetCrossfader - startCrossfader) * progress;
        updateCrossfader(Math.round(newCrossfaderValue));

        setAutoDJState((prev) => ({
          ...prev,
          transitionProgress: progress * 100,
        }));
      }
    }, 100);
  }, [
    autoDJState.isTransitioning,
    autoDJState.activeDeck,
    autoDJState.crossfadeSpeed,
    crossfader,
    isPrioritySong,
    toggleDeckA,
    toggleDeckB,
    triggerBidClearing,
    updateCrossfader,
    pickNextSong,
    scheduleStandbyLoad,
  ]);

  // Monitor track progress and trigger transitions
  useEffect(() => {
    if (!autoDJState.isEnabled || autoDJState.isTransitioning) {
      return;
    }

    if (!deckA.isPlaying && !deckB.isPlaying) return;

    if (autoDJState.activeDeck === 'A' && !deckA.isPlaying && deckB.isPlaying) {
      toggleDeckB();
      setTimeout(() => toggleDeckA(), 200);
    }

    monitorIntervalRef.current = setInterval(() => {
      const activeDeckData = autoDJState.activeDeck === 'A' ? deckARef.current : deckBRef.current;
      const duration = activeDeckData?.duration || 0;
      const position = activeDeckData?.position || 0;
      const timeRemaining = duration > 0 ? Math.max(0, duration - position) : 0;

      const hasValidDuration = Boolean(duration > 0);
      const shouldTransition =
        hasValidDuration && timeRemaining > 0 && timeRemaining <= autoDJState.transitionDuration;
      const isEmergency =
        hasValidDuration &&
        timeRemaining <= 0 &&
        Boolean(activeDeckData?.currentTrack) &&
        !autoDJState.isTransitioning;
      const isForceTransition =
        hasValidDuration && timeRemaining > 0 && timeRemaining <= 3 && !autoDJState.isTransitioning;

      if (shouldTransition || isEmergency || isForceTransition) {
        startTransition();
      }
    }, 250);

    return () => {
      if (monitorIntervalRef.current) {
        clearInterval(monitorIntervalRef.current);
        monitorIntervalRef.current = null;
      }
    };
  }, [
    autoDJState.isEnabled,
    autoDJState.isTransitioning,
    autoDJState.activeDeck,
    autoDJState.transitionDuration,
    startTransition,
    deckA.isPlaying,
    deckB.isPlaying,
    toggleDeckA,
    toggleDeckB,
  ]);

  // --- Robust 45s Play Timer for Bid Clearing ---
  useEffect(() => {
    if (!autoDJState.isEnabled) return;
    const activeDeckData = autoDJState.activeDeck === 'A' ? deckA : deckB;
    const activeTrack = activeDeckData?.currentTrack;
    if (!activeTrack?.id) return;

    const liveSong = songs.find((s) => s.id === activeTrack.id) || activeTrack;
    if (!liveSong.currentBid || liveSong.currentBid <= 0) return;

    if (bidClearedRef.current !== liveSong.id) {
      playbackTimeRef.current = 0;
      bidClearedRef.current = null;
    }

    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
    }

    playbackIntervalRef.current = setInterval(() => {
      const latestDeck = autoDJState.activeDeck === 'A' ? deckARef.current : deckBRef.current;
      if (latestDeck.isPlaying) {
        playbackTimeRef.current += 1;
        if (playbackTimeRef.current >= 45 && bidClearedRef.current !== liveSong.id) {
          triggerBidClearing(liveSong, '45s Play Timer');
          bidClearedRef.current = liveSong.id;
        }
      }
    }, 1000);

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    };
  }, [
    autoDJState.isEnabled,
    autoDJState.activeDeck,
    deckA,
    deckB,
    songs,
    triggerBidClearing,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transitionIntervalRef.current) {
        clearInterval(transitionIntervalRef.current);
      }
      if (monitorIntervalRef.current) {
        clearInterval(monitorIntervalRef.current);
      }
      if (pendingLoadTimeoutRef.current) {
        clearTimeout(pendingLoadTimeoutRef.current);
      }
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, []);

  const skipToNext = useCallback(() => {
    if (!autoDJState.isEnabled) return;
    startTransition();
  }, [autoDJState.isEnabled, startTransition]);

  const updateTransitionDuration = useCallback((seconds: number) => {
    setAutoDJState((prev) => ({
      ...prev,
      transitionDuration: Math.max(5, Math.min(30, seconds)),
    }));
  }, []);

  const updateCrossfadeSpeed = useCallback((seconds: number) => {
    setAutoDJState((prev) => ({
      ...prev,
      crossfadeSpeed: Math.max(2, Math.min(15, seconds)),
    }));
  }, []);

  return {
    autoDJState,
    currentSong,
    nextSong,
    startAutoDJ,
    stopAutoDJ,
    skipToNext,
    updateTransitionDuration,
    updateCrossfadeSpeed,
    timeRemaining: getCurrentTrackTimeRemaining(),
  };
};
