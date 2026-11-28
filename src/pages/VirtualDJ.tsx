import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMusicPlayer } from '@/hooks/useMusicPlayer';
import { useAudioLogic } from '@/hooks/useAudioLogic';
import { useAutoDJ } from '@/hooks/useAutoDJ';
import { useTikTokLive } from '@/hooks/useTikTokLive';
import { useAIMC } from '@/hooks/useAIMC';
import { usePioneerController } from '@/hooks/usePioneerController';
import { useAuth } from '@/contexts/AuthContext';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { resetDeckA, resetDeckB } from '@/store/slices/musicPlayerSlice';
import type { Song } from '@/Types';

// Import VirtualDJ Components
import DJHeader from '@/components/virtualDJ/DJHeader';
import DeckA from '@/components/virtualDJ/DeckA';
import DeckB from '@/components/virtualDJ/DeckB';
import MixerPanel from '@/components/virtualDJ/MixerPanel';
import MusicLibrary from '@/components/virtualDJ/MusicLibrary';
import AutoDJPanel from '@/components/virtualDJ/AutoDJPanel';
import TikTokLiveModal from '@/components/virtualDJ/TikTokLiveModal';
import AIMCModal from '@/components/virtualDJ/AIMCModal';
import PioneerHardwareModal from '@/components/virtualDJ/PioneerHardwareModal';
// import AirDJHUD from '@/components/virtualDJ/AirDJHUD';
import { getSecretKeys } from '@/api';
import { setSecrets } from '@/store/slices/globalVariables';

