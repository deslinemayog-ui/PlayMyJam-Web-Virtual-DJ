import { useCallback, useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { getDJSongs, getDJSongsOptimized } from '@/api';
import { Song } from '@/Types';
import {
  setDeckATrack,
  setDeckAPlaying,
  setDeckAVolume,
  setDeckAPosition,
  setDeckADuration,
  setDeckALoading,
  setDeckBTrack,
  setDeckBPlaying,
  setDeckBVolume,
  setDeckBPosition,
  setDeckBDuration,
  setDeckBLoading,
  setCrossfader,
  setMasterVolume,
  setDeckAEQ,
  setDeckBEQ,
  setDeckAEffects,
  setDeckBEffects,
  setDJSongs,
  addOrUpdateSong,
  removeSong,
  batchUpdateSongs,
  setLoadingSongs,
  setRecording,
  setRecordingDuration,
  setBPMA,
  setBPMB,
  setSynced,
  resetDeckA,
  resetDeckB,
  resetMixer,
} from '@/store/slices/musicPlayerSlice';

// Simple BPM estimation based on song characteristics
const estimateBPMFromSong = (song: Song): number => {

  // Try to extract BPM from title
  const text = song.title.toLowerCase();
  const bpmMatch = text.match(/(\d{2,3})\s*bpm/);
  if (bpmMatch) {
    return parseInt(bpmMatch[1]);
  }

  // Estimate based on title keywords
  if (text.includes('house') || text.includes('electronic')) return 125;
  if (text.includes('techno')) return 130;
  if (text.includes('trance')) return 135;
  if (text.includes('dubstep') || text.includes('bass')) return 140;
  if (text.includes('hip hop') || text.includes('rap')) return 85;
  if (text.includes('pop')) return 115;
  if (text.includes('rock')) return 120;

  // Default estimation based on duration (rough heuristic)
  const duration = song.duration || 180; // Default 3 minutes
  if (duration < 120) return 140; // Short songs tend to be faster
  if (duration > 300) return 100; // Long songs tend to be slower
  return 120; // Default house/electronic BPM
};

const toSafeNumber = (value: unknown, fallback: number, min = 0, max = 100): number => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : fallback;
};

