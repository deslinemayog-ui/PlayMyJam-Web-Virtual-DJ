import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyAIMCCommentTarget,
  requestAIMCSpeak,
  type AIMCAccent,
  type AIMCEnergy,
  type AIMCEventType,
  type AIMCVoiceName,
} from '@/lib/playServerApi';
import {
  GeminiLiveMCClient,
  type GeminiLiveSessionConfig,
} from '@/lib/geminiLiveMC';
import type {
  TikTokChatEvent,
  TikTokGiftEvent,
  TikTokMemberEvent,
  TikTokSocialEvent,
  TikTokSongRequestFeedbackEvent,
} from '@/types/tiktok';

const AI_MC_STORAGE_KEY = 'playmyjam_ai_mc_v1';

export interface AIMCConfig {
  enabled: boolean;
  mcName: string;
  aboutLive: string;
  accent: AIMCAccent;
  voiceName: AIMCVoiceName;
  energy: AIMCEnergy;
  useGeminiVoice: boolean;
  mcVolume: number; // 0 - 100
  autoDuckMusic: boolean;
  duckMusicTo: number; // 10 - 80 (% music volume while speaking)
  welcomeJoins: boolean;
  alwaysTalkToJoiners: boolean; // ON = greet every joiner; OFF = randomly pick joiners
  answerQuestions: boolean;
  commentReplyMode: 'host_questions' | 'all';
  hostFilterMigrated?: boolean;
  hypeGifts: boolean;
  hypeFollows: boolean;
  announceTracks: boolean;
  announceRequests: boolean;
  joinCooldownSec: number;
  questionCooldownSec: number;
  minGiftCoinsToHype: number;
  maxShoutoutsPerHour: number; // 0 = Unlimited; default 60 (~$0.14/hr max)
}

export interface AIMCLiveStats {
  joinsSeen: number;
  commentsSeen: number;
  giftsSeen: number;
  lastEventNote: string;
}

export interface AIMCLogItem {
  id: string;
  eventType: AIMCEventType;
  viewerName?: string;
  triggerDetail?: string;
  spokenText: string;
  usedGeminiVoice: boolean;
  latencyMs?: number;
  transport?: 'live' | 'rest' | 'browser';
  timestamp: number;
}

interface AIMCQueueJob {
  id: string;
  priority: number; // Lower = higher priority
  eventType: AIMCEventType;
  viewerName?: string;
  viewerNames?: string[];
  question?: string;
  giftName?: string;
  giftCount?: number;
  giftCoins?: number;
  songTitle?: string;
  requiredCoins?: number;
  customText?: string;
  triggerDetail?: string;
  bypassEnabled?: boolean; // For manual test buttons & custom announcements
  createdAt: number;
}

export interface UseAIMCParams {
  djName?: string;
  hostHandle?: string;
  geminiApiKey?: string;
  isModalOpen?: boolean;
  isTikTokConnected?: boolean;
  currentTrack?: { id?: string; title: string; artist: string } | null;
  onDuckMusic?: (active: boolean, duckPercent?: number) => void;
}

const DEFAULT_AI_MC_CONFIG: AIMCConfig = {
  enabled: false,
  mcName: 'MC Tino',
  aboutLive:
    'Here we play nonstop club hits, Zimdancehall, Amapiano, and Sungura — tap the screen and drop a gift to request your favorite jam!',
  accent: 'zim',
  voiceName: 'Fenrir',
  energy: 'hype',
  useGeminiVoice: true,
  mcVolume: 95,
  autoDuckMusic: true,
  duckMusicTo: 32,
  welcomeJoins: true,
  alwaysTalkToJoiners: false,
  answerQuestions: true,
  commentReplyMode: 'host_questions',
  hostFilterMigrated: true,
  hypeGifts: true,
  hypeFollows: true,
  announceTracks: false,
  announceRequests: true,
  joinCooldownSec: 18,
  questionCooldownSec: 5,
  minGiftCoinsToHype: 1,
  maxShoutoutsPerHour: 60,
};