const VirtualDJ = () => {
  const { user, isAuthenticated, openLoginModal } = useAuth();
  const dispatch = useDispatch();
  const {
    // State
    deckA,
    deckB,
    crossfader,
    masterVolume,
    deckAEQ,
    deckBEQ,
    djSongs,
    isLoadingSongs,
    bpmA,
    bpmB,
    isSynced,

    // Controls
    loadTrackToDeckA,
    loadTrackToDeckB,
    playDeckA,
    playDeckB,
    pauseDeckA,
    pauseDeckB,
    stopDeckA,
    stopDeckB,
    toggleDeckA,
    toggleDeckB,
    updateDeckAVolume,
    updateDeckBVolume,
    updateMasterVolume,
    updateCrossfader,
    updateDeckAEQ,
    updateDeckBEQ,
    updateDeckAEffects,
    updateDeckBEffects,
    updateDeckADelay,
    updateDeckAReverb,
    updateDeckBDelay,
    updateDeckBReverb,
    toggleRecording,
    syncBPM,
    unsyncBPM,

    // Effect toggles
    toggleDeckAEcho,
    toggleDeckBEcho,
    toggleDeckAReverb,
    toggleDeckBReverb,

    // Effect states
    deckAEffects,
    deckBEffects,

    // Loop and Cue controls for Deck A
    setDeckALoopIn,
    setDeckALoopOut,
    toggleDeckALoop,
    setDeckACuePoint,
    jumpToDeckACue,
    beatJumpDeckA,

    // Loop and Cue controls for Deck B
    setDeckBLoopIn,
    setDeckBLoopOut,
    toggleDeckBLoop,
    setDeckBCuePoint,
    jumpToDeckBCue,
    beatJumpDeckB,

    // Sound Effects
    playSoundEffect,

    // Pioneer Hardware Jog, Pitch, Headphone Cue (PFL) & Multi-Channel Audio Routing
    nudgeDeckA,
    nudgeDeckB,
    setDeckAPitch,
    setDeckBPitch,
    deckACueEnabled,
    deckBCueEnabled,
    toggleDeckACue,
    toggleDeckBCue,
    cueVolume,
    updateCueVolume,
    audioRoutingMode,
    setAudioRoutingMode,
    audioOutputDevices,
    masterOutputDeviceId,
    cueOutputDeviceId,
    setMasterOutputDevice,
    setCueOutputDevice,
    refreshAudioDevices,
    maxOutputChannels,
    audioRoutingError,
    setTalkoverDuck,
  } = useMusicPlayer();

  // Audio logic for song status updates & PlayMyJam bid settlement
  const { handleSongUpdate, clearCurrentBid } = useAudioLogic(djSongs || []);

  // Disco lights toggle state
  const [discoLightsEnabled, setDiscoLightsEnabled] = useState(true);
  // Air DJ motion control state
  const [airDJEnabled, setAirDJEnabled] = useState(false);
  // Auto DJ modal state
  const [showAutoDJModal, setShowAutoDJModal] = useState(false);
  // TikTok Live Gifts & Chats modal state
  const [showTikTokModal, setShowTikTokModal] = useState(false);
  const [isTikTokModalCollapsed, setIsTikTokModalCollapsed] = useState(false);
  // AI MC Studio modal state
  const [showAIMCModal, setShowAIMCModal] = useState(false);
  const [isTikTokConnectedForMC, setIsTikTokConnectedForMC] = useState(false);
  const [tikTokHostHandleForMC, setTikTokHostHandleForMC] = useState('');
  // Pioneer DJ / MIDI Hardware modal state
  const [showHardwareModal, setShowHardwareModal] = useState(false);

  const handleOpenTikTokModal = () => {
    setShowTikTokModal(true);
    setIsTikTokModalCollapsed(false);
  };

  // Live refs so enhancedToggleDeckA/B stay referentially stable across timeupdate ticks
  const deckAStateRef = useRef(deckA);
  const deckBStateRef = useRef(deckB);
  const notifyManualDeckLoadRef = useRef<((deck: 'A' | 'B', songId: string) => void) | null>(null);
  const consumeTikTokRequestRef = useRef<((songId: string, deck?: 'A' | 'B') => void) | null>(null);
  deckAStateRef.current = deckA;
  deckBStateRef.current = deckB;

  const handleManualLoadDeckA = useCallback(
    (song: Song, autoPlay = false) => {
      notifyManualDeckLoadRef.current?.('A', song.id);
      loadTrackToDeckA(song, autoPlay);
    },
    [loadTrackToDeckA]
  );

  const handleManualLoadDeckB = useCallback(
    (song: Song, autoPlay = false) => {
      notifyManualDeckLoadRef.current?.('B', song.id);
      loadTrackToDeckB(song, autoPlay);
    },
    [loadTrackToDeckB]
  );

  // Play a TikTok-requested song immediately on the chosen or idle deck
  const playTikTokSongNow = useCallback(
    (song: Song, preferredDeck?: 'A' | 'B'): 'A' | 'B' => {
      const targetDeck: 'A' | 'B' =
        preferredDeck ?? (!deckAStateRef.current?.isPlaying ? 'A' : !deckBStateRef.current?.isPlaying ? 'B' : 'A');

      if (targetDeck === 'A') {
        if (deckBStateRef.current?.isPlaying) {
          pauseDeckB();
        }
        if (crossfader > 60) {
          updateCrossfader(0);
        }
        consumeTikTokRequestRef.current?.(song.id, 'A');
        handleManualLoadDeckA(song, true);
        return 'A';
      }

      if (deckAStateRef.current?.isPlaying) {
        pauseDeckA();
      }
      if (crossfader < 40) {
        updateCrossfader(100);
      }
      consumeTikTokRequestRef.current?.(song.id, 'B');
      handleManualLoadDeckB(song, true);
      return 'B';
    },
    [
      crossfader,
      pauseDeckA,
      pauseDeckB,
      updateCrossfader,
      handleManualLoadDeckA,
      handleManualLoadDeckB,
    ]
  );

  // TikTok Live Connector (Gifts, Chats & Gift-Backed Song Requests on PlayMyJam server songs)
  const tiktokDeckState = useMemo(
    () => ({
      deckATrackId: deckA?.currentTrack?.id,
      deckAPlaying: Boolean(deckA?.isPlaying),
      deckAPosition: deckA?.position || 0,
      deckADuration: deckA?.duration || 0,
      deckBTrackId: deckB?.currentTrack?.id,
      deckBPlaying: Boolean(deckB?.isPlaying),
      deckBPosition: deckB?.position || 0,
      deckBDuration: deckB?.duration || 0,
    }),
    [
      deckA?.currentTrack?.id,
      deckA?.isPlaying,
      deckA?.position,
      deckA?.duration,
      deckB?.currentTrack?.id,
      deckB?.isPlaying,
      deckB?.position,
      deckB?.duration,
    ]
  );

  const djOwnerId = user?.userId || '';
  const djFolderName = (user?.djInfo?.djName || user?.fname || user?.userId || 'dj_guest')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);

  // Stop & unload a deck immediately if the DJ rejects a song that is playing or cued
  const stopRejectedSong = useCallback(
    (songId: string) => {
      if (deckA?.currentTrack?.id === songId) {
        stopDeckA();
        dispatch(resetDeckA());
      }
      if (deckB?.currentTrack?.id === songId) {
        stopDeckB();
        dispatch(resetDeckB());
      }
    },
    [deckA?.currentTrack?.id, deckB?.currentTrack?.id, stopDeckA, stopDeckB, dispatch]
  );

  // Determine active playing track for AI MC Q&A ("what song is this?") and track shoutouts
  const activePlayingTrack = useMemo(() => {
    const trackA = deckA?.currentTrack;
    const trackB = deckB?.currentTrack;
    if (deckA?.isPlaying && deckB?.isPlaying && trackA && trackB) {
      const chosen = crossfader > 55 ? trackB : trackA;
      return { id: chosen.id, title: chosen.title, artist: chosen.artist };
    }
    if (deckA?.isPlaying && trackA) {
      return { id: trackA.id, title: trackA.title, artist: trackA.artist };
    }
    if (deckB?.isPlaying && trackB) {
      return { id: trackB.id, title: trackB.title, artist: trackB.artist };
    }
    const fallback = trackA || trackB;
    return fallback ? { id: fallback.id, title: fallback.title, artist: fallback.artist } : null;
  }, [deckA?.isPlaying, deckA?.currentTrack, deckB?.isPlaying, deckB?.currentTrack, crossfader]);

  const djDisplayName = user?.djInfo?.djName || user?.fname || 'DJ';
  const geminiApiKey = useSelector(
    (state: RootState) => state.globalVariables?.secrets?.GEMINI_API_KEY || ''
  );

  // AI MC Live Host (Real-time Gemini Live Native Audio WebSocket + Credit Protections + Auto-Ducking)
  const aiMC = useAIMC({
    djName: djDisplayName,
    hostHandle: tikTokHostHandleForMC,
    geminiApiKey,
    isModalOpen: showAIMCModal,
    isTikTokConnected: isTikTokConnectedForMC,
    currentTrack: activePlayingTrack,
    onDuckMusic: setTalkoverDuck,
  });

  const tiktokLive = useTikTokLive({
    songs: djSongs || [],
    ownerId: djOwnerId,
    userFolder: djFolderName,
    djName: djDisplayName,
    deckState: tiktokDeckState,
    onAutoPlayRequest: (song) => playTikTokSongNow(song),
    onStopSong: stopRejectedSong,
    onPlaySoundEffect: playSoundEffect,
    onMemberJoin: aiMC.handleMemberJoin,
    onViewerChat: aiMC.handleViewerChat,
    onFinalGift: aiMC.handleFinalGift,
    onSocialEvent: aiMC.handleSocialEvent,
    onSongRequestFeedback: aiMC.handleSongRequestFeedback,
  });

  consumeTikTokRequestRef.current = tiktokLive.consumeSongRequest;

  useEffect(() => {
    setIsTikTokConnectedForMC(tiktokLive.isConnected);
    setTikTokHostHandleForMC(tiktokLive.status.uniqueId || tiktokLive.config.username || '');
  }, [tiktokLive.isConnected, tiktokLive.status.uniqueId, tiktokLive.config.username]);

  // Reset decks on page load to prevent state/audio desync
  useEffect(() => {
    console.log('🎵 VirtualDJ page loaded - resetting deck states');
    dispatch(resetDeckA());
    dispatch(resetDeckB());
  }, []); // Only run once on mount

  useEffect(() => {
    (async () => {
      const secrets = await getSecretKeys();
      if (secrets?.length > 0) {
        dispatch(setSecrets(secrets[0]))
      }
    })()
  }, [])
  // Listen for scratch sound effects from vinyl interaction
  useEffect(() => {
    const handleScratchEffect = () => {
      console.log('🎵 Scratch event received, playing scratch sound');
      playSoundEffect('scratch');
    };

    window.addEventListener('playScratchEffect', handleScratchEffect);

    return () => {
      window.removeEventListener('playScratchEffect', handleScratchEffect);
    };
  }, [playSoundEffect]);

  // Prevent scrolling when VirtualDJ is mounted
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Stable enhanced toggle functions that update song status without churning dependencies on every timeupdate
  const enhancedToggleDeckA = useCallback(async () => {
    const current = deckAStateRef.current;
    const wasPlaying = current?.isPlaying;
    const currentTrack = current?.currentTrack;

    toggleDeckA();

    if (currentTrack) {
      const action = wasPlaying ? 'pause' : 'play';
      const position = current?.position || 0;
      await handleSongUpdate(currentTrack, action, position);
    }
  }, [toggleDeckA, handleSongUpdate]);

  const enhancedToggleDeckB = useCallback(async () => {
    const current = deckBStateRef.current;
    const wasPlaying = current?.isPlaying;
    const currentTrack = current?.currentTrack;

    toggleDeckB();

    if (currentTrack) {
      const action = wasPlaying ? 'pause' : 'play';
      const position = current?.position || 0;
      await handleSongUpdate(currentTrack, action, position);
    }
  }, [toggleDeckB, handleSongUpdate]);

  const tiktokQueuedSongs = useMemo(
    () => tiktokLive.activeSongRequests.map((r) => r.song),
    [tiktokLive.activeSongRequests]
  );

  // Auto DJ functionality (safely prioritizes TikTok/AI requests in memory without mutating Firestore)
  const autoDJ = useAutoDJ({
    songs: djSongs || [],
    deckA,
    deckB,
    loadTrackToDeckA,
    loadTrackToDeckB,
    playDeckA,
    pauseDeckA,
    playDeckB,
    pauseDeckB,
    toggleDeckA: enhancedToggleDeckA,
    toggleDeckB: enhancedToggleDeckB,
    updateCrossfader,
    crossfader,
    handleSongUpdate,
    onClearSongBid: clearCurrentBid,
    tiktokRequestCoinsBySongId: tiktokLive.tiktokRequestCoinsBySongId,
    tiktokQueuedSongs,
    onConsumeTikTokRequest: tiktokLive.consumeSongRequest,
    onFinishTikTokRequest: tiktokLive.markSongRequestPlayed,
  });

  notifyManualDeckLoadRef.current = autoDJ.notifyManualDeckLoad;

  // Load the top priority TikTok/PlayMyJam track onto a deck (triggered by Pioneer Load A / Load B buttons)
  const loadTopQueueTrackToDeck = useCallback(
    (deck: 'A' | 'B') => {
      const otherTrackId = deck === 'A' ? deckB?.currentTrack?.id : deckA?.currentTrack?.id;
      const currentTrackId = deck === 'A' ? deckA?.currentTrack?.id : deckB?.currentTrack?.id;
      const library = djSongs || [];
      const fallbackDistinct =
        library.find((s) => s.id !== otherTrackId && s.id !== currentTrackId) ||
        library.find((s) => s.id !== otherTrackId) ||
        library[0] ||
        null;

      const candidate =
        (tiktokLive.nextQueuedRequest?.song &&
        tiktokLive.nextQueuedRequest.song.id !== otherTrackId
          ? tiktokLive.nextQueuedRequest.song
          : null) ||
        (autoDJ.nextSong && autoDJ.nextSong.id !== otherTrackId ? autoDJ.nextSong : null) ||
        fallbackDistinct;

      if (!candidate) return;
      if (deck === 'A') {
        handleManualLoadDeckA(candidate);
      } else {
        handleManualLoadDeckB(candidate);
      }
      if (tiktokLive.nextQueuedRequest?.song?.id === candidate.id) {
        tiktokLive.markSongRequestLoaded(candidate.id, deck);
      }
    },
    [
      deckA?.currentTrack?.id,
      deckB?.currentTrack?.id,
      tiktokLive,
      autoDJ.nextSong,
      djSongs,
      handleManualLoadDeckA,
      handleManualLoadDeckB,
    ]
  );

  // Pioneer DJ USB Controllers & Club CDJ (MIDI Mode) Integration
  const pioneerController = usePioneerController(
    {
      toggleDeckA: () => void enhancedToggleDeckA(),
      cueDeckA: () => {
        if (deckA?.isPlaying) {
          pauseDeckA();
          jumpToDeckACue?.();
        } else {
          setDeckACuePoint?.(deckA?.position || 0);
        }
      },
      toggleSyncA: () => (isSynced ? unsyncBPM() : syncBPM()),
      togglePflA: toggleDeckACue,
      setDeckAVolume: updateDeckAVolume,
      setDeckAEQ: updateDeckAEQ,
      setDeckAPitch,
      nudgeDeckA,
      loopInDeckA: () => setDeckALoopIn?.(deckA?.position || 0),
      loopOutDeckA: () => setDeckALoopOut?.(deckA?.position || 0),
      loopToggleDeckA: () => toggleDeckALoop?.(),
      beatJumpDeckA: (beats) => beatJumpDeckA?.(beats),
      toggleEchoDeckA: toggleDeckAEcho,
      toggleReverbDeckA: toggleDeckAReverb,
      loadNextToDeckA: () => loadTopQueueTrackToDeck('A'),

      toggleDeckB: () => void enhancedToggleDeckB(),
      cueDeckB: () => {
        if (deckB?.isPlaying) {
          pauseDeckB();
          jumpToDeckBCue?.();
        } else {
          setDeckBCuePoint?.(deckB?.position || 0);
        }
      },
      toggleSyncB: () => (isSynced ? unsyncBPM() : syncBPM()),
      togglePflB: toggleDeckBCue,
      setDeckBVolume: updateDeckBVolume,
      setDeckBEQ: updateDeckBEQ,
      setDeckBPitch,
      nudgeDeckB,
      loopInDeckB: () => setDeckBLoopIn?.(deckB?.position || 0),
      loopOutDeckB: () => setDeckBLoopOut?.(deckB?.position || 0),
      loopToggleDeckB: () => toggleDeckBLoop?.(),
      beatJumpDeckB: (beats) => beatJumpDeckB?.(beats),
      toggleEchoDeckB: toggleDeckBEcho,
      toggleReverbDeckB: toggleDeckBReverb,
      loadNextToDeckB: () => loadTopQueueTrackToDeck('B'),

      setCrossfader: updateCrossfader,
      setMasterVolume: updateMasterVolume,
      setCueVolume: updateCueVolume,
      playSoundEffect,
    },
    {
      deckAPlaying: Boolean(deckA?.isPlaying),
      deckBPlaying: Boolean(deckB?.isPlaying),
      deckACueEnabled,
      deckBCueEnabled,
      isSynced: Boolean(isSynced),
    }
  );

  // When Auto DJ is OFF and a deck finishes a track naturally, play the next queued TikTok request if Auto-Play is enabled
  const prevDeckPlayingRef = useRef({ a: false, b: false });
  useEffect(() => {
    const aPlaying = Boolean(deckA?.isPlaying);
    const bPlaying = Boolean(deckB?.isPlaying);
    const prev = prevDeckPlayingRef.current;

    const aEndedNaturally =
      prev.a && !aPlaying && (deckA?.duration || 0) > 0 && (deckA?.position || 0) >= (deckA?.duration || 0) - 1.5;
    const bEndedNaturally =
      prev.b && !bPlaying && (deckB?.duration || 0) > 0 && (deckB?.position || 0) >= (deckB?.duration || 0) - 1.5;

    prevDeckPlayingRef.current = { a: aPlaying, b: bPlaying };

    if (aEndedNaturally && deckA?.currentTrack?.id) {
      tiktokLive.markSongRequestPlayed(deckA.currentTrack.id);
    }
    if (bEndedNaturally && deckB?.currentTrack?.id) {
      tiktokLive.markSongRequestPlayed(deckB.currentTrack.id);
    }

    if (
      !autoDJ.autoDJState.isEnabled &&
      tiktokLive.config.autoPlayRequests &&
      tiktokLive.nextQueuedRequest &&
      !aPlaying &&
      !bPlaying
    ) {
      if (aEndedNaturally && tiktokLive.nextQueuedRequest.song.id !== deckA?.currentTrack?.id) {
        playTikTokSongNow(tiktokLive.nextQueuedRequest.song, 'B');
      } else if (bEndedNaturally && tiktokLive.nextQueuedRequest.song.id !== deckB?.currentTrack?.id) {
        playTikTokSongNow(tiktokLive.nextQueuedRequest.song, 'A');
      }
    }
  }, [
    deckA?.currentTrack?.id,
    deckA?.isPlaying,
    deckA?.position,
    deckA?.duration,
    deckB?.currentTrack?.id,
    deckB?.isPlaying,
    deckB?.position,
    deckB?.duration,
    autoDJ.autoDJState.isEnabled,
    tiktokLive.isConnected,
    tiktokLive.config.autoPlayRequests,
    tiktokLive.nextQueuedRequest,
    tiktokLive.markSongRequestPlayed,
    playTikTokSongNow,
  ]);

  // Wait for persisted auth state to rehydrate before prompting login once (allow dismissing to use Local/TikTok Studio)
  const isPersistedRehydrated = useSelector((state: RootState) => Boolean(state._persist?.rehydrated));
  const promptedLoginRef = useRef(false);
  useEffect(() => {
    if (!isPersistedRehydrated) return;
    if (!isAuthenticated && !promptedLoginRef.current) {
      promptedLoginRef.current = true;
      openLoginModal();
    }
  }, [isPersistedRehydrated, isAuthenticated, openLoginModal]);

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-[#222240] via-[#3a3a6a] to-[#222240] select-none">
        {/* Background Effects */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl animate-float"></div>
          <div className="absolute top-40 right-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl animate-float" style={{ animationDelay: '2s' }}></div>
          <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl animate-float" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="relative z-10 flex flex-col h-screen">
          {/* Header */}
          <DJHeader
            discoLightsEnabled={discoLightsEnabled}
            onToggleDiscoLights={setDiscoLightsEnabled}
            isTikTokConnected={tiktokLive.isConnected}
            tiktokViewerCount={tiktokLive.viewerCount}
            onOpenTikTokModal={handleOpenTikTokModal}
            isAIMCEnabled={aiMC.config.enabled}
            isAIMCSpeaking={aiMC.isSpeaking || aiMC.isGenerating}
            onOpenAIMCModal={() => setShowAIMCModal(true)}
            isHardwareConnected={pioneerController.isHardwareConnected}
            hardwareDeviceName={pioneerController.primaryDevice?.name}
            onOpenHardwareModal={() => setShowHardwareModal(true)}
            isAutoDJEnabled={autoDJ.autoDJState.isEnabled}
            isAutoDJTransitioning={autoDJ.autoDJState.isTransitioning}
            onOpenAutoDJModal={() => setShowAutoDJModal(true)}
            airDJEnabled={airDJEnabled}
            onToggleAirDJ={setAirDJEnabled}
          />

          {/* Main DJ Interface */}
          <div className="flex-1 h-0 px-6">
            <div className="grid lg:grid-cols-4 gap-4 h-full">
              {/* Left Deck */}
              <div className="h-full overflow-auto hide-scrollbar rounded-[5px]">
                <DeckA
                  deckA={deckA}
                  bpmA={bpmA}
                  deckAEQ={deckAEQ}
                  deckAEffects={deckAEffects}
                  toggleDeckA={enhancedToggleDeckA}
                  updateDeckAVolume={updateDeckAVolume}
                  updateDeckAEQ={updateDeckAEQ}
                  toggleDeckAReverb={toggleDeckAReverb}
                  toggleDeckAEcho={toggleDeckAEcho}
                  setLoopIn={setDeckALoopIn}
                  setLoopOut={setDeckALoopOut}
                  toggleLoop={toggleDeckALoop}
                  setCuePoint={setDeckACuePoint}
                  jumpToCue={jumpToDeckACue}
                  beatJump={beatJumpDeckA}
                  discoLightsEnabled={discoLightsEnabled}
                  onLoadTrack={handleManualLoadDeckA}
                />
              </div>

              {/* Center Mixer */}
              <div className="h-full overflow-auto hide-scrollbar rounded-[5px]">
                <MixerPanel
                  crossfader={crossfader}
                  masterVolume={masterVolume}
                  isSynced={isSynced || false}
                  updateCrossfader={updateCrossfader}
                  updateMasterVolume={updateMasterVolume}
                  syncBPM={syncBPM}
                  unsyncBPM={unsyncBPM}
                  playSoundEffect={playSoundEffect}
                  deckAEffects={deckAEffects}
                  updateDeckAEffects={updateDeckAEffects}
                  updateDeckADelay={updateDeckADelay}
                  updateDeckAReverb={updateDeckAReverb}
                />
              </div>

              {/* Music Library */}
              <div className="h-full overflow-auto hide-scrollbar rounded-[5px]">
                <MusicLibrary
                  songs={djSongs || []}
                  isLoadingSongs={isLoadingSongs}
                  loadTrackToDeckA={handleManualLoadDeckA}
                  loadTrackToDeckB={handleManualLoadDeckB}
                  tiktokRequestCoinsBySongId={tiktokLive.tiktokRequestCoinsBySongId}
                  ownerId={djOwnerId}
                  userFolder={djFolderName}
                />
              </div>

              {/* Right Deck */}
              <div className="h-full overflow-auto hide-scrollbar rounded-[5px]">
                <DeckB
                  deckB={deckB}
                  bpmB={bpmB}
                  deckBEQ={deckBEQ}
                  deckBEffects={deckBEffects}
                  toggleDeckB={enhancedToggleDeckB}
                  updateDeckBVolume={updateDeckBVolume}
                  updateDeckBEQ={updateDeckBEQ}
                  updateDeckBEffects={updateDeckBEffects}
                  updateDeckBDelay={updateDeckBDelay}
                  updateDeckBReverb={updateDeckBReverb}
                  toggleDeckBReverb={toggleDeckBReverb}
                  toggleDeckBEcho={toggleDeckBEcho}
                  setLoopIn={setDeckBLoopIn}
                  setLoopOut={setDeckBLoopOut}
                  toggleLoop={toggleDeckBLoop}
                  setCuePoint={setDeckBCuePoint}
                  jumpToCue={jumpToDeckBCue}
                  beatJump={beatJumpDeckB}
                  discoLightsEnabled={discoLightsEnabled}
                  onLoadTrack={handleManualLoadDeckB}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Auto DJ Centered Modal */}
        <AutoDJPanel
          isOpen={showAutoDJModal}
          onClose={() => setShowAutoDJModal(false)}
          autoDJState={autoDJ.autoDJState}
          currentSong={autoDJ.currentSong}
          nextSong={autoDJ.nextSong}
          timeRemaining={autoDJ.timeRemaining}
          pendingRequestsCount={tiktokLive.activeSongRequests.length}
          startAutoDJ={autoDJ.startAutoDJ}
          stopAutoDJ={autoDJ.stopAutoDJ}
          skipToNext={autoDJ.skipToNext}
          updateTransitionDuration={autoDJ.updateTransitionDuration}
          updateCrossfadeSpeed={autoDJ.updateCrossfadeSpeed}
        />

        {/* TikTok LIVE Gifts, Chats & Song Requests Modal */}
        <TikTokLiveModal
          isOpen={showTikTokModal}
          isCollapsed={isTikTokModalCollapsed}
          onToggleCollapse={() => setIsTikTokModalCollapsed((c) => !c)}
          onClose={() => {
            setShowTikTokModal(false);
            setIsTikTokModalCollapsed(false);
          }}
          live={tiktokLive}
          onPlaySongNow={(song) => playTikTokSongNow(song)}
          onLoadToDeckA={handleManualLoadDeckA}
          onLoadToDeckB={handleManualLoadDeckB}
        />

        {/* AI MC Studio Modal (Zimbabwean Hype MC + Gemini AI Voice + Offline Song Request Simulator) */}
        <AIMCModal
          isOpen={showAIMCModal}
          onClose={() => setShowAIMCModal(false)}
          aiMC={aiMC}
          isTikTokConnected={tiktokLive.isConnected}
          onOpenTikTokModal={handleOpenTikTokModal}
          onSimulateRequestComment={(viewerName, comment, grantVipCoins) => {
            if (!aiMC.config.enabled) {
              aiMC.updateConfig({ enabled: true });
            }
            if (grantVipCoins > 0) {
              tiktokLive.creditViewerCoinsSilently({
                uniqueId: viewerName,
                nickname: viewerName,
                coins: grantVipCoins,
              });
            }
            tiktokLive.simulateChat({
              uniqueId: viewerName,
              nickname: viewerName,
              comment,
            });
          }}
          activeRequestNotice={tiktokLive.lastRequestNotice?.message || ''}
          searchingQueries={tiktokLive.searchingQueries}
        />

        {/* Pioneer DJ & MIDI Hardware + 4-Ch Audio / Headphone Cue Modal */}
        <PioneerHardwareModal
          isOpen={showHardwareModal}
          onClose={() => setShowHardwareModal(false)}
          controller={pioneerController}
          audio={{
            routingMode: audioRoutingMode,
            setRoutingMode: setAudioRoutingMode,
            outputDevices: audioOutputDevices,
            masterDeviceId: masterOutputDeviceId,
            cueDeviceId: cueOutputDeviceId,
            setMasterDevice: setMasterOutputDevice,
            setCueDevice: setCueOutputDevice,
            refreshDevices: refreshAudioDevices,
            maxOutputChannels,
            routingError: audioRoutingError,
            deckACueEnabled,
            deckBCueEnabled,
            toggleDeckACue,
            toggleDeckBCue,
            cueVolume,
            updateCueVolume,
          }}
        />
      </div>
    </>
  );
};

export default VirtualDJ;