export const useMusicPlayer = () => {
  const dispatch = useAppDispatch();
  const { user, isAuthenticated } = useAuth();
  const musicPlayerState = useAppSelector((state) => state.musicPlayer);

  // Refs mirroring mixer volumes & EQ for clean Web Audio gain staging without stale state
  const deckAVolumeRef = useRef<number>(toSafeNumber(musicPlayerState?.deckA?.volume, 75));
  const deckBVolumeRef = useRef<number>(toSafeNumber(musicPlayerState?.deckB?.volume, 75));
  const crossfaderRef = useRef<number>(toSafeNumber(musicPlayerState?.crossfader, 50));
  const masterVolumeRef = useRef<number>(toSafeNumber(musicPlayerState?.masterVolume, 75));
  const deckAEQRef = useRef({
    high: toSafeNumber(musicPlayerState?.deckAEQ?.high, 50),
    mid: toSafeNumber(musicPlayerState?.deckAEQ?.mid, 50),
    low: toSafeNumber(musicPlayerState?.deckAEQ?.low, 50),
  });
  const deckBEQRef = useRef({
    high: toSafeNumber(musicPlayerState?.deckBEQ?.high, 50),
    mid: toSafeNumber(musicPlayerState?.deckBEQ?.mid, 50),
    low: toSafeNumber(musicPlayerState?.deckBEQ?.low, 50),
  });

  // Audio element refs for both decks
  const deckAAudioRef = useRef<HTMLAudioElement | null>(null);
  const deckBAudioRef = useRef<HTMLAudioElement | null>(null);
  const deckATimeUpdateRef = useRef<(() => void) | null>(null);
  const deckBTimeUpdateRef = useRef<(() => void) | null>(null);
  const deckALoadGenRef = useRef<number>(0);
  const deckBLoadGenRef = useRef<number>(0);

  // Web Audio API refs for effects
  const audioContextRef = useRef<AudioContext | null>(null);
  const deckASourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const deckBSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const deckAGainRef = useRef<GainNode | null>(null);
  const deckBGainRef = useRef<GainNode | null>(null);
  const deckAAnalyserRef = useRef<AnalyserNode | null>(null);
  const deckBAnalyserRef = useRef<AnalyserNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const sfxBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  // EQ nodes for Deck A
  const deckAHighRef = useRef<BiquadFilterNode | null>(null);
  const deckAMidRef = useRef<BiquadFilterNode | null>(null);
  const deckALowRef = useRef<BiquadFilterNode | null>(null);

  // EQ nodes for Deck B
  const deckBHighRef = useRef<BiquadFilterNode | null>(null);
  const deckBMidRef = useRef<BiquadFilterNode | null>(null);
  const deckBLowRef = useRef<BiquadFilterNode | null>(null);

  // Effect nodes
  const deckADelayRef = useRef<DelayNode | null>(null);
  const deckBDelayRef = useRef<DelayNode | null>(null);
  const deckAConvolverRef = useRef<ConvolverNode | null>(null);
  const deckBConvolverRef = useRef<ConvolverNode | null>(null);

  // Firebase listener cleanup ref
  const djSongsUnsubscribeRef = useRef<(() => void) | null>(null);

  // Load DJ songs when user is authenticated
  const loadDJSongs = useCallback(() => {
    // Clean up previous listener if it exists
    if (djSongsUnsubscribeRef.current) {
      console.log('🧹 Cleaning up previous Firebase listener');
      djSongsUnsubscribeRef.current();
      djSongsUnsubscribeRef.current = null;
    }

    if (!isAuthenticated || !user?.userId) {
      dispatch(setDJSongs([]));
      return;
    }

    dispatch(setLoadingSongs(true));

    try {
      // Store the unsubscribe function for cleanup
      djSongsUnsubscribeRef.current = getDJSongsOptimized(user.userId, 'ACTIVE', (changes) => {
        console.log('🔄 getDJSongsOptimized changes:', changes.type);

        if (changes.type === 'initial') {
          // Initial load - replace entire array
          console.log('📦 Initial load:', changes.songs.length, 'songs');
          dispatch(setDJSongs(changes.songs));
          dispatch(setLoadingSongs(false));

          // Debug bid information
          const songsWithBids = changes.songs.filter(song => song.currentBid && song.currentBid > 0);
          if (songsWithBids.length > 0) {
            console.log(`💰 Songs with bids: ${songsWithBids.length}`);
            songsWithBids.forEach(song => {
              console.log(`  - "${song.title}": ${song.currentBid} tokens`);
            });
          } else {
            console.log('💰 No songs with active bids');
          }
        } else if (changes.type === 'added' && changes.song) {
          // New song added - add to front of list (likely has a bid)
          console.log('🆕 Adding new song:', changes.song.title, 'Bid:', changes.song.currentBid || 0);
          dispatch(addOrUpdateSong(changes.song));
        } else if (changes.type === 'modified' && changes.song) {
          // Song updated - update in place
          console.log('🔄 Updating song:', changes.song.title, 'Bid:', changes.song.currentBid || 0);
          dispatch(addOrUpdateSong(changes.song));
        } else if (changes.type === 'removed' && changes.song) {
          // Song removed
          console.log('🗑️ Removing song:', changes.song.title);
          dispatch(removeSong(changes.song.id));
        }
      });
    } catch (error) {
      console.error('Error calling getDJSongsOptimized:', error);
      // Fallback to original method if optimized version fails
      console.log('🔄 Falling back to original getDJSongs method...');
      djSongsUnsubscribeRef.current = getDJSongs(user.userId, 'ACTIVE', (result: any) => {
        let songs: Song[] = [];
        if (Array.isArray(result)) {
          songs = result;
        } else if (result && typeof result === 'object') {
          if (Array.isArray(result.songs)) {
            songs = result.songs;
          } else if (Array.isArray(result.data)) {
            songs = result.data;
          }
        }
        dispatch(setDJSongs(songs));
        dispatch(setLoadingSongs(false));
      });
    }
  }, [dispatch, isAuthenticated, user?.userId]);

  // Initialize Web Audio API and HTML5 audio elements
  useEffect(() => {
    // Reset loading states on mount (in case they were persisted)
    dispatch(setDeckALoading(false));
    dispatch(setDeckBLoading(false));
    dispatch(setLoadingSongs(false));

    // Initialize Audio Context for effects (CORS enabled)
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('🎵 Web Audio API initialized - CORS enabled');
      } catch (error) {
        console.error('❌ Web Audio API not available:', error);
      }
    }

    // Initialize audio elements with CORS support and event listeners
    if (!deckAAudioRef.current) {
      deckAAudioRef.current = new Audio();
      deckAAudioRef.current.preload = 'metadata';
      deckAAudioRef.current.crossOrigin = 'anonymous'; // CORS enabled
      deckAAudioRef.current.setAttribute('data-deck', 'A'); // For disco lights
      deckAAudioRef.current.id = 'deckA-audio';
      deckAAudioRef.current.style.display = 'none';
      document.body.appendChild(deckAAudioRef.current);

      // Add event listeners for proper state management
      deckAAudioRef.current.addEventListener('ended', () => {
        dispatch(setDeckAPlaying(false));
        console.log('🔚 Deck A track ended');
      });

      deckAAudioRef.current.addEventListener('pause', () => {
        dispatch(setDeckAPlaying(false));
      });

      deckAAudioRef.current.addEventListener('play', () => {
        dispatch(setDeckAPlaying(true));
      });
    }

    if (!deckBAudioRef.current) {
      deckBAudioRef.current = new Audio();
      deckBAudioRef.current.preload = 'metadata';
      deckBAudioRef.current.crossOrigin = 'anonymous'; // CORS enabled
      deckBAudioRef.current.setAttribute('data-deck', 'B'); // For disco lights
      deckBAudioRef.current.id = 'deckB-audio';
      deckBAudioRef.current.style.display = 'none';
      document.body.appendChild(deckBAudioRef.current);

      // Add event listeners for proper state management
      deckBAudioRef.current.addEventListener('ended', () => {
        dispatch(setDeckBPlaying(false));
        console.log('🔚 Deck B track ended');
      });

      deckBAudioRef.current.addEventListener('pause', () => {
        dispatch(setDeckBPlaying(false));
      });

      deckBAudioRef.current.addEventListener('play', () => {
        dispatch(setDeckBPlaying(true));
      });
    }

    // Initialize master gain eagerly
    const initializeMasterBus = () => {
      if (!audioContextRef.current || masterGainRef.current) return;

      const ctx = audioContextRef.current;
      masterGainRef.current = ctx.createGain();
      masterGainRef.current.gain.value = toSafeNumber(masterVolumeRef.current, 75) / 100;
      masterGainRef.current.connect(ctx.destination);
      console.log('🎛️ Master gain node initialized');
    };

    initializeMasterBus();

    // Resume AudioContext on first user gesture
    const handleUserInteraction = () => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      initializeMasterBus();
      document.removeEventListener('click', handleUserInteraction);
    };

    document.addEventListener('click', handleUserInteraction);

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      if (djSongsUnsubscribeRef.current) {
        djSongsUnsubscribeRef.current();
        djSongsUnsubscribeRef.current = null;
      }
      if (deckAAudioRef.current) {
        deckAAudioRef.current.pause();
        deckAAudioRef.current.remove();
        deckAAudioRef.current = null;
      }
      if (deckBAudioRef.current) {
        deckBAudioRef.current.pause();
        deckBAudioRef.current.remove();
        deckBAudioRef.current = null;
      }
      // Reset all Web Audio node refs so remounts / HMR rebuild fresh nodes on the new AudioContext
      deckASourceRef.current = null;
      deckBSourceRef.current = null;
      deckAGainRef.current = null;
      deckBGainRef.current = null;
      deckAAnalyserRef.current = null;
      deckBAnalyserRef.current = null;
      deckAHighRef.current = null;
      deckAMidRef.current = null;
      deckALowRef.current = null;
      deckBHighRef.current = null;
      deckBMidRef.current = null;
      deckBLowRef.current = null;
      deckADelayRef.current = null;
      deckBDelayRef.current = null;
      deckAConvolverRef.current = null;
      deckBConvolverRef.current = null;
      deckATimeUpdateRef.current = null;
      deckBTimeUpdateRef.current = null;
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      masterGainRef.current = null;
    };
  }, []);

  // Helper to map 0-100 EQ slider (50 = flat 0dB) to DJ dB curve (-26dB kill cut to +12dB boost)
  const eqSliderToDb = (value: number): number => {
    const safe = toSafeNumber(value, 50);
    return safe >= 50 ? ((safe - 50) / 50) * 12 : ((safe - 50) / 50) * 26;
  };

  // Apply unified equal-power crossfader + deck gain staging (verifies live AudioContext ownership)
  const applyDeckGains = useCallback(() => {
    const cf = toSafeNumber(crossfaderRef.current, 50);
    const leftCross = Math.cos((cf / 100) * (Math.PI / 2));
    const rightCross = Math.sin((cf / 100) * (Math.PI / 2));

    const volA = toSafeNumber(deckAVolumeRef.current, 75) / 100;
    const volB = toSafeNumber(deckBVolumeRef.current, 75) / 100;
    const master = toSafeNumber(masterVolumeRef.current, 75) / 100;

    const ctx = audioContextRef.current;
    const isCtxOpen = Boolean(ctx && ctx.state !== 'closed');
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx?.currentTime ?? 0;

    const deckAWebAudioActive = Boolean(
      isCtxOpen &&
        deckAGainRef.current &&
        deckASourceRef.current &&
        deckASourceRef.current.context === ctx
    );
    const deckBWebAudioActive = Boolean(
      isCtxOpen &&
        deckBGainRef.current &&
        deckBSourceRef.current &&
        deckBSourceRef.current.context === ctx
    );

    if (deckAWebAudioActive && deckAGainRef.current && ctx) {
      const targetA = Math.max(0, Math.min(1, leftCross * volA));
      deckAGainRef.current.gain.cancelScheduledValues(now);
      if (ctx.state === 'running') {
        deckAGainRef.current.gain.setTargetAtTime(targetA, now, 0.015);
      } else {
        deckAGainRef.current.gain.value = targetA;
      }
      if (deckAAudioRef.current) deckAAudioRef.current.volume = 1;
    } else if (deckAAudioRef.current) {
      deckAAudioRef.current.volume = Math.max(0, Math.min(1, leftCross * volA * master));
    }

    if (deckBWebAudioActive && deckBGainRef.current && ctx) {
      const targetB = Math.max(0, Math.min(1, rightCross * volB));
      deckBGainRef.current.gain.cancelScheduledValues(now);
      if (ctx.state === 'running') {
        deckBGainRef.current.gain.setTargetAtTime(targetB, now, 0.015);
      } else {
        deckBGainRef.current.gain.value = targetB;
      }
      if (deckBAudioRef.current) deckBAudioRef.current.volume = 1;
    } else if (deckBAudioRef.current) {
      deckBAudioRef.current.volume = Math.max(0, Math.min(1, rightCross * volB * master));
    }

    if (isCtxOpen && masterGainRef.current && ctx && masterGainRef.current.context === ctx) {
      const targetMaster = Math.max(0, Math.min(1, master));
      masterGainRef.current.gain.cancelScheduledValues(now);
      if (ctx.state === 'running') {
        masterGainRef.current.gain.setTargetAtTime(targetMaster, now, 0.015);
      } else {
        masterGainRef.current.gain.value = targetMaster;
      }
    }
  }, []);

  // Keep volume & crossfader refs synced when Redux rehydrates persisted values
  useEffect(() => {
    deckAVolumeRef.current = toSafeNumber(musicPlayerState?.deckA?.volume, 75);
    deckBVolumeRef.current = toSafeNumber(musicPlayerState?.deckB?.volume, 75);
    crossfaderRef.current = toSafeNumber(musicPlayerState?.crossfader, 50);
    masterVolumeRef.current = toSafeNumber(musicPlayerState?.masterVolume, 75);
    applyDeckGains();
  }, [
    musicPlayerState?.deckA?.volume,
    musicPlayerState?.deckB?.volume,
    musicPlayerState?.crossfader,
    musicPlayerState?.masterVolume,
    applyDeckGains,
  ]);

  // Load songs when authenticated
  useEffect(() => {
    loadDJSongs();
  }, [loadDJSongs]);



  // Initialize Web Audio nodes for Deck A (CORS enabled)
  const initializeWebAudioForDeckA = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed' || !deckAAudioRef.current || !masterGainRef.current) return;
    if (deckASourceRef.current && deckASourceRef.current.context === ctx) return;

    try {
      // CORS is enabled - create full Web Audio chain
      deckASourceRef.current = ctx.createMediaElementSource(deckAAudioRef.current);

      // Create DJ 3-band EQ filters
      deckAHighRef.current = ctx.createBiquadFilter();
      deckAHighRef.current.type = 'highshelf';
      deckAHighRef.current.frequency.value = 3500;
      deckAHighRef.current.gain.value = eqSliderToDb(deckAEQRef.current.high);

      deckAMidRef.current = ctx.createBiquadFilter();
      deckAMidRef.current.type = 'peaking';
      deckAMidRef.current.frequency.value = 1000;
      deckAMidRef.current.Q.value = 0.8;
      deckAMidRef.current.gain.value = eqSliderToDb(deckAEQRef.current.mid);

      deckALowRef.current = ctx.createBiquadFilter();
      deckALowRef.current.type = 'lowshelf';
      deckALowRef.current.frequency.value = 280;
      deckALowRef.current.gain.value = eqSliderToDb(deckAEQRef.current.low);

      // Create delay for echo with feedback
      deckADelayRef.current = ctx.createDelay(1.0);
      deckADelayRef.current.delayTime.value = 0;

      // Create delay feedback gain
      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.3;

      // Create delay wet/dry mix
      const delayWet = ctx.createGain();
      delayWet.gain.value = 0;
      const delayDry = ctx.createGain();
      delayDry.gain.value = 1;

      // Create reverb using convolver with impulse response
      deckAConvolverRef.current = ctx.createConvolver();

      // Generate a simple reverb impulse response
      const sampleRate = ctx.sampleRate;
      const length = sampleRate * 2; // 2 seconds of reverb
      const impulse = ctx.createBuffer(2, length, sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const channelData = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          const decay = Math.pow(1 - i / length, 2);
          channelData[i] = (Math.random() * 2 - 1) * decay * 0.5;
        }
      }

      deckAConvolverRef.current.buffer = impulse;

      // Create reverb wet/dry mix
      const reverbWet = ctx.createGain();
      reverbWet.gain.value = 0;
      const reverbDry = ctx.createGain();
      reverbDry.gain.value = 1;

      // Create gain node & shared analyser (for DiscoLights without hijacking MediaElementSource)
      deckAGainRef.current = ctx.createGain();
      deckAAnalyserRef.current = ctx.createAnalyser();
      deckAAnalyserRef.current.fftSize = 256;
      deckAAnalyserRef.current.smoothingTimeConstant = 0.8;
      (deckAAudioRef.current as HTMLAudioElement & { __analyserNode?: AnalyserNode }).__analyserNode =
        deckAAnalyserRef.current;

      // Connect EQ chain: source -> high -> mid -> low
      deckASourceRef.current
        .connect(deckAHighRef.current)
        .connect(deckAMidRef.current)
        .connect(deckALowRef.current);

      // Split signal for delay effect
      deckALowRef.current.connect(delayDry);
      deckALowRef.current.connect(deckADelayRef.current);
      deckADelayRef.current.connect(delayWet);
      deckADelayRef.current.connect(delayFeedback);
      delayFeedback.connect(deckADelayRef.current);

      // Mix delay signals
      const delayMix = ctx.createGain();
      delayDry.connect(delayMix);
      delayWet.connect(delayMix);

      // Split for reverb effect
      delayMix.connect(reverbDry);
      delayMix.connect(deckAConvolverRef.current);
      deckAConvolverRef.current.connect(reverbWet);

      // Mix reverb signals -> deck gain -> shared analyser -> master output
      reverbDry.connect(deckAGainRef.current);
      reverbWet.connect(deckAGainRef.current);
      deckAGainRef.current.connect(deckAAnalyserRef.current);
      deckAAnalyserRef.current.connect(masterGainRef.current);

      // Store references for effect controls
      (deckADelayRef.current as any).wetGain = delayWet;
      (deckADelayRef.current as any).dryGain = delayDry;
      (deckAConvolverRef.current as any).wetGain = reverbWet;
      (deckAConvolverRef.current as any).dryGain = reverbDry;

      applyDeckGains();
      console.log('🎛️ Deck A Web Audio chain initialized');
    } catch (err) {
      console.error('❌ Failed to initialize Deck A Web Audio chain:', err);
      deckASourceRef.current = null;
      deckAGainRef.current = null;
      applyDeckGains();
    }
  }, [applyDeckGains]);

  // Deck A controls
  const loadTrackToDeckA = useCallback(async (song: Song, autoPlay = false) => {
    if (!deckAAudioRef.current) return;

    const loadGen = ++deckALoadGenRef.current;
    console.log('Loading track to Deck A:', song.title, autoPlay ? '(autoPlay)' : '');
    dispatch(setDeckALoading(true));
    dispatch(setDeckATrack(song));

    try {
      // Set the audio source
      const audioUrl = song.audioUrl || song.url;
      console.log('Deck A audio URL:', audioUrl);

      if (!audioUrl) {
        console.error('No audio URL found for track:', song);
        dispatch(setDeckALoading(false));
        return;
      }

      // Use the original audio URL (no CORS needed for HTML5 audio)
      console.log('Setting audio source for Deck A:', audioUrl);
      deckAAudioRef.current.src = audioUrl;

      // Initialize Web Audio immediately (CORS enabled)
      if (
        audioContextRef.current &&
        masterGainRef.current &&
        deckASourceRef.current?.context !== audioContextRef.current
      ) {
        initializeWebAudioForDeckA();
      }

      const handleLoadedMetadata = () => {
        if (deckAAudioRef.current && deckALoadGenRef.current === loadGen) {
          console.log('Deck A metadata loaded, duration:', deckAAudioRef.current.duration);
          console.log('Deck A audio element ready state:', deckAAudioRef.current.readyState);
          console.log('Deck A audio element can play:', deckAAudioRef.current.readyState >= 2);
          dispatch(setDeckADuration(deckAAudioRef.current.duration));

          // Set BPM from song data or estimate based on title/duration
          const estimatedBPM = estimateBPMFromSong(song);
          dispatch(setBPMA(estimatedBPM));
          console.log(`🎵 Deck A BPM set to: ${estimatedBPM}`);

          dispatch(setDeckALoading(false));
        }
      };

      const handleError = (event: any) => {
        if (deckALoadGenRef.current !== loadGen) return;
        console.error('Error loading audio for Deck A:', event);
        console.error('Audio element error:', deckAAudioRef.current?.error);
        console.error('Audio element networkState:', deckAAudioRef.current?.networkState);
        console.error('Audio element readyState:', deckAAudioRef.current?.readyState);
        dispatch(setDeckALoading(false));
      };

      const handleTimeUpdate = () => {
        if (deckAAudioRef.current) {
          dispatch(setDeckAPosition(deckAAudioRef.current.currentTime));
        }
      };

      const handleCanPlayThrough = () => {
        console.log('Deck A can play through - audio is ready');
        if (deckAAudioRef.current) {
          console.log('Deck A final readyState:', deckAAudioRef.current.readyState);
        }
      };

      // Remove previous persistent timeupdate listener to prevent accumulation
      if (deckATimeUpdateRef.current) {
        deckAAudioRef.current.removeEventListener('timeupdate', deckATimeUpdateRef.current);
      }
      deckATimeUpdateRef.current = handleTimeUpdate;

      // Add new listeners
      deckAAudioRef.current.addEventListener('error', handleError, { once: true });
      deckAAudioRef.current.addEventListener('timeupdate', handleTimeUpdate);
      deckAAudioRef.current.addEventListener('canplaythrough', handleCanPlayThrough, { once: true });

      if (autoPlay) {
        const handleAutoPlay = async () => {
          if (deckALoadGenRef.current !== loadGen || !deckAAudioRef.current) return;
          try {
            if (audioContextRef.current?.state === 'suspended') {
              await audioContextRef.current.resume();
            }
            await deckAAudioRef.current.play();
            dispatch(setDeckAPlaying(true));
          } catch (err) {
            console.error('Error auto-playing Deck A:', err);
            dispatch(setDeckAPlaying(false));
          }
        };
        deckAAudioRef.current.addEventListener('canplay', handleAutoPlay, { once: true });
      }

      // Add timeout fallback to prevent infinite loading
      const loadingTimeout = setTimeout(() => {
        if (deckALoadGenRef.current === loadGen) {
          console.warn('Loading timeout for Deck A, stopping loading state');
          dispatch(setDeckALoading(false));
        }
      }, 10000); // 10 second timeout

      // Clear timeout when metadata loads
      const handleLoadedMetadataWithTimeout = () => {
        clearTimeout(loadingTimeout);
        handleLoadedMetadata();
      };

      deckAAudioRef.current.addEventListener('loadedmetadata', handleLoadedMetadataWithTimeout, { once: true });

      // Load the audio
      deckAAudioRef.current.load();

      // Test if we can play without Web Audio (for debugging)
      console.log('Audio element after load - src:', deckAAudioRef.current.src);
      console.log('Audio element after load - readyState:', deckAAudioRef.current.readyState);

    } catch (error) {
      console.error('Error loading track to Deck A:', error);
      dispatch(setDeckALoading(false));
    }
  }, [dispatch, initializeWebAudioForDeckA]);

  const playDeckA = useCallback(async () => {
    if (!deckAAudioRef.current || !musicPlayerState.deckA.currentTrack) {
      console.warn('❌ Cannot play Deck A - missing audio ref or track');
      return;
    }

    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      if (!deckAAudioRef.current.paused) {
        deckAAudioRef.current.pause();
      }

      const playPromise = deckAAudioRef.current.play();

      if (playPromise !== undefined) {
        await playPromise;
        dispatch(setDeckAPlaying(true));
        console.log('▶️ Deck A playing:', musicPlayerState.deckA.currentTrack.title);
      }
    } catch (error) {
      console.error('❌ Error playing Deck A:', error);
      dispatch(setDeckAPlaying(false));
    }
  }, [dispatch, musicPlayerState.deckA.currentTrack]);

  const pauseDeckA = useCallback(() => {
    if (deckAAudioRef.current && musicPlayerState.deckA.currentTrack) {
      deckAAudioRef.current.pause();
      dispatch(setDeckAPlaying(false));
      console.log('⏸️ Deck A paused:', musicPlayerState.deckA.currentTrack.title);
    }
  }, [dispatch, musicPlayerState.deckA.currentTrack]);

  const stopDeckA = useCallback(() => {
    if (deckAAudioRef.current && musicPlayerState.deckA.currentTrack) {
      deckAAudioRef.current.pause();
      deckAAudioRef.current.currentTime = 0;
      dispatch(setDeckAPlaying(false));
      dispatch(setDeckAPosition(0));
      console.log('⏹️ Deck A stopped:', musicPlayerState.deckA.currentTrack.title);
    }
  }, [dispatch, musicPlayerState.deckA.currentTrack]);

  const toggleDeckA = useCallback(() => {
    // Check if audio element exists and is in sync with state
    if (!deckAAudioRef.current && musicPlayerState.deckA.currentTrack) {
      console.warn('❌ Audio element for Deck A not found but track exists - resetting state');
      dispatch(setDeckAPlaying(false));
      return;
    }

    if (musicPlayerState.deckA.isPlaying) {
      pauseDeckA();
    } else {
      playDeckA();
    }
  }, [musicPlayerState.deckA.isPlaying, musicPlayerState.deckA.currentTrack, playDeckA, pauseDeckA, dispatch]);

  // Initialize Web Audio nodes for Deck B (CORS enabled)
  const initializeWebAudioForDeckB = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed' || !deckBAudioRef.current || !masterGainRef.current) return;
    if (deckBSourceRef.current && deckBSourceRef.current.context === ctx) return;

    try {
      // CORS is enabled - create full Web Audio chain
      deckBSourceRef.current = ctx.createMediaElementSource(deckBAudioRef.current);

      // Create DJ 3-band EQ filters
      deckBHighRef.current = ctx.createBiquadFilter();
      deckBHighRef.current.type = 'highshelf';
      deckBHighRef.current.frequency.value = 3500;
      deckBHighRef.current.gain.value = eqSliderToDb(deckBEQRef.current.high);

      deckBMidRef.current = ctx.createBiquadFilter();
      deckBMidRef.current.type = 'peaking';
      deckBMidRef.current.frequency.value = 1000;
      deckBMidRef.current.Q.value = 0.8;
      deckBMidRef.current.gain.value = eqSliderToDb(deckBEQRef.current.mid);

      deckBLowRef.current = ctx.createBiquadFilter();
      deckBLowRef.current.type = 'lowshelf';
      deckBLowRef.current.frequency.value = 280;
      deckBLowRef.current.gain.value = eqSliderToDb(deckBEQRef.current.low);

      // Create delay for echo with feedback
      deckBDelayRef.current = ctx.createDelay(1.0);
      deckBDelayRef.current.delayTime.value = 0;

      // Create delay feedback gain
      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.3;

      // Create delay wet/dry mix
      const delayWet = ctx.createGain();
      delayWet.gain.value = 0;
      const delayDry = ctx.createGain();
      delayDry.gain.value = 1;

      // Create reverb using convolver with impulse response
      deckBConvolverRef.current = ctx.createConvolver();

      // Generate a simple reverb impulse response
      const sampleRate = ctx.sampleRate;
      const length = sampleRate * 2; // 2 seconds of reverb
      const impulse = ctx.createBuffer(2, length, sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const channelData = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          const decay = Math.pow(1 - i / length, 2);
          channelData[i] = (Math.random() * 2 - 1) * decay * 0.5;
        }
      }

      deckBConvolverRef.current.buffer = impulse;

      // Create reverb wet/dry mix
      const reverbWet = ctx.createGain();
      reverbWet.gain.value = 0;
      const reverbDry = ctx.createGain();
      reverbDry.gain.value = 1;

      // Create gain node & shared analyser (for DiscoLights without hijacking MediaElementSource)
      deckBGainRef.current = ctx.createGain();
      deckBAnalyserRef.current = ctx.createAnalyser();
      deckBAnalyserRef.current.fftSize = 256;
      deckBAnalyserRef.current.smoothingTimeConstant = 0.8;
      (deckBAudioRef.current as HTMLAudioElement & { __analyserNode?: AnalyserNode }).__analyserNode =
        deckBAnalyserRef.current;

      // Connect EQ chain: source -> high -> mid -> low
      deckBSourceRef.current
        .connect(deckBHighRef.current)
        .connect(deckBMidRef.current)
        .connect(deckBLowRef.current);

      // Split signal for delay effect
      deckBLowRef.current.connect(delayDry);
      deckBLowRef.current.connect(deckBDelayRef.current);
      deckBDelayRef.current.connect(delayWet);
      deckBDelayRef.current.connect(delayFeedback);
      delayFeedback.connect(deckBDelayRef.current);

      // Mix delay signals
      const delayMix = ctx.createGain();
      delayDry.connect(delayMix);
      delayWet.connect(delayMix);

      // Split for reverb effect
      delayMix.connect(reverbDry);
      delayMix.connect(deckBConvolverRef.current);
      deckBConvolverRef.current.connect(reverbWet);

      // Mix reverb signals -> deck gain -> shared analyser -> master output
      reverbDry.connect(deckBGainRef.current);
      reverbWet.connect(deckBGainRef.current);
      deckBGainRef.current.connect(deckBAnalyserRef.current);
      deckBAnalyserRef.current.connect(masterGainRef.current);

      // Store references for effect controls
      (deckBDelayRef.current as any).wetGain = delayWet;
      (deckBDelayRef.current as any).dryGain = delayDry;
      (deckBConvolverRef.current as any).wetGain = reverbWet;
      (deckBConvolverRef.current as any).dryGain = reverbDry;

      applyDeckGains();
      console.log('🎛️ Deck B Web Audio chain initialized');
    } catch (err) {
      console.error('❌ Failed to initialize Deck B Web Audio chain:', err);
      deckBSourceRef.current = null;
      deckBGainRef.current = null;
      applyDeckGains();
    }
  }, [applyDeckGains]);

  // Deck B controls
  const loadTrackToDeckB = useCallback(async (song: Song, autoPlay = false) => {
    if (!deckBAudioRef.current) return;

    const loadGen = ++deckBLoadGenRef.current;
    console.log('Loading track to Deck B:', song.title, autoPlay ? '(autoPlay)' : '');
    dispatch(setDeckBLoading(true));
    dispatch(setDeckBTrack(song));

    try {
      // Set the audio source
      const audioUrl = song.audioUrl || song.url;
      console.log('Deck B audio URL:', audioUrl);

      if (!audioUrl) {
        console.error('No audio URL found for Deck B track:', song);
        dispatch(setDeckBLoading(false));
        return;
      }

      deckBAudioRef.current.src = audioUrl;

      // Initialize Web Audio immediately (CORS enabled)
      if (
        audioContextRef.current &&
        masterGainRef.current &&
        deckBSourceRef.current?.context !== audioContextRef.current
      ) {
        initializeWebAudioForDeckB();
      }

      const handleLoadedMetadata = () => {
        if (deckBAudioRef.current && deckBLoadGenRef.current === loadGen) {
          console.log('Deck B metadata loaded, duration:', deckBAudioRef.current.duration);
          dispatch(setDeckBDuration(deckBAudioRef.current.duration));

          // Set BPM from song data or estimate based on title/duration
          const estimatedBPM = estimateBPMFromSong(song);
          dispatch(setBPMB(estimatedBPM));
          console.log(`🎵 Deck B BPM set to: ${estimatedBPM}`);

          dispatch(setDeckBLoading(false));
        }
      };

      const handleError = () => {
        if (deckBLoadGenRef.current !== loadGen) return;
        console.error('Error loading audio for Deck B');
        dispatch(setDeckBLoading(false));
      };

      const handleTimeUpdate = () => {
        if (deckBAudioRef.current) {
          dispatch(setDeckBPosition(deckBAudioRef.current.currentTime));
        }
      };

      // Remove previous persistent timeupdate listener to prevent accumulation
      if (deckBTimeUpdateRef.current) {
        deckBAudioRef.current.removeEventListener('timeupdate', deckBTimeUpdateRef.current);
      }
      deckBTimeUpdateRef.current = handleTimeUpdate;

      // Add new listeners
      deckBAudioRef.current.addEventListener('error', handleError, { once: true });
      deckBAudioRef.current.addEventListener('timeupdate', handleTimeUpdate);

      if (autoPlay) {
        const handleAutoPlay = async () => {
          if (deckBLoadGenRef.current !== loadGen || !deckBAudioRef.current) return;
          try {
            if (audioContextRef.current?.state === 'suspended') {
              await audioContextRef.current.resume();
            }
            await deckBAudioRef.current.play();
            dispatch(setDeckBPlaying(true));
          } catch (err) {
            console.error('Error auto-playing Deck B:', err);
            dispatch(setDeckBPlaying(false));
          }
        };
        deckBAudioRef.current.addEventListener('canplay', handleAutoPlay, { once: true });
      }

      // Add timeout fallback to prevent infinite loading
      const loadingTimeout = setTimeout(() => {
        if (deckBLoadGenRef.current === loadGen) {
          console.warn('Loading timeout for Deck B, stopping loading state');
          dispatch(setDeckBLoading(false));
        }
      }, 10000); // 10 second timeout

      // Clear timeout when metadata loads
      const handleLoadedMetadataWithTimeout = () => {
        clearTimeout(loadingTimeout);
        handleLoadedMetadata();
      };

      deckBAudioRef.current.addEventListener('loadedmetadata', handleLoadedMetadataWithTimeout, { once: true });

      // Load the audio
      deckBAudioRef.current.load();

    } catch (error) {
      console.error('Error loading track to Deck B:', error);
      dispatch(setDeckBLoading(false));
    }
  }, [dispatch, initializeWebAudioForDeckB]);

  const playDeckB = useCallback(async () => {
    console.log('playDeckB called');
    console.log('deckBAudioRef.current:', deckBAudioRef.current);
    console.log('musicPlayerState.deckB.currentTrack:', musicPlayerState.deckB.currentTrack);
    console.log('deckBAudioRef.current?.src:', deckBAudioRef.current?.src);
    console.log('deckBAudioRef.current?.readyState:', deckBAudioRef.current?.readyState);

    if (!deckBAudioRef.current || !musicPlayerState.deckB.currentTrack) {
      console.warn('Cannot play Deck B - missing audio ref or track');
      return;
    }

    // Check if audio source is valid
    if (!deckBAudioRef.current.src || deckBAudioRef.current.src === '') {
      console.error('Cannot play Deck B - no audio source set');
      return;
    }

    // If audio is not ready, try to load it first
    if (deckBAudioRef.current.readyState < 2) {
      console.warn('Deck B audio not ready (readyState:', deckBAudioRef.current.readyState, '), trying to load...');
      try {
        deckBAudioRef.current.load();
        console.log('Called load() on Deck B audio element');
      } catch (error) {
        console.error('Error calling load() on Deck B:', error);
      }

      // For now, try to play anyway (some browsers allow this)
      console.log('Attempting to play Deck B even though not fully ready...');
    }

    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      // Make sure we're not already playing
      if (!deckBAudioRef.current.paused) {
        console.log('Deck B already playing, pausing first');
        deckBAudioRef.current.pause();
      }

      console.log('Attempting to play Deck B audio...');
      const playPromise = deckBAudioRef.current.play();

      if (playPromise !== undefined) {
        await playPromise;
        dispatch(setDeckBPlaying(true));
        console.log('▶️ Deck B playing:', musicPlayerState.deckB.currentTrack.title);
      }
    } catch (error) {
      console.error('Error playing Deck B:', error);
      dispatch(setDeckBPlaying(false));
    }
  }, [dispatch, musicPlayerState.deckB.currentTrack]);

  const pauseDeckB = useCallback(() => {
    if (deckBAudioRef.current && musicPlayerState.deckB.currentTrack) {
      deckBAudioRef.current.pause();
      dispatch(setDeckBPlaying(false));
      console.log('⏸️ Deck B paused:', musicPlayerState.deckB.currentTrack.title);
    }
  }, [dispatch, musicPlayerState.deckB.currentTrack]);

  const stopDeckB = useCallback(() => {
    if (deckBAudioRef.current && musicPlayerState.deckB.currentTrack) {
      deckBAudioRef.current.pause();
      deckBAudioRef.current.currentTime = 0;
      dispatch(setDeckBPlaying(false));
      dispatch(setDeckBPosition(0));
      console.log('⏹️ Deck B stopped:', musicPlayerState.deckB.currentTrack.title);
    }
  }, [dispatch, musicPlayerState.deckB.currentTrack]);

  const toggleDeckB = useCallback(() => {
    // Check if audio element exists and is in sync with state
    if (!deckBAudioRef.current && musicPlayerState.deckB.currentTrack) {
      console.warn('❌ Audio element for Deck B not found but track exists - resetting state');
      dispatch(setDeckBPlaying(false));
      return;
    }

    if (musicPlayerState.deckB.isPlaying) {
      pauseDeckB();
    } else {
      playDeckB();
    }
  }, [musicPlayerState.deckB.isPlaying, musicPlayerState.deckB.currentTrack, playDeckB, pauseDeckB, dispatch]);

  // Volume controls (unified Web Audio gain staging with HTML5 fallback)
  const updateDeckAVolume = useCallback((volume: number) => {
    const safeVolume = isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 75;
    deckAVolumeRef.current = safeVolume;
    dispatch(setDeckAVolume(safeVolume));
    applyDeckGains();
  }, [dispatch, applyDeckGains]);

  const updateDeckBVolume = useCallback((volume: number) => {
    const safeVolume = isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 75;
    deckBVolumeRef.current = safeVolume;
    dispatch(setDeckBVolume(safeVolume));
    applyDeckGains();
  }, [dispatch, applyDeckGains]);

  const updateMasterVolume = useCallback((volume: number) => {
    const safeVolume = isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 75;
    masterVolumeRef.current = safeVolume;
    dispatch(setMasterVolume(safeVolume));
    applyDeckGains();
  }, [dispatch, applyDeckGains]);

  // Crossfader control (routes cleanly through Web Audio gain nodes so live broadcasts capture crossfades)
  const updateCrossfader = useCallback((value: number) => {
    const safeValue = isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
    crossfaderRef.current = safeValue;
    dispatch(setCrossfader(safeValue));
    applyDeckGains();
  }, [dispatch, applyDeckGains]);

  // EQ controls with real audio processing (CORS enabled)
  const updateDeckAEQ = useCallback((eq: { high?: number; mid?: number; low?: number }) => {
    dispatch(setDeckAEQ(eq));

    if (eq.high !== undefined) deckAEQRef.current.high = toSafeNumber(eq.high, 50);
    if (eq.mid !== undefined) deckAEQRef.current.mid = toSafeNumber(eq.mid, 50);
    if (eq.low !== undefined) deckAEQRef.current.low = toSafeNumber(eq.low, 50);

    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Initialize Web Audio if not already done on active AudioContext
    if (ctx && deckAAudioRef.current && masterGainRef.current && deckASourceRef.current?.context !== ctx) {
      initializeWebAudioForDeckA();
    }

    if (!ctx || ctx.state === 'closed') return;
    const now = ctx.currentTime;

    const applyFilterGain = (node: BiquadFilterNode | null, value: number) => {
      if (!node || node.context !== ctx) return;
      const gainDb = eqSliderToDb(value);
      node.gain.cancelScheduledValues(now);
      if (ctx.state === 'running') {
        node.gain.setTargetAtTime(gainDb, now, 0.015);
      } else {
        node.gain.value = gainDb;
      }
    };

    if (eq.high !== undefined) applyFilterGain(deckAHighRef.current, eq.high);
    if (eq.mid !== undefined) applyFilterGain(deckAMidRef.current, eq.mid);
    if (eq.low !== undefined) applyFilterGain(deckALowRef.current, eq.low);
  }, [dispatch, initializeWebAudioForDeckA]);

  // Effect controls for Deck A
  const updateDeckADelay = useCallback((delayTime: number) => {
    if (deckADelayRef.current && audioContextRef.current) {
      // Set delay time (0-1 seconds)
      deckADelayRef.current.delayTime.setValueAtTime(delayTime, audioContextRef.current.currentTime);

      // Set wet/dry mix based on delay time
      const wetGain = (deckADelayRef.current as any).wetGain;
      const dryGain = (deckADelayRef.current as any).dryGain;

      if (wetGain && dryGain) {
        const wetLevel = delayTime > 0 ? 0.4 : 0; // 40% wet when delay is on
        const dryLevel = 1 - wetLevel * 0.3; // Reduce dry slightly when wet is on

        wetGain.gain.setValueAtTime(wetLevel, audioContextRef.current.currentTime);
        dryGain.gain.setValueAtTime(dryLevel, audioContextRef.current.currentTime);

        console.log('🎛️ Deck A Delay:', delayTime + 's', 'wet:', wetLevel, 'dry:', dryLevel);
        console.log('🔧 Delay nodes:', { wetGain: !!wetGain, dryGain: !!dryGain, delayNode: !!deckADelayRef.current });
      } else {
        console.warn('❌ Delay effect nodes not found');
      }
    } else {
      console.warn('❌ Delay effect not available - Web Audio not initialized');
    }
  }, []);

  const updateDeckAReverb = useCallback((reverbLevel: number) => {
    if (deckAConvolverRef.current && audioContextRef.current) {
      const wetGain = (deckAConvolverRef.current as any).wetGain;
      const dryGain = (deckAConvolverRef.current as any).dryGain;

      if (wetGain && dryGain) {
        const wetLevel = reverbLevel / 100 * 0.6; // Max 60% wet
        const dryLevel = 1 - wetLevel * 0.3; // Reduce dry slightly when wet is on

        wetGain.gain.setValueAtTime(wetLevel, audioContextRef.current.currentTime);
        dryGain.gain.setValueAtTime(dryLevel, audioContextRef.current.currentTime);

        console.log('🎛️ Deck A Reverb:', reverbLevel + '%', 'wet:', wetLevel, 'dry:', dryLevel);
        console.log('🔧 Reverb nodes:', { wetGain: !!wetGain, dryGain: !!dryGain, convolver: !!deckAConvolverRef.current });
      } else {
        console.warn('❌ Reverb effect nodes not found');
      }
    } else {
      console.warn('❌ Reverb effect not available - Web Audio not initialized');
    }
  }, []);

  // Sound Effects (DJ Sound FX) - Routed through Web Audio master bus so live broadcasts hear them too
  const playSoundEffect = useCallback(async (effectType: 'siren' | 'scratch' | 'laser' | 'horn' | 'whoosh' | 'zap') => {
    const effectFiles = {
      horn: 'air-horn-djmix-1.mp3',
      siren: 'Siren-Sound2.mp3',
      scratch: 'dj-scratch-87179.mp3',
      whoosh: 're-verse-dj-fx-344132.mp3',
      laser: 'Laser_dancehall.mp3',
      zap: 'Explosion.mp3',
    };

    const audioPath = `./effects/${effectFiles[effectType]}`;

    try {
      const ctx = audioContextRef.current;
      const master = masterGainRef.current;

      if (ctx && master) {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        let buffer = sfxBufferCacheRef.current.get(audioPath);
        if (!buffer) {
          const response = await fetch(audioPath);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          buffer = await ctx.decodeAudioData(arrayBuffer);
          sfxBufferCacheRef.current.set(audioPath, buffer);
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const sfxGain = ctx.createGain();
        sfxGain.gain.value = 0.85;
        source.connect(sfxGain);
        sfxGain.connect(master);
        source.start(0);
        return;
      }
    } catch (webAudioErr) {
      console.warn(`Web Audio SFX fallback for ${effectType}:`, webAudioErr);
    }

    // Fallback to plain HTML5 Audio
    try {
      const audio = new Audio(audioPath);
      audio.volume = 0.8 * (masterVolumeRef.current / 100);
      await audio.play();
      audio.addEventListener('ended', () => audio.remove(), { once: true });
    } catch (error) {
      console.warn(`❌ Failed to play ${effectType} effect:`, error);
    }
  }, []);

  // Effect controls for Deck B
  const updateDeckBDelay = useCallback((delayTime: number) => {
    if (deckBDelayRef.current && audioContextRef.current) {
      // Set delay time (0-1 seconds)
      deckBDelayRef.current.delayTime.setValueAtTime(delayTime, audioContextRef.current.currentTime);

      // Set wet/dry mix based on delay time
      const wetGain = (deckBDelayRef.current as any).wetGain;
      const dryGain = (deckBDelayRef.current as any).dryGain;

      if (wetGain && dryGain) {
        const wetLevel = delayTime > 0 ? 0.4 : 0; // 40% wet when delay is on
        const dryLevel = 1 - wetLevel * 0.3; // Reduce dry slightly when wet is on

        wetGain.gain.setValueAtTime(wetLevel, audioContextRef.current.currentTime);
        dryGain.gain.setValueAtTime(dryLevel, audioContextRef.current.currentTime);

        console.log('🎛️ Deck B Delay:', delayTime + 's', 'wet:', wetLevel, 'dry:', dryLevel);
      } else {
        console.warn('❌ Deck B Delay effect nodes not found');
      }
    } else {
      console.warn('❌ Deck B Delay effect not available - Web Audio not initialized');
    }
  }, []);

  const updateDeckBReverb = useCallback((reverbLevel: number) => {
    if (deckBConvolverRef.current && audioContextRef.current) {
      const wetGain = (deckBConvolverRef.current as any).wetGain;
      const dryGain = (deckBConvolverRef.current as any).dryGain;

      if (wetGain && dryGain) {
        const wetLevel = reverbLevel / 100 * 0.6; // Max 60% wet
        const dryLevel = 1 - wetLevel * 0.3; // Reduce dry slightly when wet is on

        wetGain.gain.setValueAtTime(wetLevel, audioContextRef.current.currentTime);
        dryGain.gain.setValueAtTime(dryLevel, audioContextRef.current.currentTime);

        console.log('🎛️ Deck B Reverb:', reverbLevel + '%', 'wet:', wetLevel, 'dry:', dryLevel);
      } else {
        console.warn('❌ Deck B Reverb effect nodes not found');
      }
    } else {
      console.warn('❌ Deck B Reverb effect not available - Web Audio not initialized');
    }
  }, []);

  const updateDeckBEQ = useCallback((eq: { high?: number; mid?: number; low?: number }) => {
    dispatch(setDeckBEQ(eq));

    if (eq.high !== undefined) deckBEQRef.current.high = toSafeNumber(eq.high, 50);
    if (eq.mid !== undefined) deckBEQRef.current.mid = toSafeNumber(eq.mid, 50);
    if (eq.low !== undefined) deckBEQRef.current.low = toSafeNumber(eq.low, 50);

    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Initialize Web Audio if not already done on active AudioContext
    if (ctx && deckBAudioRef.current && masterGainRef.current && deckBSourceRef.current?.context !== ctx) {
      initializeWebAudioForDeckB();
    }

    if (!ctx || ctx.state === 'closed') return;
    const now = ctx.currentTime;

    const applyFilterGain = (node: BiquadFilterNode | null, value: number) => {
      if (!node || node.context !== ctx) return;
      const gainDb = eqSliderToDb(value);
      node.gain.cancelScheduledValues(now);
      if (ctx.state === 'running') {
        node.gain.setTargetAtTime(gainDb, now, 0.015);
      } else {
        node.gain.value = gainDb;
      }
    };

    if (eq.high !== undefined) applyFilterGain(deckBHighRef.current, eq.high);
    if (eq.mid !== undefined) applyFilterGain(deckBMidRef.current, eq.mid);
    if (eq.low !== undefined) applyFilterGain(deckBLowRef.current, eq.low);
  }, [dispatch, initializeWebAudioForDeckB]);

  // Effects controls with real audio processing
  const updateDeckAEffects = useCallback((effects: { delay?: number; reverb?: number; filter?: number }) => {
    dispatch(setDeckAEffects(effects));

    // Apply delay/echo effect
    if (effects.delay !== undefined && deckADelayRef.current) {
      // Convert 0-100 range to 0-1 second delay
      const delayTime = (effects.delay / 100) * 1.0;
      deckADelayRef.current.delayTime.setValueAtTime(delayTime, audioContextRef.current?.currentTime || 0);
    }

    // Apply reverb effect (simplified - in production you'd load impulse responses)
    if (effects.reverb !== undefined && deckAConvolverRef.current && audioContextRef.current) {
      // Create a simple reverb impulse response
      const reverbTime = (effects.reverb / 100) * 3; // 0-3 seconds
      const sampleRate = audioContextRef.current.sampleRate;
      const length = sampleRate * reverbTime;
      const impulse = audioContextRef.current.createBuffer(2, length, sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const channelData = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        }
      }

      deckAConvolverRef.current.buffer = impulse;
    }
  }, [dispatch]);

  const updateDeckBEffects = useCallback((effects: { delay?: number; reverb?: number; filter?: number }) => {
    dispatch(setDeckBEffects(effects));

    // Apply delay/echo effect
    if (effects.delay !== undefined && deckBDelayRef.current) {
      const delayTime = (effects.delay / 100) * 1.0;
      deckBDelayRef.current.delayTime.setValueAtTime(delayTime, audioContextRef.current?.currentTime || 0);
    }

    // Apply reverb effect
    if (effects.reverb !== undefined && deckBConvolverRef.current && audioContextRef.current) {
      const reverbTime = (effects.reverb / 100) * 3;
      const sampleRate = audioContextRef.current.sampleRate;
      const length = sampleRate * reverbTime;
      const impulse = audioContextRef.current.createBuffer(2, length, sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const channelData = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        }
      }

      deckBConvolverRef.current.buffer = impulse;
    }
  }, [dispatch]);

  // Recording controls
  const toggleRecording = useCallback(() => {
    dispatch(setRecording(!musicPlayerState.isRecording));
  }, [dispatch, musicPlayerState.isRecording]);

  // BPM and sync
  const syncBPM = useCallback(() => {
    const deckABPM = musicPlayerState.bpmA;
    const deckBBPM = musicPlayerState.bpmB;

    if (deckAAudioRef.current && deckBAudioRef.current && deckABPM && deckBBPM) {
      // Calculate playback rate to sync BPMs
      const targetBPM = deckABPM; // Use Deck A as master
      const playbackRate = targetBPM / deckBBPM;

      // Apply playback rate to Deck B to match Deck A's BPM
      deckBAudioRef.current.playbackRate = Math.max(0.5, Math.min(2.0, playbackRate));

      console.log(`🎵 BPM Sync: Deck A (${deckABPM} BPM) ← Deck B (${deckBBPM} BPM → ${targetBPM} BPM)`);
      console.log(`📈 Deck B playback rate: ${playbackRate.toFixed(2)}x`);

      // Update sync state
      dispatch(setSynced(true));
    } else {
      console.warn('❌ Cannot sync BPM - missing audio elements or BPM data');
    }
  }, [musicPlayerState.bpmA, musicPlayerState.bpmB, dispatch]);

  // BPM Unsync functionality
  const unsyncBPM = useCallback(() => {
    console.log('🎵 BPM Unsync: Restoring original playback rates');

    if (deckBAudioRef.current) {
      deckBAudioRef.current.playbackRate = 1.0; // Reset to normal speed
      console.log('📈 Deck B playback rate reset to: 1.0x');
      dispatch(setSynced(false));
    }
  }, [dispatch]);

  // Reset functions
  const resetDeckAState = useCallback(() => {
    pauseDeckA();
    dispatch(resetDeckA());
  }, [dispatch, pauseDeckA]);

  const resetDeckBState = useCallback(() => {
    pauseDeckB();
    dispatch(resetDeckB());
  }, [dispatch, pauseDeckB]);

  const resetMixerState = useCallback(() => {
    dispatch(resetMixer());
  }, [dispatch]);

  // Reset all loading states (useful for debugging)
  const resetLoadingStates = useCallback(() => {
    dispatch(setDeckALoading(false));
    dispatch(setDeckBLoading(false));
    dispatch(setLoadingSongs(false));
  }, [dispatch]);

  // Debug Web Audio state
  const debugWebAudioState = useCallback(() => {
    console.log('🔧 Web Audio Debug State:');
    console.log('- Audio Context:', !!audioContextRef.current, audioContextRef.current?.state);
    console.log('- Master Gain:', !!masterGainRef.current, masterGainRef.current?.gain.value);
    console.log('- Deck A Source:', !!deckASourceRef.current);
    console.log('- Deck B Source:', !!deckBSourceRef.current);
    console.log('- Deck A Audio:', !!deckAAudioRef.current, deckAAudioRef.current?.volume);
    console.log('- Deck B Audio:', !!deckBAudioRef.current, deckBAudioRef.current?.volume);
    console.log('- Current State:', {
      masterVolume: musicPlayerState.masterVolume,
      crossfader: musicPlayerState.crossfader,
      deckAVolume: musicPlayerState.deckA.volume,
      deckBVolume: musicPlayerState.deckB.volume
    });
  }, [musicPlayerState]);

  // Test audio playback directly (for debugging)
  const testAudioPlayback = useCallback(async () => {
    console.log('Testing direct audio playback...');
    const testAudio = new Audio('https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3');
    testAudio.crossOrigin = 'anonymous';

    testAudio.addEventListener('loadedmetadata', () => {
      console.log('Test audio metadata loaded, duration:', testAudio.duration);
    });

    testAudio.addEventListener('canplay', () => {
      console.log('Test audio can play, readyState:', testAudio.readyState);
    });

    testAudio.addEventListener('error', (e) => {
      console.error('Test audio error:', e, testAudio.error);
    });

    try {
      console.log('Loading test audio...');
      testAudio.load();

      console.log('Attempting to play test audio...');
      await testAudio.play();
      console.log('Test audio playing successfully!');

      // Stop after 2 seconds
      setTimeout(() => {
        testAudio.pause();
        console.log('Test audio stopped');
      }, 2000);
    } catch (error) {
      console.error('Test audio playback failed:', error);
    }
  }, []);

  // Quick effect toggles
  const toggleDeckAEcho = useCallback(() => {
    if (deckADelayRef.current && audioContextRef.current) {
      const wetGain = (deckADelayRef.current as any).wetGain;
      const currentWet = wetGain?.gain.value || 0;

      if (currentWet > 0) {
        // Turn off echo
        updateDeckADelay(0);
        console.log('🔇 Deck A Echo OFF');
      } else {
        // Turn on echo with 300ms delay
        updateDeckADelay(0.3);
        console.log('🔊 Deck A Echo ON (300ms delay)');
      }
    }
  }, [updateDeckADelay]);

  const toggleDeckBEcho = useCallback(() => {
    if (deckBDelayRef.current && audioContextRef.current) {
      const wetGain = (deckBDelayRef.current as any).wetGain;
      const currentWet = wetGain?.gain.value || 0;

      if (currentWet > 0) {
        // Turn off echo
        updateDeckBDelay(0);
        console.log('🔇 Deck B Echo OFF');
      } else {
        // Turn on echo with 300ms delay
        updateDeckBDelay(0.3);
        console.log('🔊 Deck B Echo ON (300ms delay)');
      }
    }
  }, [updateDeckBDelay]);

  const toggleDeckAReverb = useCallback(() => {
    if (deckAConvolverRef.current && audioContextRef.current) {
      const wetGain = (deckAConvolverRef.current as any).wetGain;
      const currentWet = wetGain?.gain.value || 0;

      if (currentWet > 0) {
        // Turn off reverb
        updateDeckAReverb(0);
        console.log('🔇 Deck A Reverb OFF');
      } else {
        // Turn on reverb at 50%
        updateDeckAReverb(50);
        console.log('🔊 Deck A Reverb ON (50% wet)');
      }
    }
  }, [updateDeckAReverb]);

  const toggleDeckBReverb = useCallback(() => {
    if (deckBConvolverRef.current && audioContextRef.current) {
      const wetGain = (deckBConvolverRef.current as any).wetGain;
      const currentWet = wetGain?.gain.value || 0;

      if (currentWet > 0) {
        // Turn off reverb
        updateDeckBReverb(0);
        console.log('🔇 Deck B Reverb OFF');
      } else {
        // Turn on reverb at 50%
        updateDeckBReverb(50);
        console.log('🔊 Deck B Reverb ON (50% wet)');
      }
    }
  }, [updateDeckBReverb]);

  // Loop and Cue functionality for Deck A
  const setDeckALoopIn = useCallback((position: number) => {
    if (deckAAudioRef.current) {
      deckAAudioRef.current.dataset.loopIn = position.toString();
      console.log(`🔄 Deck A Loop IN set at: ${position.toFixed(2)}s`);
    }
  }, []);

  const setDeckALoopOut = useCallback((position: number) => {
    if (deckAAudioRef.current) {
      deckAAudioRef.current.dataset.loopOut = position.toString();
      console.log(`🔄 Deck A Loop OUT set at: ${position.toFixed(2)}s`);
    }
  }, []);

  const toggleDeckALoop = useCallback(() => {
    if (deckAAudioRef.current) {
      const loopIn = parseFloat(deckAAudioRef.current.dataset.loopIn || '0');
      const loopOut = parseFloat(deckAAudioRef.current.dataset.loopOut || '0');
      const isLooping = deckAAudioRef.current.dataset.isLooping === 'true';

      if (loopIn && loopOut && loopOut > loopIn) {
        deckAAudioRef.current.dataset.isLooping = (!isLooping).toString();
        console.log(`🔄 Deck A Loop ${!isLooping ? 'ON' : 'OFF'}: ${loopIn.toFixed(2)}s - ${loopOut.toFixed(2)}s`);

        if (!isLooping) {
          // Start loop monitoring
          const checkLoop = () => {
            if (deckAAudioRef.current && deckAAudioRef.current.dataset.isLooping === 'true') {
              const currentTime = deckAAudioRef.current.currentTime;
              if (currentTime >= loopOut) {
                deckAAudioRef.current.currentTime = loopIn;
                console.log(`🔄 Deck A Loop: Jumped back to ${loopIn.toFixed(2)}s`);
              }
              setTimeout(checkLoop, 100); // Check every 100ms
            }
          };
          checkLoop();
        }
      } else {
        console.warn('❌ Deck A: Set both Loop IN and OUT points first');
      }
    }
  }, []);

  const setDeckACuePoint = useCallback((position: number) => {
    if (deckAAudioRef.current) {
      deckAAudioRef.current.dataset.cuePoint = position.toString();
      console.log(`🎯 Deck A Cue point set at: ${position.toFixed(2)}s`);
    }
  }, []);

  const jumpToDeckACue = useCallback(() => {
    if (deckAAudioRef.current) {
      const cuePoint = parseFloat(deckAAudioRef.current.dataset.cuePoint || '0');
      if (cuePoint) {
        deckAAudioRef.current.currentTime = cuePoint;
        console.log(`🎯 Deck A: Jumped to cue point at ${cuePoint.toFixed(2)}s`);
      } else {
        console.warn('❌ Deck A: No cue point set');
      }
    }
  }, []);

  // Loop and Cue functionality for Deck B
  const setDeckBLoopIn = useCallback((position: number) => {
    if (deckBAudioRef.current) {
      deckBAudioRef.current.dataset.loopIn = position.toString();
      console.log(`🔄 Deck B Loop IN set at: ${position.toFixed(2)}s`);
    }
  }, []);

  const setDeckBLoopOut = useCallback((position: number) => {
    if (deckBAudioRef.current) {
      deckBAudioRef.current.dataset.loopOut = position.toString();
      console.log(`🔄 Deck B Loop OUT set at: ${position.toFixed(2)}s`);
    }
  }, []);

  const toggleDeckBLoop = useCallback(() => {
    if (deckBAudioRef.current) {
      const loopIn = parseFloat(deckBAudioRef.current.dataset.loopIn || '0');
      const loopOut = parseFloat(deckBAudioRef.current.dataset.loopOut || '0');
      const isLooping = deckBAudioRef.current.dataset.isLooping === 'true';

      if (loopIn && loopOut && loopOut > loopIn) {
        deckBAudioRef.current.dataset.isLooping = (!isLooping).toString();
        console.log(`🔄 Deck B Loop ${!isLooping ? 'ON' : 'OFF'}: ${loopIn.toFixed(2)}s - ${loopOut.toFixed(2)}s`);

        if (!isLooping) {
          // Start loop monitoring
          const checkLoop = () => {
            if (deckBAudioRef.current && deckBAudioRef.current.dataset.isLooping === 'true') {
              const currentTime = deckBAudioRef.current.currentTime;
              if (currentTime >= loopOut) {
                deckBAudioRef.current.currentTime = loopIn;
                console.log(`🔄 Deck B Loop: Jumped back to ${loopIn.toFixed(2)}s`);
              }
              setTimeout(checkLoop, 100); // Check every 100ms
            }
          };
          checkLoop();
        }
      } else {
        console.warn('❌ Deck B: Set both Loop IN and OUT points first');
      }
    }
  }, []);

  const setDeckBCuePoint = useCallback((position: number) => {
    if (deckBAudioRef.current) {
      deckBAudioRef.current.dataset.cuePoint = position.toString();
      console.log(`🎯 Deck B Cue point set at: ${position.toFixed(2)}s`);
    }
  }, []);

  const jumpToDeckBCue = useCallback(() => {
    if (deckBAudioRef.current) {
      const cuePoint = parseFloat(deckBAudioRef.current.dataset.cuePoint || '0');
      if (cuePoint) {
        deckBAudioRef.current.currentTime = cuePoint;
        console.log(`🎯 Deck B: Jumped to cue point at ${cuePoint.toFixed(2)}s`);
      } else {
        console.warn('❌ Deck B: No cue point set');
      }
    }
  }, []);

  // Beat Jump functionality
  const beatJumpDeckA = useCallback((beats: number) => {
    if (deckAAudioRef.current) {
      const bpm = musicPlayerState.bpmA || 128;
      const secondsPerBeat = 60 / bpm;
      const jumpTime = beats * secondsPerBeat;
      const newTime = Math.max(0, Math.min(deckAAudioRef.current.duration, deckAAudioRef.current.currentTime + jumpTime));

      deckAAudioRef.current.currentTime = newTime;
      console.log(`⏭️ Deck A Beat Jump: ${beats > 0 ? '+' : ''}${beats} beats (${jumpTime.toFixed(2)}s) to ${newTime.toFixed(2)}s`);
    }
  }, [musicPlayerState.bpmA]);

  const beatJumpDeckB = useCallback((beats: number) => {
    if (deckBAudioRef.current) {
      const bpm = musicPlayerState.bpmB || 128;
      const secondsPerBeat = 60 / bpm;
      const jumpTime = beats * secondsPerBeat;
      const newTime = Math.max(0, Math.min(deckBAudioRef.current.duration, deckBAudioRef.current.currentTime + jumpTime));

      deckBAudioRef.current.currentTime = newTime;
      console.log(`⏭️ Deck B Beat Jump: ${beats > 0 ? '+' : ''}${beats} beats (${jumpTime.toFixed(2)}s) to ${newTime.toFixed(2)}s`);
    }
  }, [musicPlayerState.bpmB]);

  // Ensure we have a valid state object
  if (!musicPlayerState || typeof musicPlayerState !== 'object') {
    console.error('Invalid musicPlayerState:', musicPlayerState);
    // Return a completely safe default state
    return {
      deckA: { currentTrack: null, isPlaying: false, volume: 75, position: 0, duration: 0, isLoading: false },
      deckB: { currentTrack: null, isPlaying: false, volume: 75, position: 0, duration: 0, isLoading: false },
      crossfader: 50,
      masterVolume: 75,
      deckAEQ: { high: 50, mid: 50, low: 50 },
      deckBEQ: { high: 50, mid: 50, low: 50 },
      deckAEffects: { reverb: 0, delay: 0, filter: 50, distortion: 0, chorus: 0, flanger: 0 },
      deckBEffects: { reverb: 0, delay: 0, filter: 50, distortion: 0, chorus: 0, flanger: 0 },
      djSongs: [],
      isLoadingSongs: false,
      isRecording: false,
      recordingDuration: 0,
      bpmA: 128,
      bpmB: 128,
      isSynced: false,
      loadDJSongs: () => {},
      loadTrackToDeckA: () => {},
      playDeckA: () => {},
      pauseDeckA: () => {},
      toggleDeckA: () => {},
      updateDeckAVolume: () => {},
      updateDeckAEQ: () => {},
      updateDeckAEffects: () => {},
      resetDeckAState: () => {},
      loadTrackToDeckB: () => {},
      playDeckB: () => {},
      pauseDeckB: () => {},
      toggleDeckB: () => {},
      updateDeckBVolume: () => {},
      updateDeckBEQ: () => {},
      updateDeckBEffects: () => {},
      resetDeckBState: () => {},
      updateMasterVolume: () => {},
      updateCrossfader: () => {},
      resetMixerState: () => {},
      toggleRecording: () => {},
      syncBPM: () => {},
      unsyncBPM: () => {},
      toggleDeckAEcho: () => {},
      toggleDeckBEcho: () => {},
      toggleDeckAReverb: () => {},
      toggleDeckBReverb: () => {},
      resetLoadingStates: () => {},
    };
  }

  return {
    // State - explicitly return individual properties with fallbacks
    deckA: musicPlayerState?.deckA || { currentTrack: null, isPlaying: false, volume: 75, position: 0, duration: 0, isLoading: false },
    deckB: musicPlayerState?.deckB || { currentTrack: null, isPlaying: false, volume: 75, position: 0, duration: 0, isLoading: false },
    crossfader: musicPlayerState?.crossfader ?? 50,
    masterVolume: musicPlayerState?.masterVolume ?? 75,
    deckAEQ: musicPlayerState?.deckAEQ || { high: 50, mid: 50, low: 50 },
    deckBEQ: musicPlayerState?.deckBEQ || { high: 50, mid: 50, low: 50 },
    deckAEffects: musicPlayerState?.deckAEffects || { reverb: 0, delay: 0, filter: 50, distortion: 0, chorus: 0, flanger: 0 },
    deckBEffects: musicPlayerState?.deckBEffects || { reverb: 0, delay: 0, filter: 50, distortion: 0, chorus: 0, flanger: 0 },
    djSongs: Array.isArray(musicPlayerState?.djSongs) ? musicPlayerState.djSongs : [],
    isLoadingSongs: musicPlayerState?.isLoadingSongs ?? false,
    isRecording: musicPlayerState?.isRecording ?? false,
    recordingDuration: musicPlayerState?.recordingDuration ?? 0,
    bpmA: musicPlayerState?.bpmA ?? 128,
    bpmB: musicPlayerState?.bpmB ?? 128,
    isSynced: musicPlayerState?.isSynced ?? false,

    // DJ Songs
    loadDJSongs,
    
    // Deck A controls
    loadTrackToDeckA,
    playDeckA,
    pauseDeckA,
    stopDeckA,
    toggleDeckA,
    updateDeckAVolume,
    updateDeckAEQ,
    updateDeckADelay,
    updateDeckAReverb,
    updateDeckAEffects,
    resetDeckAState,

    // Sound Effects
    playSoundEffect,
    
    // Deck B controls
    loadTrackToDeckB,
    playDeckB,
    pauseDeckB,
    stopDeckB,
    toggleDeckB,
    updateDeckBVolume,
    updateDeckBEQ,
    updateDeckBDelay,
    updateDeckBReverb,
    updateDeckBEffects,
    resetDeckBState,
    
    // Mixer controls
    updateMasterVolume,
    updateCrossfader,
    resetMixerState,
    
    // Recording
    toggleRecording,
    
    // BPM and sync
    syncBPM,
    unsyncBPM,

    // Quick effect toggles
    toggleDeckAEcho,
    toggleDeckBEcho,
    toggleDeckAReverb,
    toggleDeckBReverb,

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

    // Debug/utility functions
    resetLoadingStates,
    testAudioPlayback,
    debugWebAudioState,
  };
};