function loadSavedAIMCConfig(): AIMCConfig {
  try {
    const raw = localStorage.getItem(AI_MC_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_MC_CONFIG;
    const parsed = JSON.parse(raw);
    const maxPerHr = Number(parsed.maxShoutoutsPerHour ?? DEFAULT_AI_MC_CONFIG.maxShoutoutsPerHour);
    // One-time migration: switch legacy saved 'all' / 'questions' configs to smart 'host_questions'
    // so viewers talking among themselves are ignored by default.
    const migratedMode: 'host_questions' | 'all' = !parsed.hostFilterMigrated
      ? 'host_questions'
      : parsed.commentReplyMode === 'all'
        ? 'all'
        : 'host_questions';
    const next: AIMCConfig = {
      ...DEFAULT_AI_MC_CONFIG,
      ...parsed,
      alwaysTalkToJoiners: parsed.alwaysTalkToJoiners === true,
      commentReplyMode: migratedMode,
      hostFilterMigrated: true,
      announceRequests: parsed.announceRequests !== false,
      mcVolume: Math.max(10, Math.min(100, Number(parsed.mcVolume ?? DEFAULT_AI_MC_CONFIG.mcVolume))),
      duckMusicTo: Math.max(10, Math.min(80, Number(parsed.duckMusicTo ?? DEFAULT_AI_MC_CONFIG.duckMusicTo))),
      joinCooldownSec: Math.max(5, Math.min(120, Number(parsed.joinCooldownSec ?? DEFAULT_AI_MC_CONFIG.joinCooldownSec))),
      questionCooldownSec: Math.max(2, Math.min(90, Number(parsed.questionCooldownSec ?? DEFAULT_AI_MC_CONFIG.questionCooldownSec))),
      minGiftCoinsToHype: Math.max(1, Math.floor(Number(parsed.minGiftCoinsToHype ?? 1))),
      maxShoutoutsPerHour: Number.isFinite(maxPerHr) && maxPerHr >= 0 ? Math.min(500, Math.floor(maxPerHr)) : 60,
    };
    if (!parsed.hostFilterMigrated) {
      try {
        localStorage.setItem(AI_MC_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
    }
    return next;
  } catch {
    return DEFAULT_AI_MC_CONFIG;
  }
}

function cleanDisplayName(nickname?: string, uniqueId?: string): string {
  const candidate = (nickname || uniqueId || '').trim();
  const stripped = candidate
    .replace(/^@+/, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\d{3,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return (uniqueId || 'friend').replace(/^@+/, '').slice(0, 18) || 'friend';
  return stripped.split(' ').slice(0, 2).join(' ').slice(0, 22);
}

/**
 * Checks if a TikTok LIVE comment has real readable text (ignoring pure emoji spam and /play commands).
 */
export function isSpeakableChatComment(comment: string, isSongRequest: boolean): boolean {
  if (isSongRequest) return false;
  const trimmed = (comment || '').trim();
  if (trimmed.length < 2 || trimmed.length > 240) return false;
  if (/^\/(play|req|request|song)\b/i.test(trimmed)) return false;
  // Require at least 2 letters/numbers so pure emoji or punctuation spam is skipped
  const alphaNum = trimmed.replace(/[^a-zA-Z0-9]/g, '');
  return alphaNum.length >= 2;
}

/**
 * Detects whether a TikTok LIVE comment is a viewer question worth checking for the mic.
 * Supports both English and Shona questions anywhere in the message.
 */
export function isViewerQuestionComment(comment: string, isSongRequest: boolean): boolean {
  if (!isSpeakableChatComment(comment, isSongRequest)) return false;
  const trimmed = (comment || '').trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes('?')) return true;

  const questionPatterns = [
    /\b(what|whats|what's|who|whos|who's|where|wheres|where's|when|why|how|hows|how's|which)\b/,
    /\b(can you|can u|could you|could u|do you|do u|are you|are u|is this|is that|will you|did you|tell me|anyone know)\b/,
    /\b(song name|track name|track id|song id|name of (this|the) song|who sings|what artist|which song|how to request|how many coins|what app|which country|what city|what time)\b/,
    /\b(ndiani|chii|sei|kupi|ndekupi|ngoma ipi|ngoma iyi|rwiyo rupi|munobva kupi|unobva kupi|unogara kupi|uri kupi|wakadii|wakadini|makadii|makadini|bho here|munopedza rini|muri kupi)\b/,
  ];

  return questionPatterns.some((re) => re.test(lower));
}

function normalizeHandleToken(value: string): string {
  return (value || '').toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9]/g, '');
}

/**
 * Fast 0ms local check for comments clearly addressed to ANOTHER viewer (not the host/DJ/MC):
 * 1) @mentions targeting a handle that doesn't match the DJ, MC, or host TikTok handle.
 * 2) Comments starting with another recent viewer's name/handle (e.g. "Jossy where are you?").
 */
export function isAddressedToOtherViewer(
  comment: string,
  hostAliases: string[],
  recentViewerNames: string[],
  senderName?: string
): { isOtherViewer: boolean; targetName?: string } {
  const trimmed = (comment || '').trim();
  if (!trimmed) return { isOtherViewer: false };

  const hostTokens = new Set<string>(['dj', 'mc', 'host', 'admin', 'selector']);
  for (const alias of hostAliases) {
    const full = normalizeHandleToken(alias);
    if (full.length >= 2) hostTokens.add(full);
    for (const part of alias.toLowerCase().split(/[\s._-]+/)) {
      const clean = part.replace(/[^a-z0-9]/g, '');
      if (clean.length >= 2) hostTokens.add(clean);
    }
  }

  // 1. Explicit @handle mention — if none of the @mentions refer to the host/DJ/MC, it's viewer-to-viewer
  const atMatches = trimmed.match(/@([a-zA-Z0-9._-]{2,32})/g);
  if (atMatches && atMatches.length > 0) {
    const mentionsHost = atMatches.some((raw) => {
      const token = normalizeHandleToken(raw);
      return (
        hostTokens.has(token) ||
        Array.from(hostTokens).some((h) => h.length >= 3 && (token.includes(h) || h.includes(token)))
      );
    });
    if (!mentionsHost) {
      return { isOtherViewer: true, targetName: atMatches[0] };
    }
  }

  // 2. Starts with another recent viewer's name (e.g. "Jossy, where are you?" or "Tino did you eat")
  const senderTokens = new Set(
    (senderName || '')
      .toLowerCase()
      .split(/[\s._-]+/)
      .map((s) => s.replace(/[^a-z0-9]/g, ''))
      .filter((s) => s.length >= 3)
  );
  const leadingMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9._-]{2,24})[\s,:;-]+/);
  if (leadingMatch && leadingMatch[1]) {
    const leadToken = normalizeHandleToken(leadingMatch[1]);
    if (leadToken.length >= 3 && !hostTokens.has(leadToken) && !senderTokens.has(leadToken)) {
      for (const viewer of recentViewerNames) {
        const viewerTokens = viewer
          .toLowerCase()
          .split(/[\s._-]+/)
          .map((s) => s.replace(/[^a-z0-9]/g, ''))
          .filter((s) => s.length >= 3);
        if (viewerTokens.includes(leadToken)) {
          return { isOtherViewer: true, targetName: leadingMatch[1] };
        }
      }
    }
  }

  return { isOtherViewer: false };
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
  return URL.createObjectURL(blob);
}

