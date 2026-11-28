import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Song } from '@/Types';

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
  loadTrackToDeckA: (song: Song, autoPlay?: boolean) => void;
  loadTrackToDeckB: (song: Song, autoPlay?: boolean) => void;
  playDeckA: () => void;
  pauseDeckA: () => void;
  playDeckB: () => void;
  pauseDeckB: () => void;
  toggleDeckA?: () => void;
  toggleDeckB?: () => void;
  updateCrossfader: (value: number) => void;
  crossfader: number;
  handleSongUpdate: (song: Song, action: 'play' | 'pause' | 'stop', position?: number) => void;
  onClearSongBid?: (song: Song) => Promise<void> | void;
  tiktokRequestCoinsBySongId?: Record<string, number>;
  tiktokQueuedSongs?: Song[];
  onConsumeTikTokRequest?: (songId: string, deck?: 'A' | 'B') => void;
  onFinishTikTokRequest?: (songId: string) => void;
}

export const useAutoDJ = ({
  songs,
  deckA,
  deckB,
  loadTrackToDeckA,
  loadTrackToDeckB,
  playDeckA,
  pauseDeckA,
  playDeckB,
  pauseDeckB,
  updateCrossfader,
  crossfader,
  handleSongUpdate,
  onClearSongBid,
  tiktokRequestCoinsBySongId,
  tiktokQueuedSongs,
  onConsumeTikTokRequest,
  onFinishTikTokRequest,
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
  const pendingLoadDeckRef = useRef<'A' | 'B' | null>(null);
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
  const currentPlayingPriorityTrackIdRef = useRef<string | null>(null);

  // Respect manual DJ loads onto the standby deck unless a brand-new priority request arrives
  const manualStandbyTrackRef = useRef<{ deck: 'A' | 'B'; songId: string } | null>(null);
  const lastPrioritySignatureRef = useRef<string>('');
  const activeTrackWasPlayingRef = useRef<boolean>(false);
  // Prevents already-played requested songs from ever ping-pong looping before async state/Firestore settles
  const playedPriorityGuardRef = useRef<Map<string, { bid: number; ttCoins: number; at: number }>>(new Map());

  // Live refs so intervals/transitions NEVER tear down on timeupdate or read stale closures
  const deckARef = useRef(deckA);
  const deckBRef = useRef(deckB);
  const songsRef = useRef(songs);
  const crossfaderRef = useRef(crossfader);
  const tiktokCoinsRef = useRef(tiktokRequestCoinsBySongId);
  const tiktokQueuedSongsRef = useRef(tiktokQueuedSongs);
  const loadTrackToDeckARef = useRef(loadTrackToDeckA);
  const loadTrackToDeckBRef = useRef(loadTrackToDeckB);
  const playDeckARef = useRef(playDeckA);
  const pauseDeckARef = useRef(pauseDeckA);
  const playDeckBRef = useRef(playDeckB);
  const pauseDeckBRef = useRef(pauseDeckB);
  const updateCrossfaderRef = useRef(updateCrossfader);
  const handleSongUpdateRef = useRef(handleSongUpdate);
  const onClearSongBidRef = useRef(onClearSongBid);
  const onConsumeTikTokRequestRef = useRef(onConsumeTikTokRequest);
  const onFinishTikTokRequestRef = useRef(onFinishTikTokRequest);

  const isEnabledRef = useRef(autoDJState.isEnabled);
  const isTransitioningRef = useRef(autoDJState.isTransitioning);
  const activeDeckRef = useRef<'A' | 'B'>(autoDJState.activeDeck);
  const transitionDurationRef = useRef(autoDJState.transitionDuration);
  const crossfadeSpeedRef = useRef(autoDJState.crossfadeSpeed);

  // Keep refs synchronously up-to-date every render
  deckARef.current = deckA;
  deckBRef.current = deckB;
  songsRef.current = songs;
  crossfaderRef.current = crossfader;
  tiktokCoinsRef.current = tiktokRequestCoinsBySongId;
  tiktokQueuedSongsRef.current = tiktokQueuedSongs;
  loadTrackToDeckARef.current = loadTrackToDeckA;
  loadTrackToDeckBRef.current = loadTrackToDeckB;
  playDeckARef.current = playDeckA;
  pauseDeckARef.current = pauseDeckA;
  playDeckBRef.current = playDeckB;
  pauseDeckBRef.current = pauseDeckB;
  updateCrossfaderRef.current = updateCrossfader;
  handleSongUpdateRef.current = handleSongUpdate;
  onClearSongBidRef.current = onClearSongBid;
  onConsumeTikTokRequestRef.current = onConsumeTikTokRequest;
  onFinishTikTokRequestRef.current = onFinishTikTokRequest;

  isEnabledRef.current = autoDJState.isEnabled;
  // Note: isTransitioningRef is locked synchronously inside startTransition(), so sync when React catches up
  if (!autoDJState.isEnabled) {
    isTransitioningRef.current = false;
  }
  activeDeckRef.current = autoDJState.activeDeck;
  transitionDurationRef.current = autoDJState.transitionDuration;
  crossfadeSpeedRef.current = autoDJState.crossfadeSpeed;

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

  // Core selector: always picks highest-priority pending request first (including fresh AI/external tracks);
  // otherwise resumes the base playlist right after `lastRegularSongIdRef`.
  const pickNextSong = useCallback(
    (
      currentlyPlayingSong: Song | null | undefined,
      options?: { excludeIds?: string[]; coinsMap?: Record<string, number> }
    ): { song: Song | null; isPriority: boolean; baseIndex: number } => {
      const playlist = basePlaylistRef.current;
      const queuedExtras = tiktokQueuedSongsRef.current || [];

      const coinsMap = options?.coinsMap ?? tiktokCoinsRef.current;
      const excluded = new Set<string>(options?.excludeIds || []);
      if (currentlyPlayingSong?.id) {
        excluded.add(currentlyPlayingSong.id);
      }

      const hasFreshPriority = (s: Song): boolean => {
        const bid = s.currentBid || 0;
        const ttCoins = coinsMap?.[s.id] || 0;
        if (bid <= 0 && ttCoins <= 0) return false;
        const guard = playedPriorityGuardRef.current.get(s.id);
        if (guard && Date.now() - guard.at < 5 * 60 * 1000) {
          // Only re-prioritize if a brand-new higher bid/request arrived after this track already played
          const newHigherBid = bid > 0 && bid > guard.bid;
          const newHigherTikTok = ttCoins > 0 && ttCoins > guard.ttCoins + 0.01;
          if (!newHigherBid && !newHigherTikTok) {
            return false;
          }
        }
        return true;
      };

      // Combine library + any freshly fetched/AI-generated queued requests (deduped by id)
      const priorityPoolMap = new Map<string, Song>();
      for (const s of playlist) {
        if (!excluded.has(s.id) && hasFreshPriority(s)) {
          priorityPoolMap.set(s.id, s);
        }
      }
      for (const s of queuedExtras) {
        if (s?.id && !excluded.has(s.id) && !priorityPoolMap.has(s.id) && hasFreshPriority(s)) {
          priorityPoolMap.set(s.id, s);
        }
      }

      // 1. Pending priority requests (PlayMyJam ZAR bids & TikTok/AI requests) always jump to next
      const pendingRequests = Array.from(priorityPoolMap.values()).sort((a, b) =>
        comparePrioritySongs(a, b, coinsMap)
      );

      if (pendingRequests.length > 0) {
        const chosen = pendingRequests[0];
        const baseIndex = playlist.findIndex((s) => s.id === chosen.id);
        return { song: chosen, isPriority: true, baseIndex };
      }

      if (playlist.length === 0) {
        return { song: null, isPriority: false, baseIndex: -1 };
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

      return { song: playlist[0], isPriority: false, baseIndex: 0 };
    },
    [comparePrioritySongs]
  );

  // Schedule a single non-overlapping load onto the standby deck
  const scheduleStandbyLoad = useCallback((deck: 'A' | 'B', song: Song, delayMs = 350) => {
    if (pendingLoadTimeoutRef.current) {
      clearTimeout(pendingLoadTimeoutRef.current);
      pendingLoadTimeoutRef.current = null;
      pendingLoadDeckRef.current = null;
    }

    const doLoad = () => {
      pendingLoadTimeoutRef.current = null;
      pendingLoadDeckRef.current = null;
      // Never clobber an actively playing deck
      const targetDeckState = deck === 'A' ? deckARef.current : deckBRef.current;
      if (targetDeckState.isPlaying) return;
      if (deck === 'A') {
        loadTrackToDeckARef.current(song, false);
      } else {
        loadTrackToDeckBRef.current(song, false);
      }
    };

    if (delayMs <= 0) {
      doLoad();
      return;
    }

    pendingLoadDeckRef.current = deck;
    pendingLoadTimeoutRef.current = setTimeout(doLoad, delayMs);
  }, []);

  // Called whenever the DJ manually loads a track onto Deck A or Deck B (A/B buttons or drag-and-drop)
  const notifyManualDeckLoad = useCallback((deck: 'A' | 'B', songId: string) => {
    if (pendingLoadTimeoutRef.current && pendingLoadDeckRef.current === deck) {
      clearTimeout(pendingLoadTimeoutRef.current);
      pendingLoadTimeoutRef.current = null;
      pendingLoadDeckRef.current = null;
    }
    if (isEnabledRef.current && deck !== activeDeckRef.current) {
      manualStandbyTrackRef.current = { deck, songId };
    }
  }, []);

  // Priority-only signature so routine metadata/play-status snapshots don't overwrite a manually cued standby deck
  const prioritySignature = useMemo(() => {
    const parts: string[] = [];
    for (const song of basePlaylist) {
      const bid = song.currentBid || 0;
      const tt = tiktokRequestCoinsBySongId?.[song.id] || 0;
      if (bid > 0 || tt > 0) {
        parts.push(`${song.id}:${bid}:${tt}`);
      }
    }
    if (tiktokQueuedSongs?.length) {
      for (const song of tiktokQueuedSongs) {
        const tt = tiktokRequestCoinsBySongId?.[song.id] || 0;
        if (tt > 0) {
          parts.push(`q:${song.id}:${tt}`);
        }
      }
    }
    return parts.join('|');
  }, [basePlaylist, tiktokRequestCoinsBySongId, tiktokQueuedSongs]);

  // Resolve the live active-deck Song object (with latest Firestore bid info)
  const activeDeckTrack = autoDJState.activeDeck === 'A' ? deckA.currentTrack : deckB.currentTrack;
  const standbyDeckTrack = autoDJState.activeDeck === 'A' ? deckB.currentTrack : deckA.currentTrack;

  const currentSong = useMemo(() => {
    if (activeDeckTrack?.id) {
      return songs.find((s) => s.id === activeDeckTrack.id) || activeDeckTrack;
    }
    return basePlaylist[autoDJState.currentSongIndex] || basePlaylist[0];
  }, [activeDeckTrack, songs, basePlaylist, autoDJState.currentSongIndex]);

  // Compute the logical Up Next song cleanly (always matches what standby deck holds/will play)
  const nextSong = useMemo(() => {
    if (!autoDJState.isEnabled) {
      return basePlaylist[autoDJState.nextSongIndex] || basePlaylist[1] || basePlaylist[0];
    }
    const inactiveDeck: 'A' | 'B' = autoDJState.activeDeck === 'A' ? 'B' : 'A';
    if (
      manualStandbyTrackRef.current &&
      manualStandbyTrackRef.current.deck === inactiveDeck &&
      standbyDeckTrack?.id === manualStandbyTrackRef.current.songId
    ) {
      return standbyDeckTrack;
    }
    if (basePlaylist.length === 0 && !tiktokQueuedSongs?.length) return undefined;
    const picked = pickNextSong(currentSong, { coinsMap: tiktokRequestCoinsBySongId });
    return picked.song || standbyDeckTrack || undefined;
  }, [
    autoDJState.isEnabled,
    autoDJState.activeDeck,
    autoDJState.nextSongIndex,
    basePlaylist,
    currentSong,
    pickNextSong,
    standbyDeckTrack,
    tiktokRequestCoinsBySongId,
    tiktokQueuedSongs,
  ]);

  // Keep the regular-playlist cursor synced if the DJ manually loads/plays a regular track on the active deck
  useEffect(() => {
    if (!autoDJState.isEnabled || autoDJState.isTransitioning) return;
    if (!activeDeckTrack?.id) return;

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
  const triggerBidClearing = useCallback((song: Song, context: string, settleBidNow = false) => {
    if (!song || !song.id) return;

    const latestSong = songsRef.current.find((s) => s.id === song.id) || song;
    if (latestSong.currentBid && latestSong.currentBid > 0) {
      if (settleBidNow) {
        console.log(`💰 ${context}: Settling & clearing PlayMyJam bid for: ${latestSong.title} (Bid: ${latestSong.currentBid})`);
        void onClearSongBidRef.current?.(latestSong);
        return;
      }

      if (bidClearingTrackerRef.current.has(song.id)) {
        return;
      }
      console.log(`💰 ${context}: Marking playing status for bid track: ${latestSong.title} (Bid: ${latestSong.currentBid})`);
      bidClearingTrackerRef.current.add(latestSong.id);
      handleSongUpdateRef.current(latestSong, 'play', 0);

      setTimeout(() => {
        bidClearingTrackerRef.current.delete(latestSong.id);
      }, 50000);
    }
  }, []);

  // Dynamically update the standby deck ONLY when priority requests change (or standby deck is empty)
  const handleQueueUpdate = useCallback(
    (priorityChanged: boolean) => {
      if (!isEnabledRef.current || isTransitioningRef.current) return;

      const activeDeck = activeDeckRef.current;
      const inactiveDeck: 'A' | 'B' = activeDeck === 'A' ? 'B' : 'A';
      const currentPlayingSong =
        activeDeck === 'A' ? deckARef.current.currentTrack : deckBRef.current.currentTrack;
      const standbyDeckData = activeDeck === 'A' ? deckBRef.current : deckARef.current;
      const currentStandbySong = standbyDeckData.currentTrack;

      if (!currentPlayingSong || standbyDeckData.isPlaying) return;

      const picked = pickNextSong(currentPlayingSong);
      const desiredNextSong = picked.song;
      if (!desiredNextSong || desiredNextSong.id === currentPlayingSong.id) return;

      // Respect a song the DJ manually clicked A/B to place on the standby deck unless a NEW priority request just arrived
      const manual = manualStandbyTrackRef.current;
      if (manual && manual.deck === inactiveDeck && currentStandbySong?.id === manual.songId) {
        if (!priorityChanged || !picked.isPriority) {
          return;
        }
        manualStandbyTrackRef.current = null;
      }

      if (desiredNextSong.id !== currentStandbySong?.id) {
        const currentBaseIndex = basePlaylistRef.current.findIndex((s) => s.id === currentPlayingSong.id);
        const nextBaseIndex = picked.baseIndex >= 0 ? picked.baseIndex : 0;

        console.log(
          `🔄 QUEUE UPDATE: "${currentStandbySong?.title || 'Empty'}" → "${desiredNextSong.title}" (${
            picked.isPriority ? 'PRIORITY REQUEST' : `Regular #${nextBaseIndex}`
          }) on Deck ${inactiveDeck}`
        );
        scheduleStandbyLoad(inactiveDeck, desiredNextSong, 250);

        setAutoDJState((prev) => ({
          ...prev,
          currentSongIndex: currentBaseIndex >= 0 ? currentBaseIndex : prev.currentSongIndex,
          nextSongIndex: nextBaseIndex,
        }));
      }
    },
    [pickNextSong, scheduleStandbyLoad]
  );

  // Monitor for priority request changes (new bids, TikTok/AI requests, cancellations)
  useEffect(() => {
    // Once a guarded song's bid & TikTok request have genuinely cleared to 0, release the guard
    // so a future brand-new request for the same song can be prioritized again.
    if (playedPriorityGuardRef.current.size > 0) {
      for (const songId of Array.from(playedPriorityGuardRef.current.keys())) {
        const liveSong = songsRef.current.find((s) => s.id === songId);
        const bid = liveSong?.currentBid || 0;
        const tt = tiktokCoinsRef.current?.[songId] || 0;
        if (bid <= 0 && tt <= 0) {
          playedPriorityGuardRef.current.delete(songId);
        }
      }
    }

    const priorityChanged = prioritySignature !== lastPrioritySignatureRef.current;
    lastPrioritySignatureRef.current = prioritySignature;

    if (autoDJState.isEnabled && !autoDJState.isTransitioning && priorityChanged) {
      handleQueueUpdate(true);
    }
  }, [prioritySignature, autoDJState.isEnabled, autoDJState.isTransitioning, handleQueueUpdate]);

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

    if (transitionIntervalRef.current) {
      clearInterval(transitionIntervalRef.current);
      transitionIntervalRef.current = null;
    }
    if (pendingLoadTimeoutRef.current) {
      clearTimeout(pendingLoadTimeoutRef.current);
      pendingLoadTimeoutRef.current = null;
      pendingLoadDeckRef.current = null;
    }

    isTransitioningRef.current = false;
    manualStandbyTrackRef.current = null;
    lastPrioritySignatureRef.current = prioritySignature;

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
      activeTrackWasPlayingRef.current = true;
      const idx = playlist.findIndex((s) => s.id === currentPlayingSong!.id);
      const startedOnPriority = isPrioritySong(currentPlayingSong);
      if (startedOnPriority) {
        currentPlayingPriorityTrackIdRef.current = currentPlayingSong.id;
        const liveCurrent = songsRef.current.find((s) => s.id === currentPlayingSong!.id) || currentPlayingSong;
        const ttCoins = tiktokCoinsRef.current?.[currentPlayingSong.id] || 0;
        playedPriorityGuardRef.current.set(currentPlayingSong.id, {
          bid: liveCurrent.currentBid || 0,
          ttCoins,
          at: Date.now(),
        });
        if (ttCoins > 0) {
          onConsumeTikTokRequestRef.current?.(currentPlayingSong.id, activeDeck);
        }
      } else {
        currentPlayingPriorityTrackIdRef.current = null;
        if (idx >= 0) {
          lastRegularSongIdRef.current = currentPlayingSong.id;
          lastRegularIndexRef.current = idx;
        }
      }

      const inactiveDeck: 'A' | 'B' = activeDeck === 'A' ? 'B' : 'A';
      const existingStandby = inactiveDeck === 'A' ? currentTrackA : currentTrackB;
      const pickedNext = pickNextSong(currentPlayingSong);
      const nextToLoad = pickedNext.song;

      updateCrossfaderRef.current(activeDeck === 'A' ? 0 : 100);

      // Load immediately onto standby deck (no artificial delay) if empty or if a priority request should jump next
      if (nextToLoad && (!existingStandby || pickedNext.isPriority || existingStandby.id === currentPlayingSong.id)) {
        console.log(`📀 Loading next song "${nextToLoad.title}" to Deck ${inactiveDeck}`);
        scheduleStandbyLoad(inactiveDeck, nextToLoad, 0);
      }

      activeDeckRef.current = activeDeck;
      isEnabledRef.current = true;
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

    // No deck is currently playing: preserve a track the DJ already loaded (paused) on Deck A or B!
    activeTrackWasPlayingRef.current = false;
    if (currentTrackA || currentTrackB) {
      activeDeck = currentTrackA ? 'A' : 'B';
      const loadedSong = (currentTrackA || currentTrackB)!;
      const inactiveDeck: 'A' | 'B' = activeDeck === 'A' ? 'B' : 'A';
      const otherLoaded = inactiveDeck === 'A' ? currentTrackA : currentTrackB;
      const idx = playlist.findIndex((s) => s.id === loadedSong.id);

      if (isPrioritySong(loadedSong)) {
        currentPlayingPriorityTrackIdRef.current = loadedSong.id;
      } else {
        currentPlayingPriorityTrackIdRef.current = null;
        if (idx >= 0) {
          lastRegularSongIdRef.current = loadedSong.id;
          lastRegularIndexRef.current = idx;
        }
      }

      const pickedSecond = pickNextSong(loadedSong);
      updateCrossfaderRef.current(activeDeck === 'A' ? 0 : 100);

      if (pickedSecond.song && (!otherLoaded || pickedSecond.isPriority || otherLoaded.id === loadedSong.id)) {
        scheduleStandbyLoad(inactiveDeck, pickedSecond.song, 0);
      }

      activeDeckRef.current = activeDeck;
      isEnabledRef.current = true;
      setAutoDJState((prev) => ({
        ...prev,
        isEnabled: true,
        currentSongIndex: idx >= 0 ? idx : 0,
        nextSongIndex: pickedSecond.baseIndex >= 0 ? pickedSecond.baseIndex : 1,
        activeDeck,
        isTransitioning: false,
        transitionProgress: 0,
      }));
      return;
    }

    // Both decks empty — load highest-priority request (or index 0) to Deck A, and next to Deck B
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

    updateCrossfaderRef.current(0);
    if (firstSong) {
      loadTrackToDeckARef.current(firstSong, false);
    }
    if (secondSong) {
      loadTrackToDeckBRef.current(secondSong, false);
    }

    activeDeckRef.current = 'A';
    isEnabledRef.current = true;
    setAutoDJState((prev) => ({
      ...prev,
      isEnabled: true,
      currentSongIndex: pickedFirst.baseIndex >= 0 ? pickedFirst.baseIndex : 0,
      nextSongIndex: pickedSecond.baseIndex >= 0 ? pickedSecond.baseIndex : 1,
      activeDeck: 'A',
      isTransitioning: false,
      transitionProgress: 0,
    }));
  }, [isPrioritySong, pickNextSong, prioritySignature, scheduleStandbyLoad]);

  // Stop Auto DJ
  const stopAutoDJ = useCallback(() => {
    console.log('🛑 Stopping Auto DJ');

    isEnabledRef.current = false;
    isTransitioningRef.current = false;
    activeTrackWasPlayingRef.current = false;
    manualStandbyTrackRef.current = null;

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
      pendingLoadDeckRef.current = null;
    }

    bidClearingTrackerRef.current.clear();
  }, []);

  // Smoothly crossfade from active deck to the other deck (completely stable — reads live refs)
  const startTransition = useCallback(() => {
    if (isTransitioningRef.current) {
      return;
    }

    const prevActiveDeck = activeDeckRef.current;
    const nextDeck: 'A' | 'B' = prevActiveDeck === 'A' ? 'B' : 'A';
    const activeDeckData = prevActiveDeck === 'A' ? deckARef.current : deckBRef.current;
    const nextDeckData = nextDeck === 'A' ? deckARef.current : deckBRef.current;

    let nextSongToPlay = nextDeckData?.currentTrack || null;
    let needsLoadAndAutoPlay = false;

    // Self-heal if standby deck happens to be empty when transition triggers
    if (!nextSongToPlay) {
      const pickedFallback = pickNextSong(activeDeckData?.currentTrack);
      if (!pickedFallback.song) {
        console.error(`❌ Cannot transition - Deck ${nextDeck} has no track and playlist is empty!`);
        return;
      }
      nextSongToPlay = pickedFallback.song;
      needsLoadAndAutoPlay = true;
    }

    // Lock synchronously so the 250ms monitor can never double-fire startTransition()
    isTransitioningRef.current = true;

    if (pendingLoadTimeoutRef.current) {
      clearTimeout(pendingLoadTimeoutRef.current);
      pendingLoadTimeoutRef.current = null;
      pendingLoadDeckRef.current = null;
    }
    if (transitionIntervalRef.current) {
      clearInterval(transitionIntervalRef.current);
      transitionIntervalRef.current = null;
    }

    const outgoingSong = activeDeckData?.currentTrack || null;
    const incomingWasPriority = isPrioritySong(nextSongToPlay);
    const incomingLiveSong = songsRef.current.find((s) => s.id === nextSongToPlay!.id) || nextSongToPlay;
    const incomingTikTokCoins = tiktokCoinsRef.current?.[nextSongToPlay.id] || 0;
    const incomingHadTikTokRequest = incomingTikTokCoins > 0;

    // Immediately record incoming priority track as played/consumed so it NEVER loops back on top
    if (incomingWasPriority) {
      playedPriorityGuardRef.current.set(nextSongToPlay.id, {
        bid: incomingLiveSong.currentBid || 0,
        ttCoins: incomingTikTokCoins,
        at: Date.now(),
      });
    }
    if (nextSongToPlay.id && incomingHadTikTokRequest) {
      onConsumeTikTokRequestRef.current?.(nextSongToPlay.id, nextDeck);
    }

    console.log(
      `🔄 Auto DJ Transition Deck ${prevActiveDeck} → Deck ${nextDeck}: "${nextSongToPlay.title}" (${
        incomingWasPriority ? 'PRIORITY REQUEST' : 'REGULAR'
      })`
    );

    setAutoDJState((prev) => ({
      ...prev,
      isTransitioning: true,
      transitionProgress: 0,
    }));

    // Start playing the incoming deck immediately for seamless overlap (explicit playDeck — never stale toggle!)
    if (needsLoadAndAutoPlay) {
      if (nextDeck === 'B') {
        loadTrackToDeckBRef.current(nextSongToPlay, true);
      } else {
        loadTrackToDeckARef.current(nextSongToPlay, true);
      }
    } else if (nextDeck === 'B') {
      playDeckBRef.current();
    } else {
      playDeckARef.current();
    }

    // Update Firestore song status + clear bid once the incoming deck starts
    const songForBidCheck = nextSongToPlay;
    setTimeout(() => {
      const targetNow = nextDeck === 'B' ? deckBRef.current : deckARef.current;
      if (targetNow.isPlaying) {
        triggerBidClearing(songForBidCheck, `Auto DJ Transition to ${nextDeck}`);
      } else {
        // Retry play once in case audio needed an extra beat to buffer
        if (nextDeck === 'B') {
          playDeckBRef.current();
        } else {
          playDeckARef.current();
        }
      }
    }, 900);

    // Smooth crossfader animation using live crossfader & crossfadeSpeed refs
    const startCrossfader = crossfaderRef.current;
    const targetCrossfader = prevActiveDeck === 'A' ? 100 : 0;
    const crossfadeSteps = Math.max(20, Math.round(crossfadeSpeedRef.current * 10));
    let currentStep = 0;

    transitionIntervalRef.current = setInterval(() => {
      currentStep++;
      const progress = Math.min(currentStep / crossfadeSteps, 1);

      if (progress >= 1) {
        if (transitionIntervalRef.current) {
          clearInterval(transitionIntervalRef.current);
          transitionIntervalRef.current = null;
        }

        updateCrossfaderRef.current(targetCrossfader);

        // Mark outgoing song as played BEFORE pausing prevActiveDeck so it never flips back to 'loaded'
        if (outgoingSong?.id) {
          const outgoingLive = songsRef.current.find((s) => s.id === outgoingSong.id) || outgoingSong;
          const outgoingTt = tiktokCoinsRef.current?.[outgoingSong.id] || 0;
          if ((outgoingLive.currentBid || 0) > 0 || outgoingTt > 0) {
            playedPriorityGuardRef.current.set(outgoingSong.id, {
              bid: outgoingLive.currentBid || 0,
              ttCoins: outgoingTt,
              at: Date.now(),
            });
          }
          onFinishTikTokRequestRef.current?.(outgoingSong.id);
        }

        // Explicitly pause the previous deck (idempotent — will NEVER accidentally unpause it)
        if (prevActiveDeck === 'A') {
          pauseDeckARef.current();
        } else {
          pauseDeckBRef.current();
        }

        const newActiveDeck = nextDeck;
        const newStandbyDeck: 'A' | 'B' = newActiveDeck === 'A' ? 'B' : 'A';
        const playlist = basePlaylistRef.current;
        const playingBaseIndex = playlist.findIndex((s) => s.id === songForBidCheck.id);

        // Only advance the regular-playlist cursor for regular tracks (or if a request happened to be the next slot)
        const currentAnchorIdx = lastRegularSongIdRef.current
          ? playlist.findIndex((s) => s.id === lastRegularSongIdRef.current)
          : lastRegularIndexRef.current;
        const expectedNextRegularIdx =
          playlist.length > 0 && currentAnchorIdx >= 0
            ? (currentAnchorIdx + 1) % playlist.length
            : -1;

        if (incomingWasPriority && playingBaseIndex !== expectedNextRegularIdx) {
          currentPlayingPriorityTrackIdRef.current = songForBidCheck.id;
        } else {
          currentPlayingPriorityTrackIdRef.current = incomingWasPriority ? songForBidCheck.id : null;
          lastRegularSongIdRef.current = songForBidCheck.id;
          if (playingBaseIndex >= 0) {
            lastRegularIndexRef.current = playingBaseIndex;
          }
        }

        // Build a synchronously cleaned coins map excluding both active & just-finished songs
        const cleanedCoinsMap: Record<string, number> = { ...(tiktokCoinsRef.current || {}) };
        delete cleanedCoinsMap[songForBidCheck.id];
        if (outgoingSong?.id) {
          delete cleanedCoinsMap[outgoingSong.id];
        }

        // Pick the upcoming track (excluding both the new active song and the outgoing song that just finished)
        const pickedUpcoming = pickNextSong(songForBidCheck, {
          excludeIds: [songForBidCheck.id, ...(outgoingSong?.id ? [outgoingSong.id] : [])],
          coinsMap: cleanedCoinsMap,
        });
        const upcomingSong = pickedUpcoming.song;

        manualStandbyTrackRef.current = null;
        activeDeckRef.current = newActiveDeck;
        activeTrackWasPlayingRef.current = true;
        isTransitioningRef.current = false;

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
          scheduleStandbyLoad(newStandbyDeck, upcomingSong, 350);
        }
      } else {
        const newCrossfaderValue = startCrossfader + (targetCrossfader - startCrossfader) * progress;
        updateCrossfaderRef.current(Math.round(newCrossfaderValue));

        setAutoDJState((prev) => ({
          ...prev,
          transitionProgress: progress * 100,
        }));
      }
    }, 100);
  }, [isPrioritySong, pickNextSong, scheduleStandbyLoad, triggerBidClearing]);

  const startTransitionRef = useRef(startTransition);
  startTransitionRef.current = startTransition;

  // Smart active-deck adoption: if the DJ manually starts the other deck while active deck is paused,
  // adopt that deck instead of fighting the DJ and playing the old song!
  useEffect(() => {
    if (!autoDJState.isEnabled || autoDJState.isTransitioning) return;

    if (autoDJState.activeDeck === 'A' && !deckA.isPlaying && deckB.isPlaying) {
      console.log('🎛️ Auto DJ adopting Deck B as active deck');
      activeDeckRef.current = 'B';
      activeTrackWasPlayingRef.current = true;
      if (crossfaderRef.current < 15) {
        updateCrossfaderRef.current(100);
      }
      setAutoDJState((prev) => (prev.activeDeck === 'B' ? prev : { ...prev, activeDeck: 'B' }));
    } else if (autoDJState.activeDeck === 'B' && !deckB.isPlaying && deckA.isPlaying) {
      console.log('🎛️ Auto DJ adopting Deck A as active deck');
      activeDeckRef.current = 'A';
      activeTrackWasPlayingRef.current = true;
      if (crossfaderRef.current > 85) {
        updateCrossfaderRef.current(0);
      }
      setAutoDJState((prev) => (prev.activeDeck === 'A' ? prev : { ...prev, activeDeck: 'A' }));
    }
  }, [autoDJState.isEnabled, autoDJState.isTransitioning, autoDJState.activeDeck, deckA.isPlaying, deckB.isPlaying]);

  // Unstarvable track progress monitor: NEVER depends on timeupdate/position/callback identity churn!
  useEffect(() => {
    if (!autoDJState.isEnabled || autoDJState.isTransitioning) {
      return;
    }

    monitorIntervalRef.current = setInterval(() => {
      if (!isEnabledRef.current || isTransitioningRef.current) return;

      const activeDeck = activeDeckRef.current;
      const activeDeckData = activeDeck === 'A' ? deckARef.current : deckBRef.current;
      const otherDeckData = activeDeck === 'A' ? deckBRef.current : deckARef.current;

      if (activeDeckData?.isPlaying) {
        activeTrackWasPlayingRef.current = true;
      }

      const duration = activeDeckData?.duration || 0;
      const position = activeDeckData?.position || 0;
      if (duration <= 0 || !activeDeckData?.currentTrack) return;

      const timeRemaining = Math.max(0, duration - position);
      const threshold = transitionDurationRef.current;

      // 1. Normal smooth crossfade when approaching the end of the playing track
      const shouldSmoothTransition =
        Boolean(activeDeckData.isPlaying) && timeRemaining > 0 && timeRemaining <= threshold;

      // 2. Track reached the very end (including if HTML5 'ended' fired right before the tick)
      const trackEndedNaturally =
        activeTrackWasPlayingRef.current &&
        !activeDeckData.isPlaying &&
        !otherDeckData?.isPlaying &&
        position >= Math.max(1, duration - 2);

      // 3. Force transition if playing and <= 3s remaining
      const isForceTransition = Boolean(activeDeckData.isPlaying) && timeRemaining <= 3;

      if (shouldSmoothTransition || trackEndedNaturally || isForceTransition) {
        startTransitionRef.current();
      }
    }, 250);

    return () => {
      if (monitorIntervalRef.current) {
        clearInterval(monitorIntervalRef.current);
        monitorIntervalRef.current = null;
      }
    };
  }, [autoDJState.isEnabled, autoDJState.isTransitioning]);

  // --- Robust 45s Play Timer for Bid Clearing ---
  const activeTrackId = activeDeckTrack?.id || '';
  useEffect(() => {
    if (!autoDJState.isEnabled || !activeTrackId) return;

    const liveSong = songsRef.current.find((s) => s.id === activeTrackId) || activeDeckTrack;
    if (!liveSong || !liveSong.currentBid || liveSong.currentBid <= 0) return;

    if (bidClearedRef.current !== liveSong.id) {
      playbackTimeRef.current = 0;
      bidClearedRef.current = null;
    }

    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
    }

    playbackIntervalRef.current = setInterval(() => {
      const latestDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
      if (latestDeck.isPlaying) {
        playbackTimeRef.current += 1;
        if (playbackTimeRef.current >= 45 && bidClearedRef.current !== liveSong.id) {
          triggerBidClearing(liveSong, '45s Play Timer', true);
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
  }, [autoDJState.isEnabled, activeTrackId, activeDeckTrack, triggerBidClearing]);

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
    if (!isEnabledRef.current) return;
    startTransitionRef.current();
  }, []);

  const updateTransitionDuration = useCallback((seconds: number) => {
    const clamped = Math.max(5, Math.min(30, seconds));
    transitionDurationRef.current = clamped;
    setAutoDJState((prev) => ({
      ...prev,
      transitionDuration: clamped,
    }));
  }, []);

  const updateCrossfadeSpeed = useCallback((seconds: number) => {
    const clamped = Math.max(2, Math.min(15, seconds));
    crossfadeSpeedRef.current = clamped;
    setAutoDJState((prev) => ({
      ...prev,
      crossfadeSpeed: clamped,
    }));
  }, []);

  return {
    autoDJState,
    currentSong,
    nextSong,
    startAutoDJ,
    stopAutoDJ,
    skipToNext,
    notifyManualDeckLoad,
    updateTransitionDuration,
    updateCrossfadeSpeed,
    timeRemaining: getCurrentTrackTimeRemaining(),
  };
};
