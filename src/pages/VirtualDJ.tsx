import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMusicPlayer } from '@/hooks/useMusicPlayer';
import { useAudioLogic } from '@/hooks/useAudioLogic';
import { useAutoDJ } from '@/hooks/useAutoDJ';
import { useTikTokLive } from '@/hooks/useTikTokLive';
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
import TikTokLiveModal from '@/components/virtualDJ/TikTokLiveModal';
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
  } = useMusicPlayer();

  // Audio logic for song status updates
  const { handleSongUpdate } = useAudioLogic(djSongs || []);

  // Disco lights toggle state
  const [discoLightsEnabled, setDiscoLightsEnabled] = useState(true);
  // Air DJ motion control state
  const [airDJEnabled, setAirDJEnabled] = useState(false);
  // TikTok Live Gifts & Chats modal state
  const [showTikTokModal, setShowTikTokModal] = useState(false);
  const [isTikTokModalCollapsed, setIsTikTokModalCollapsed] = useState(false);

  const handleOpenTikTokModal = () => {
    setShowTikTokModal(true);
    setIsTikTokModalCollapsed(false);
  };

  // Play a TikTok-requested song immediately on the chosen or idle deck
  const playTikTokSongNow = useCallback(
    (song: Song, preferredDeck?: 'A' | 'B'): 'A' | 'B' => {
      const targetDeck: 'A' | 'B' =
        preferredDeck ?? (!deckA?.isPlaying ? 'A' : !deckB?.isPlaying ? 'B' : 'A');

      if (targetDeck === 'A') {
        if (deckB?.isPlaying) {
          pauseDeckB();
        }
        if (crossfader > 60) {
          updateCrossfader(0);
        }
        loadTrackToDeckA(song, true);
        return 'A';
      }

      if (deckA?.isPlaying) {
        pauseDeckA();
      }
      if (crossfader < 40) {
        updateCrossfader(100);
      }
      loadTrackToDeckB(song, true);
      return 'B';
    },
    [
      deckA?.isPlaying,
      deckB?.isPlaying,
      crossfader,
      pauseDeckA,
      pauseDeckB,
      updateCrossfader,
      loadTrackToDeckA,
      loadTrackToDeckB,
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

  const tiktokLive = useTikTokLive({
    songs: djSongs || [],
    ownerId: djOwnerId,
    userFolder: djFolderName,
    deckState: tiktokDeckState,
    onAutoPlayRequest: (song) => playTikTokSongNow(song),
    onStopSong: stopRejectedSong,
    onPlaySoundEffect: playSoundEffect,
  });

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

  // Enhanced toggle functions that update song status
  const enhancedToggleDeckA = async () => {
    const wasPlaying = deckA?.isPlaying;
    const currentTrack = deckA?.currentTrack;

    // Call the original toggle function
    toggleDeckA();

    // Update song status if there's a current track
    if (currentTrack) {
      const action = wasPlaying ? 'pause' : 'play';
      const position = deckA?.position || 0;
      await handleSongUpdate(currentTrack, action, position);
    }
  };

  const enhancedToggleDeckB = async () => {
    const wasPlaying = deckB?.isPlaying;
    const currentTrack = deckB?.currentTrack;

    // Call the original toggle function
    toggleDeckB();

    // Update song status if there's a current track
    if (currentTrack) {
      const action = wasPlaying ? 'pause' : 'play';
      const position = deckB?.position || 0;
      await handleSongUpdate(currentTrack, action, position);
    }
  };

  // Auto DJ functionality (safely prioritizes TikTok gift-backed requests in memory without mutating Firestore)
  const autoDJ = useAutoDJ({
    songs: djSongs || [],
    deckA,
    deckB,
    loadTrackToDeckA,
    loadTrackToDeckB,
    toggleDeckA: enhancedToggleDeckA,
    toggleDeckB: enhancedToggleDeckB,
    updateCrossfader,
    crossfader,
    handleSongUpdate,
    tiktokRequestCoinsBySongId: tiktokLive.tiktokRequestCoinsBySongId,
    onConsumeTikTokRequest: tiktokLive.consumeSongRequest,
  });

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

    if (
      !autoDJ.autoDJState.isEnabled &&
      tiktokLive.isConnected &&
      tiktokLive.config.autoPlayRequests &&
      tiktokLive.nextQueuedRequest &&
      !aPlaying &&
      !bPlaying
    ) {
      if (aEndedNaturally) {
        playTikTokSongNow(tiktokLive.nextQueuedRequest.song, 'B');
      } else if (bEndedNaturally) {
        playTikTokSongNow(tiktokLive.nextQueuedRequest.song, 'A');
      }
    }
  }, [
    deckA?.isPlaying,
    deckA?.position,
    deckA?.duration,
    deckB?.isPlaying,
    deckB?.position,
    deckB?.duration,
    autoDJ.autoDJState.isEnabled,
    tiktokLive.isConnected,
    tiktokLive.config.autoPlayRequests,
    tiktokLive.nextQueuedRequest,
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
            autoDJState={autoDJ.autoDJState}
            currentSong={autoDJ.currentSong}
            nextSong={autoDJ.nextSong}
            timeRemaining={autoDJ.timeRemaining}
            startAutoDJ={autoDJ.startAutoDJ}
            stopAutoDJ={autoDJ.stopAutoDJ}
            skipToNext={autoDJ.skipToNext}
            airDJEnabled={airDJEnabled}
            onToggleAirDJ={setAirDJEnabled}
            updateTransitionDuration={autoDJ.updateTransitionDuration}
            updateCrossfadeSpeed={autoDJ.updateCrossfadeSpeed}
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
                  onLoadTrack={loadTrackToDeckA}
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
                  loadTrackToDeckA={loadTrackToDeckA}
                  loadTrackToDeckB={loadTrackToDeckB}
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
                  onLoadTrack={loadTrackToDeckB}
                />
              </div>
            </div>
          </div>
        </div>

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
          onLoadToDeckA={loadTrackToDeckA}
          onLoadToDeckB={loadTrackToDeckB}
        />
      </div>
    </>
  );
};

export default VirtualDJ;