function buildLiveTurnPrompt(
  job: AIMCQueueJob,
  djName: string,
  track: { id?: string; title: string; artist: string } | null
): string {
  const trackText = track?.title
    ? `${track.title}${track.artist ? ` by ${track.artist}` : ''}`
    : 'No song currently playing';

  switch (job.eventType) {
    case 'join': {
      const names =
        job.viewerNames && job.viewerNames.length > 0
          ? job.viewerNames.join(', ')
          : job.viewerName || 'my friend';
      return `Viewer(s) just joined DJ ${djName}'s live: ${names}. Welcome them warmly by name in 1-2 punchy MC sentences!`;
    }
    case 'question':
      return `Viewer ${job.viewerName || 'friend'} wrote in live chat: "${job.question || ''}". Currently playing: ${trackText}. Mention ${job.viewerName || 'them'} by name and respond right away in 1-2 short MC sentences (answer accurately if it's a question, or react & hype them back if it's a greeting/comment).`;
    case 'gift':
      return `Viewer ${job.viewerName || 'friend'} just dropped ${job.giftCount || 1}x ${job.giftName || 'gift'} (${job.giftCoins || 1} coins)! Give them a loud hype MC shoutout and remind them they can drop a song request in chat!`;
    case 'follow':
      return `Viewer ${job.viewerName || 'friend'} just followed DJ ${djName}! Give them a quick hyped MC welcome to the family.`;
    case 'share':
      return `Viewer ${job.viewerName || 'friend'} just shared the live! Give them a quick hyped MC shoutout.`;
    case 'now_playing':
      return `Now dropping on the decks: ${trackText}. Hype this track in 1 quick club MC sentence!`;
    case 'song_queued':
      return `Viewer ${job.viewerName || 'friend'} just requested "${job.songTitle || job.question || 'a track'}" and it's locked into DJ ${djName}'s queue! Hype ${job.viewerName || 'them'} up and announce their track is coming up!`;
    case 'song_need_coins':
      return `Viewer ${job.viewerName || 'friend'} asked for "${job.songTitle || job.question || 'a track'}", which needs ${job.requiredCoins || 1} TikTok coins to unlock! Playfully hype ${job.viewerName || 'them'} in 1 friendly MC line to drop ${job.requiredCoins || 1} coins so DJ ${djName} drops it next!`;
    case 'ai_song_cooking':
      return `VIP moment! ${job.viewerName || 'friend'} just unlocked a brand-new custom AI song ("${job.songTitle || job.question || 'VIP banger'}") created live on the spot! Hype the crowd while the studio cooks it up right now!`;
    case 'ai_song_ready':
      return `World premiere! ${job.viewerName || 'friend'}'s brand-new custom AI song "${job.songTitle || 'VIP track'}" just came fresh out the PlayMyJam AI studio and is dropping on DJ ${djName}'s decks right now — hype it up!`;
    case 'custom':
      return `Deliver this live DJ announcement right now in your MC voice: "${job.customText || ''}"`;
    default:
      return `Drop a fresh 1-sentence crowd hype shoutout for DJ ${djName}'s live! Currently playing: ${trackText}.`;
  }
}

export const useAIMC = ({
  djName = 'DJ',
  hostHandle = '',
  geminiApiKey = '',
  isModalOpen = false,
  isTikTokConnected = false,
  currentTrack = null,
  onDuckMusic,
}: UseAIMCParams = {}) => {
  const [config, setConfig] = useState<AIMCConfig>(() => loadSavedAIMCConfig());
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentLine, setCurrentLine] = useState<string>('');
  const [currentEventType, setCurrentEventType] = useState<AIMCEventType | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [history, setHistory] = useState<AIMCLogItem[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastVoiceMode, setLastVoiceMode] = useState<'gemini-live' | 'gemini' | 'browser' | null>(null);
  const [isLiveStreamConnected, setIsLiveStreamConnected] = useState(false);
  const [liveModelName, setLiveModelName] = useState<string>('');
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [shoutoutsThisHour, setShoutoutsThisHour] = useState<number>(0);
  const [liveStats, setLiveStats] = useState<AIMCLiveStats>({
    joinsSeen: 0,
    commentsSeen: 0,
    giftsSeen: 0,
    lastEventNote: '',
  });

  const configRef = useRef<AIMCConfig>(config);
  const djNameRef = useRef<string>(djName);
  const hostHandleRef = useRef<string>(hostHandle);
  const geminiApiKeyRef = useRef<string>(geminiApiKey);
  const currentTrackRef = useRef<{ id?: string; title: string; artist: string } | null>(currentTrack);
  const onDuckMusicRef = useRef(onDuckMusic);
  const liveClientRef = useRef<GeminiLiveMCClient | null>(null);

  if (!liveClientRef.current && typeof window !== 'undefined') {
    liveClientRef.current = new GeminiLiveMCClient((connected, model) => {
      setIsLiveStreamConnected(connected);
      if (model) setLiveModelName(model.replace(/^models\//, ''));
    });
  }

  const queueRef = useRef<AIMCQueueJob[]>([]);
  const isBusyRef = useRef(false);
  const recentLinesRef = useRef<string[]>([]);
  const recentChatMessagesRef = useRef<Array<{ sender: string; text: string; timestamp: number }>>([]);
  const recentParticipantsRef = useRef<Map<string, number>>(new Map());
  const greetedUsersRef = useRef<Map<string, number>>(new Map());
  const answeredQuestionsRef = useRef<Map<string, number>>(new Map());
  const pendingJoinNamesRef = useRef<string[]>([]);
  const joinBatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastJoinSpokenAtRef = useRef<number>(0);
  const lastQuestionSpokenAtRef = useRef<number>(0);
  const lastNeedCoinsAtRef = useRef<Map<string, number>>(new Map());
  const lastAnnouncedTrackIdRef = useRef<string>('');
  const spokenTimestampsRef = useRef<number[]>([]);

  // Active playback refs so Skip / Stop / Unmount always clean up cleanly
  const activeAudioElRef = useRef<HTMLAudioElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);
  const activeFinishResolverRef = useRef<(() => void) | null>(null);
  const isDuckedRef = useRef<boolean>(false);

  useEffect(() => {
    configRef.current = config;
    liveClientRef.current?.setVolume(config.mcVolume);
  }, [config]);

  useEffect(() => {
    djNameRef.current = djName || 'DJ';
  }, [djName]);

  useEffect(() => {
    hostHandleRef.current = (hostHandle || '').replace(/^@+/, '').trim();
  }, [hostHandle]);

  useEffect(() => {
    geminiApiKeyRef.current = geminiApiKey || '';
  }, [geminiApiKey]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    onDuckMusicRef.current = onDuckMusic;
  }, [onDuckMusic]);

  // Pre-warm the persistent Gemini Live WebSocket only when actively needed (TikTok LIVE + MC ON, or Studio modal open)
  useEffect(() => {
    const client = liveClientRef.current;
    if (!client) return;

    if (!config.useGeminiVoice || !geminiApiKey) {
      client.disconnect();
      return;
    }

    const shouldBeWarm = isModalOpen || (config.enabled && isTikTokConnected);
    if (shouldBeWarm) {
      const liveCfg: GeminiLiveSessionConfig = {
        apiKey: geminiApiKey,
        djName: djName || 'DJ',
        mcName: config.mcName,
        aboutLive: config.aboutLive,
        accent: config.accent,
        voiceName: config.voiceName,
        energy: config.energy,
      };
      client.setVolume(config.mcVolume);
      client.ensureConnected(liveCfg).catch(() => {
        // Fallback path will handle speak turns if WebSocket cannot connect
      });
    } else {
      client.disconnect();
    }
  }, [
    geminiApiKey,
    djName,
    isModalOpen,
    isTikTokConnected,
    config.enabled,
    config.useGeminiVoice,
    config.mcName,
    config.aboutLive,
    config.accent,
    config.voiceName,
    config.energy,
    config.mcVolume,
  ]);

  const setMusicDuck = useCallback((active: boolean) => {
    const cfg = configRef.current;
    if (active && !cfg.autoDuckMusic) return;
    if (active === isDuckedRef.current) return;
    isDuckedRef.current = active;
    onDuckMusicRef.current?.(active, cfg.duckMusicTo);
  }, []);

  const updateConfig = useCallback((patch: Partial<AIMCConfig>) => {
    setConfig((prev) => {
      const next: AIMCConfig = {
        ...prev,
        ...patch,
      };
      configRef.current = next;
      try {
        localStorage.setItem(AI_MC_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const stopActivePlayback = useCallback(() => {
    liveClientRef.current?.stopSpeaking();
    if (activeAudioElRef.current) {
      try {
        activeAudioElRef.current.pause();
        activeAudioElRef.current.src = '';
      } catch {
        // ignore
      }
      activeAudioElRef.current = null;
    }
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    if (activeFinishResolverRef.current) {
      const resolve = activeFinishResolverRef.current;
      activeFinishResolverRef.current = null;
      resolve();
    }
    setMusicDuck(false);
    setIsSpeaking(false);
  }, [setMusicDuck]);

  const playBase64Audio = useCallback(
    (base64: string, mimeType: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        try {
          const blobUrl = base64ToBlobUrl(base64, mimeType);
          activeBlobUrlRef.current = blobUrl;

          const audio = new Audio(blobUrl);
          audio.volume = Math.max(0.1, Math.min(1, configRef.current.mcVolume / 100));
          activeAudioElRef.current = audio;

          const cleanup = () => {
            if (activeAudioElRef.current === audio) {
              activeAudioElRef.current = null;
            }
            if (activeBlobUrlRef.current === blobUrl) {
              URL.revokeObjectURL(blobUrl);
              activeBlobUrlRef.current = null;
            }
            if (activeFinishResolverRef.current === finish) {
              activeFinishResolverRef.current = null;
            }
          };

          const finish = () => {
            cleanup();
            resolve();
          };

          activeFinishResolverRef.current = finish;

          audio.onended = finish;
          audio.onerror = () => {
            cleanup();
            reject(new Error('Audio playback error'));
          };

          void audio.play().catch((err) => {
            cleanup();
            reject(err);
          });
        } catch (err) {
          reject(err);
        }
      });
    },
    []
  );

  const speakWithBrowserFallback = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = Math.max(0.1, Math.min(1, configRef.current.mcVolume / 100));
        utterance.rate = configRef.current.energy === 'hype' ? 1.06 : 0.98;
        utterance.pitch = configRef.current.energy === 'hype' ? 1.05 : 0.96;

        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) => /en-za|en-gb|en-ng|en-ke/i.test(v.lang)) ||
          voices.find((v) => /^en/i.test(v.lang));
        if (preferred) {
          utterance.voice = preferred;
        }

        const finish = () => {
          if (activeFinishResolverRef.current === finish) {
            activeFinishResolverRef.current = null;
          }
          resolve();
        };

        activeFinishResolverRef.current = finish;
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve();
      }
    });
  }, []);

  const processNextJob = useCallback(async () => {
    if (isBusyRef.current) return;
    if (queueRef.current.length === 0) {
      setQueuedCount(0);
      return;
    }

    // Pull highest-priority job
    queueRef.current.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
    const job = queueRef.current.shift();
    setQueuedCount(queueRef.current.length);
    if (!job) return;

    const cfg = configRef.current;
    if (!cfg.enabled && !job.bypassEnabled) {
      void processNextJob();
      return;
    }

    // Credit Protection #3: Enforce hourly shoutout budget cap for automated live events
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    spokenTimestampsRef.current = spokenTimestampsRef.current.filter((ts) => ts >= oneHourAgo);
    setShoutoutsThisHour(spokenTimestampsRef.current.length);

    if (
      !job.bypassEnabled &&
      cfg.maxShoutoutsPerHour > 0 &&
      spokenTimestampsRef.current.length >= cfg.maxShoutoutsPerHour
    ) {
      setLiveStats((prev) => ({
        ...prev,
        lastEventNote: `Hourly credit cap reached (${cfg.maxShoutoutsPerHour}/${cfg.maxShoutoutsPerHour}/hr) — raise cap or use Test Studio`,
      }));
      void processNextJob();
      return;
    }

    spokenTimestampsRef.current.push(Date.now());
    setShoutoutsThisHour(spokenTimestampsRef.current.length);

    isBusyRef.current = true;
    setIsGenerating(true);
    setCurrentEventType(job.eventType);
    setCurrentLine('');
    setLastError(null);

    const turnStartMs = Date.now();

    try {
      const track = currentTrackRef.current;
      const liveClient = liveClientRef.current;
      const apiKey = geminiApiKeyRef.current;

      // FAST PATH (~0.7s): Persistent Gemini Live Native Audio WebSocket (real-time PCM streaming!)
      let handledByLive = false;
      if (cfg.useGeminiVoice && apiKey && liveClient) {
        try {
          const liveCfg: GeminiLiveSessionConfig = {
            apiKey,
            djName: djNameRef.current,
            mcName: cfg.mcName,
            aboutLive: cfg.aboutLive,
            accent: cfg.accent,
            voiceName: cfg.voiceName,
            energy: cfg.energy,
          };
          liveClient.setVolume(cfg.mcVolume);

          const livePrompt = buildLiveTurnPrompt(job, djNameRef.current, track);
          const liveResult = await liveClient.speakPrompt(liveCfg, livePrompt, {
            onFirstAudio: (firstMs) => {
              setIsGenerating(false);
              setIsSpeaking(true);
              setMusicDuck(true);
              setLastVoiceMode('gemini-live');
              setLastLatencyMs(firstMs);
            },
            onTranscriptDelta: (partialText) => {
              setCurrentLine(partialText);
            },
          });

          if (liveResult.receivedAudio) {
            handledByLive = true;
            const spokenText = liveResult.transcript || job.triggerDetail || 'Live MC shoutout';
            setCurrentLine(spokenText);
            recentLinesRef.current = [spokenText, ...recentLinesRef.current].slice(0, 8);
            setHistory((prev) =>
              [
                {
                  id: job.id,
                  eventType: job.eventType,
                  viewerName: job.viewerName || job.viewerNames?.join(', '),
                  triggerDetail: job.triggerDetail,
                  spokenText,
                  usedGeminiVoice: true,
                  latencyMs: liveResult.firstAudioMs,
                  transport: 'live' as const,
                  timestamp: Date.now(),
                },
                ...prev,
              ].slice(0, 25)
            );
          }
        } catch (liveErr) {
          console.warn('[AI-MC] Gemini Live stream fallback to REST:', liveErr);
          setMusicDuck(false);
          setIsSpeaking(false);
        }
      }

      // FALLBACK PATH: play-server REST endpoint + browser SpeechSynthesis fallback
      if (!handledByLive) {
        const response = await requestAIMCSpeak({
          eventType: job.eventType,
          djName: djNameRef.current,
          mcName: cfg.mcName,
          aboutLive: cfg.aboutLive,
          accent: cfg.accent,
          voiceName: cfg.voiceName,
          energy: cfg.energy,
          viewerName: job.viewerName,
          viewerNames: job.viewerNames,
          question: job.question,
          giftName: job.giftName,
          giftCount: job.giftCount,
          giftCoins: job.giftCoins,
          currentTrack: track ? { title: track.title, artist: track.artist } : null,
          recentLines: recentLinesRef.current.slice(0, 6),
          customText:
            job.customText ||
            (job.eventType === 'song_queued' ||
            job.eventType === 'song_need_coins' ||
            job.eventType === 'ai_song_cooking' ||
            job.eventType === 'ai_song_ready'
              ? buildLiveTurnPrompt(job, djNameRef.current, track)
              : undefined),
          includeAudio: cfg.useGeminiVoice,
        });

        const restLatencyMs = Date.now() - turnStartMs;
        setLastLatencyMs(restLatencyMs);

        const spokenText = response.text;
        recentLinesRef.current = [spokenText, ...recentLinesRef.current].slice(0, 8);
        setCurrentLine(spokenText);
        setIsGenerating(false);

        const usedGemini = Boolean(response.audioBase64);
        setLastVoiceMode(usedGemini ? 'gemini' : 'browser');
        if (cfg.useGeminiVoice && !usedGemini && response.ttsFallbackReason) {
          setLastError(`Gemini TTS fell back to system voice: ${response.ttsFallbackReason}`);
        }

        setHistory((prev) =>
          [
            {
              id: job.id,
              eventType: job.eventType,
              viewerName: job.viewerName || job.viewerNames?.join(', '),
              triggerDetail: job.triggerDetail,
              spokenText,
              usedGeminiVoice: usedGemini,
              latencyMs: restLatencyMs,
              transport: usedGemini ? ('rest' as const) : ('browser' as const),
              timestamp: Date.now(),
            },
            ...prev,
          ].slice(0, 25)
        );

        setIsSpeaking(true);
        setMusicDuck(true);

        if (response.audioBase64) {
          try {
            await playBase64Audio(response.audioBase64, response.mimeType || 'audio/wav');
          } catch {
            await speakWithBrowserFallback(spokenText);
          }
        } else {
          await speakWithBrowserFallback(spokenText);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'AI MC failed to speak.';
      setLastError(errMsg);
    } finally {
      setMusicDuck(false);
      setIsGenerating(false);
      setIsSpeaking(false);
      setCurrentEventType(null);
      isBusyRef.current = false;

      if (queueRef.current.length > 0) {
        // Brief natural breath between consecutive MC shoutouts
        setTimeout(() => {
          void processNextJob();
        }, 250);
      }
    }
  }, [playBase64Audio, setMusicDuck, speakWithBrowserFallback]);

  const enqueueJob = useCallback(
    (job: Omit<AIMCQueueJob, 'id' | 'createdAt'>) => {
      const fullJob: AIMCQueueJob = {
        ...job,
        id: `mc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
      };

      // Keep queue bounded so MC never falls minutes behind live chat
      if (queueRef.current.length >= 6) {
        queueRef.current.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
        // Drop lowest-priority item if the incoming one is higher priority
        const worst = queueRef.current[queueRef.current.length - 1];
        if (worst && worst.priority >= fullJob.priority) {
          queueRef.current.pop();
        } else {
          return;
        }
      }

      queueRef.current.push(fullJob);
      setQueuedCount(queueRef.current.length);
      void processNextJob();
    },
    [processNextJob]
  );

  const rememberParticipant = useCallback((...names: Array<string | undefined>) => {
    const now = Date.now();
    for (const raw of names) {
      const cleaned = (raw || '').trim();
      if (cleaned.length >= 2) {
        recentParticipantsRef.current.set(cleaned, now);
      }
    }
    if (recentParticipantsRef.current.size > 60) {
      const cutoff = now - 15 * 60 * 1000;
      for (const [k, ts] of recentParticipantsRef.current.entries()) {
        if (ts < cutoff) recentParticipantsRef.current.delete(k);
      }
    }
  }, []);

  // Flush batched viewer joins into a single lively welcome shoutout
  const flushJoinBatch = useCallback(() => {
    joinBatchTimerRef.current = null;
    const cfg = configRef.current;
    if (!cfg.enabled || !cfg.welcomeJoins) {
      pendingJoinNamesRef.current = [];
      return;
    }

    const now = Date.now();
    // When "Always talk to joiners" is ON, greet every joiner promptly (short 2.5s pacing);
    // when OFF (random mode), respect the DJ's Join Cooldown slider.
    const cooldownMs = cfg.alwaysTalkToJoiners ? 2500 : cfg.joinCooldownSec * 1000;
    const waitRemaining = cooldownMs - (now - lastJoinSpokenAtRef.current);
    if (waitRemaining > 0) {
      joinBatchTimerRef.current = setTimeout(() => {
        flushJoinBatch();
      }, waitRemaining);
      return;
    }

    const batchSize = cfg.alwaysTalkToJoiners ? 3 : 2;
    const names = pendingJoinNamesRef.current.splice(0, batchSize);
    if (names.length === 0) return;

    lastJoinSpokenAtRef.current = now;
    enqueueJob({
      priority: 5,
      eventType: 'join',
      viewerName: names[0],
      viewerNames: names,
      triggerDetail: `Joined: ${names.join(', ')}`,
    });

    // In Random mode, cap overflow to newest 2; in Always mode, keep everyone up to a safe 30-person buffer
    const maxPending = cfg.alwaysTalkToJoiners ? 30 : 2;
    if (pendingJoinNamesRef.current.length > maxPending) {
      pendingJoinNamesRef.current = pendingJoinNamesRef.current.slice(-maxPending);
    }
    if (pendingJoinNamesRef.current.length > 0) {
      joinBatchTimerRef.current = setTimeout(() => {
        flushJoinBatch();
      }, cooldownMs);
    }
  }, [enqueueJob]);

  // --- TikTok LIVE Event Handlers ---
  const handleMemberJoin = useCallback(
    (member: TikTokMemberEvent) => {
      const spokenName = cleanDisplayName(member.nickname, member.uniqueId);
      rememberParticipant(spokenName, member.nickname, member.uniqueId);
      const cfg = configRef.current;

      if (!cfg.enabled || !cfg.welcomeJoins) {
        setLiveStats((prev) => ({
          ...prev,
          joinsSeen: prev.joinsSeen + 1,
          lastEventNote: !cfg.enabled
            ? `Join seen (${spokenName}) — turn MC ON to greet`
            : `Join seen (${spokenName}) — Welcome Joins toggle is off`,
        }));
        return;
      }

      const userKey = (member.userId || member.uniqueId || member.nickname || '').toLowerCase();
      if (!userKey) return;

      // Never re-greet the exact same viewer within 15 minutes
      const now = Date.now();
      const lastGreeted = greetedUsersRef.current.get(userKey) || 0;
      if (now - lastGreeted < 15 * 60 * 1000) return;

      // When "Always talk to joiners" is OFF, randomly greet ~35% of joiners
      // (still guarantee a greet if we haven't greeted anyone in the last 45s so slow rooms stay warm)
      if (!cfg.alwaysTalkToJoiners) {
        const silentTooLong = now - lastJoinSpokenAtRef.current >= 45_000;
        const randomPick = Math.random() < 0.35;
        if (!silentTooLong && !randomPick) {
          setLiveStats((prev) => ({
            ...prev,
            joinsSeen: prev.joinsSeen + 1,
            lastEventNote: `Join seen (${spokenName}) — randomly skipped ("Always talk to joiners" is OFF)`,
          }));
          return;
        }
      }

      greetedUsersRef.current.set(userKey, now);

      setLiveStats((prev) => ({
        ...prev,
        joinsSeen: prev.joinsSeen + 1,
        lastEventNote: cfg.alwaysTalkToJoiners
          ? `Welcoming ${spokenName} (Always Greet ON)`
          : `Randomly picked ${spokenName} to welcome`,
      }));

      if (!pendingJoinNamesRef.current.includes(spokenName)) {
        pendingJoinNamesRef.current.push(spokenName);
        const maxBuffer = cfg.alwaysTalkToJoiners ? 30 : 4;
        if (pendingJoinNamesRef.current.length > maxBuffer) {
          pendingJoinNamesRef.current = pendingJoinNamesRef.current.slice(-maxBuffer);
        }
      }

      // Collect joins briefly so simultaneous arrivals are welcomed together smoothly
      if (!joinBatchTimerRef.current) {
        joinBatchTimerRef.current = setTimeout(() => {
          flushJoinBatch();
        }, cfg.alwaysTalkToJoiners ? 1600 : 2200);
      }
    },
    [flushJoinBatch, rememberParticipant]
  );

  const evaluateAndEnqueueComment = useCallback(
    async (params: {
      viewerName: string;
      commentText: string;
      isSongRequest: boolean;
      bypassEnabled?: boolean;
      skipCooldown?: boolean;
    }) => {
      const { viewerName, commentText, isSongRequest, bypassEnabled = false, skipCooldown = false } = params;
      const cfg = configRef.current;

      const priorMessages = recentChatMessagesRef.current.slice(-6).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));
      const recentViewerNames = Array.from(recentParticipantsRef.current.keys());
      const hostAliases = [djNameRef.current, cfg.mcName, hostHandleRef.current].filter(Boolean);

      // Record this chat message into context history regardless of whether MC replies
      recentChatMessagesRef.current = [
        ...recentChatMessagesRef.current,
        { sender: viewerName, text: commentText, timestamp: Date.now() },
      ].slice(-12);

      if (!bypassEnabled && !cfg.enabled) {
        setLiveStats((prev) => ({
          ...prev,
          lastEventNote: `Comment from ${viewerName} ("${commentText.slice(0, 32)}") — turn MC ON to reply`,
        }));
        return;
      }
      if (!bypassEnabled && !cfg.answerQuestions) {
        setLiveStats((prev) => ({
          ...prev,
          lastEventNote: `Comment from ${viewerName} skipped — Reply to Comments is OFF`,
        }));
        return;
      }

      // Stage 1A (0ms): Must be speakable (and a question when in Smart Host Questions mode)
      const passesShapeCheck =
        cfg.commentReplyMode === 'host_questions'
          ? isViewerQuestionComment(commentText, isSongRequest)
          : isSpeakableChatComment(commentText, isSongRequest);

      if (!passesShapeCheck) {
        setLiveStats((prev) => ({
          ...prev,
          lastEventNote: isSongRequest
            ? `Song request from ${viewerName} handled by DJ Queue`
            : `Skipped ${viewerName}: "${commentText.slice(0, 28)}" (${
                cfg.commentReplyMode === 'host_questions' ? 'not a question for host' : 'emoji/short'
              })`,
        }));
        return;
      }

      // Stage 1B (0ms): Immediately skip comments explicitly addressing another viewer (@handle or recent viewer name)
      const otherViewerCheck = isAddressedToOtherViewer(
        commentText,
        hostAliases,
        recentViewerNames,
        viewerName
      );
      if (otherViewerCheck.isOtherViewer) {
        setLiveStats((prev) => ({
          ...prev,
          lastEventNote: `Skipped ${viewerName} (talking to ${otherViewerCheck.targetName || 'another viewer'})`,
        }));
        return;
      }

      const now = Date.now();
      if (!skipCooldown) {
        const cooldownMs = cfg.questionCooldownSec * 1000;
        if (now - lastQuestionSpokenAtRef.current < cooldownMs) {
          const secsLeft = Math.ceil((cooldownMs - (now - lastQuestionSpokenAtRef.current)) / 1000);
          setLiveStats((prev) => ({
            ...prev,
            lastEventNote: `Comment from ${viewerName} skipped (cooldown: ${secsLeft}s left)`,
          }));
          return;
        }
      }

      const normComment = commentText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      if (!normComment) return;
      if (!skipCooldown) {
        const lastAsked = answeredQuestionsRef.current.get(normComment) || 0;
        if (now - lastAsked < 30 * 1000) return;
      }

      // Stage 2 (~250ms, Gemini Flash-Lite): Verify the question is genuinely directed to the HOST/DJ/MC
      // and NOT viewers chatting among themselves!
      if (cfg.commentReplyMode === 'host_questions') {
        try {
          const track = currentTrackRef.current;
          const verdict = await classifyAIMCCommentTarget({
            comment: commentText,
            viewerName,
            djName: djNameRef.current,
            hostHandle: hostHandleRef.current,
            mcName: cfg.mcName,
            aboutLive: cfg.aboutLive,
            currentTrack: track ? { title: track.title, artist: track.artist } : null,
            recentMessages: priorMessages,
          });
          if (!verdict.shouldReply) {
            setLiveStats((prev) => ({
              ...prev,
              lastEventNote: `Skipped ${viewerName}: "${commentText.slice(0, 30)}" (${
                verdict.reason || 'viewer-to-viewer / not for host'
              })`,
            }));
            return;
          }
        } catch (err) {
          console.warn('[AI-MC] Smart host-question classifier failed, skipping ambiguous comment:', err);
          setLiveStats((prev) => ({
            ...prev,
            lastEventNote: `Skipped ${viewerName} (host filter unavailable)`,
          }));
          return;
        }
      }

      const commitTime = Date.now();
      if (!skipCooldown) {
        answeredQuestionsRef.current.set(normComment, commitTime);
        lastQuestionSpokenAtRef.current = commitTime;
      }

      setLiveStats((prev) => ({
        ...prev,
        lastEventNote: `Replying to ${viewerName}: "${commentText.slice(0, 40)}"`,
      }));

      enqueueJob({
        priority: bypassEnabled ? 1 : 3,
        eventType: 'question',
        viewerName,
        question: commentText,
        triggerDetail: `${viewerName}: "${commentText}"`,
        bypassEnabled,
      });
    },
    [enqueueJob]
  );

  const handleViewerChat = useCallback(
    (chat: TikTokChatEvent, isSongRequest: boolean) => {
      const viewerName = cleanDisplayName(chat.nickname, chat.uniqueId);
      const commentText = (chat.comment || '').trim();
      rememberParticipant(viewerName, chat.nickname, chat.uniqueId);

      setLiveStats((prev) => ({
        ...prev,
        commentsSeen: prev.commentsSeen + 1,
      }));

      void evaluateAndEnqueueComment({
        viewerName,
        commentText,
        isSongRequest,
        bypassEnabled: false,
        skipCooldown: false,
      });
    },
    [evaluateAndEnqueueComment, rememberParticipant]
  );

  const handleFinalGift = useCallback(
    (gift: TikTokGiftEvent) => {
      const viewerName = cleanDisplayName(gift.nickname, gift.uniqueId);
      const cfg = configRef.current;
      setLiveStats((prev) => ({
        ...prev,
        giftsSeen: prev.giftsSeen + 1,
        lastEventNote: !cfg.enabled
          ? `Gift from ${viewerName} (${gift.giftName}) — turn MC ON to hype`
          : `Hyping gift from ${viewerName}: ${gift.giftName}`,
      }));

      if (!cfg.enabled || !cfg.hypeGifts) return;
      if (gift.totalDiamonds < cfg.minGiftCoinsToHype) return;

      enqueueJob({
        priority: 2,
        eventType: 'gift',
        viewerName,
        giftName: gift.giftName,
        giftCount: gift.repeatCount,
        giftCoins: gift.totalDiamonds,
        triggerDetail: `${viewerName} sent ${gift.repeatCount}x ${gift.giftName} (${gift.totalDiamonds} coins)`,
      });
    },
    [enqueueJob]
  );

  const handleSocialEvent = useCallback(
    (social: TikTokSocialEvent) => {
      const cfg = configRef.current;
      if (!cfg.enabled || !cfg.hypeFollows) return;

      const viewerName = cleanDisplayName(social.nickname, social.uniqueId);
      enqueueJob({
        priority: 4,
        eventType: social.type === 'share' ? 'share' : 'follow',
        viewerName,
        triggerDetail:
          social.type === 'share'
            ? `${viewerName} shared the LIVE`
            : `${viewerName} followed`,
      });
    },
    [enqueueJob]
  );

  // Song Request & VIP AI Song Creation live MC announcements
  const handleSongRequestFeedback = useCallback(
    (event: TikTokSongRequestFeedbackEvent) => {
      const cfg = configRef.current;
      const viewerName = cleanDisplayName(event.viewerName);
      if (!cfg.enabled || !cfg.announceRequests) return;

      if (event.kind === 'insufficient_coins') {
        const key = viewerName.toLowerCase();
        const now = Date.now();
        if (now - (lastNeedCoinsAtRef.current.get(key) || 0) < 20_000) return;
        lastNeedCoinsAtRef.current.set(key, now);

        enqueueJob({
          priority: 3,
          eventType: 'song_need_coins',
          viewerName,
          songTitle: event.songTitle || event.query,
          question: event.query,
          requiredCoins: event.requiredCoins || 1,
          triggerDetail: `${viewerName} needs ${event.requiredCoins || 1} coins for "${event.query}"`,
        });
        return;
      }

      if (event.kind === 'ai_song_cooking') {
        enqueueJob({
          priority: 2,
          eventType: 'ai_song_cooking',
          viewerName,
          songTitle: event.songTitle || event.query,
          question: event.query,
          triggerDetail: `Cooking VIP AI Song for ${viewerName}: "${event.songTitle || event.query}"`,
        });
        return;
      }

      if (event.kind === 'ai_song_ready') {
        enqueueJob({
          priority: 1,
          eventType: 'ai_song_ready',
          viewerName,
          songTitle: event.songTitle || event.query,
          question: event.query,
          triggerDetail: `VIP AI Song Ready: "${event.songTitle || event.query}"`,
        });
        return;
      }

      // queued or playing
      enqueueJob({
        priority: 2,
        eventType: 'song_queued',
        viewerName,
        songTitle: event.songTitle || event.query,
        question: event.query,
        triggerDetail: `${viewerName} requested "${event.songTitle || event.query}"`,
      });
    },
    [enqueueJob]
  );

  // Optional automatic "Now Playing" track announcement when active track changes
  useEffect(() => {
    const trackId = currentTrack?.id || '';
    if (!trackId || trackId === lastAnnouncedTrackIdRef.current) return;
    lastAnnouncedTrackIdRef.current = trackId;

    const cfg = configRef.current;
    if (!cfg.enabled || !cfg.announceTracks) return;

    enqueueJob({
      priority: 6,
      eventType: 'now_playing',
      triggerDetail: `Now Playing: ${currentTrack?.artist} - ${currentTrack?.title}`,
    });
  }, [currentTrack?.id, currentTrack?.artist, currentTrack?.title, enqueueJob]);

  // --- Manual Studio & Test Triggers (work anytime, even offline!) ---
  const speakCustom = useCallback(
    (customText: string) => {
      const trimmed = customText.trim();
      if (!trimmed) return;
      enqueueJob({
        priority: 1,
        eventType: 'custom',
        customText: trimmed,
        triggerDetail: `DJ Mic: "${trimmed}"`,
        bypassEnabled: true,
      });
    },
    [enqueueJob]
  );

  const testJoin = useCallback(
    (viewerName = 'Jossy') => {
      const clean = cleanDisplayName(viewerName);
      rememberParticipant(clean, viewerName);
      enqueueJob({
        priority: 1,
        eventType: 'join',
        viewerName: clean,
        viewerNames: [clean],
        triggerDetail: `Test Welcome: ${clean}`,
        bypassEnabled: true,
      });
    },
    [enqueueJob, rememberParticipant]
  );

  const testQuestion = useCallback(
    (viewerName = 'Tino', question = 'What song is playing right now and how do I request a track?') => {
      const clean = cleanDisplayName(viewerName);
      const trimmed = question.trim();
      if (!trimmed) return;
      rememberParticipant(clean, viewerName);

      setLiveStats((prev) => ({
        ...prev,
        commentsSeen: prev.commentsSeen + 1,
      }));

      const isSongReq = /^\/play\s+/i.test(trimmed);
      void evaluateAndEnqueueComment({
        viewerName: clean,
        commentText: trimmed,
        isSongRequest: isSongReq,
        bypassEnabled: true,
        skipCooldown: true,
      });
    },
    [evaluateAndEnqueueComment, rememberParticipant]
  );

  const testGift = useCallback(
    (viewerName = 'Jossy', giftName = 'Rose', giftCount = 1, giftCoins = 1) => {
      const clean = cleanDisplayName(viewerName);
      setLiveStats((prev) => ({
        ...prev,
        giftsSeen: prev.giftsSeen + 1,
        lastEventNote: `Simulated gift from ${clean}: ${giftCount}x ${giftName}`,
      }));
      enqueueJob({
        priority: 1,
        eventType: 'gift',
        viewerName: clean,
        giftName,
        giftCount,
        giftCoins,
        triggerDetail: `Test Gift: ${clean} sent ${giftCount}x ${giftName}`,
        bypassEnabled: true,
      });
    },
    [enqueueJob]
  );

  const testHype = useCallback(() => {
    enqueueJob({
      priority: 1,
      eventType: 'hype',
      triggerDetail: 'Crowd Hype Shoutout',
      bypassEnabled: true,
    });
  }, [enqueueJob]);

  const skipCurrent = useCallback(() => {
    stopActivePlayback();
  }, [stopActivePlayback]);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    pendingJoinNamesRef.current = [];
    if (joinBatchTimerRef.current) {
      clearTimeout(joinBatchTimerRef.current);
      joinBatchTimerRef.current = null;
    }
    setQueuedCount(0);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    recentLinesRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (joinBatchTimerRef.current) {
        clearTimeout(joinBatchTimerRef.current);
      }
      stopActivePlayback();
      liveClientRef.current?.dispose();
    };
  }, [stopActivePlayback]);

  return {
    config,
    updateConfig,
    isSpeaking,
    isGenerating,
    currentLine,
    currentEventType,
    queuedCount,
    history,
    lastError,
    lastVoiceMode,
    isLiveStreamConnected,
    liveModelName,
    lastLatencyMs,
    shoutoutsThisHour,
    liveStats,
    handleMemberJoin,
    handleViewerChat,
    handleFinalGift,
    handleSocialEvent,
    handleSongRequestFeedback,
    speakCustom,
    testJoin,
    testQuestion,
    testGift,
    testHype,
    skipCurrent,
    clearQueue,
    clearHistory,
  };
};
