import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Song } from '@/Types';
import type {
  TikTokChatEvent,
  TikTokGiftEvent,
  TikTokMemberEvent,
  TikTokRequestLog,
  TikTokRequestStatus,
  TikTokSocialEvent,
  TikTokSongRequest,
  TikTokSongRequestFeedbackEvent,
  TikTokStatusEvent,
  TikTokViewerCredit,
} from '@/types/tiktok';
import {
  extractExplicitAISongPrompt,
  extractSongRequestQuery,
  findBestMatchingSong,
  getTikTokViewerKey,
  looksLikeNaturalSongRequest,
} from '@/lib/tiktokSongRequests';
import {
  connectTikTokLiveStream,
  fetchAndSaveExternalSong,
  generateAndSaveLiveAISong,
  parseAISongRequestIntent,
} from '@/lib/playServerApi';

const STORAGE_KEY = 'playmyjam_tiktok_live_v1';

export type TikTokGiftSfxType = 'laser' | 'horn' | 'siren' | 'zap' | 'whoosh' | 'scratch';

interface SavedTikTokConfig {
  username: string;
  signApiKey: string;
  minRequestCoins: number;
  requestsEnabled: boolean;
  naturalRequestsEnabled: boolean;
  aiSongRequestsEnabled: boolean;
  aiSongMinCoins: number;
  autoPlayRequests: boolean;
  requireApproval: boolean;
  externalSearchEnabled: boolean;
  giftSfxEnabled: boolean;
  smallGiftSfx: TikTokGiftSfxType;
  bigGiftSfx: TikTokGiftSfxType;
  bigGiftThreshold: number;
}

export interface TikTokDeckPlaybackState {
  deckATrackId?: string;
  deckAPlaying: boolean;
  deckAPosition: number;
  deckADuration: number;
  deckBTrackId?: string;
  deckBPlaying: boolean;
  deckBPosition: number;
  deckBDuration: number;
}

interface UseTikTokLiveParams {
  songs?: Song[];
  ownerId?: string;
  userFolder?: string;
  djName?: string;
  deckState?: TikTokDeckPlaybackState;
  onAutoPlayRequest?: (song: Song) => 'A' | 'B' | void;
  onStopSong?: (songId: string) => void;
  onPlaySoundEffect?: (effect: TikTokGiftSfxType) => void;
  onMemberJoin?: (member: TikTokMemberEvent) => void;
  onViewerChat?: (chat: TikTokChatEvent, isSongRequest: boolean) => void;
  onFinalGift?: (gift: TikTokGiftEvent) => void;
  onSocialEvent?: (social: TikTokSocialEvent) => void;
  onSongRequestFeedback?: (event: TikTokSongRequestFeedbackEvent) => void;
}

export interface TikTokRequestNotice {
  id: string;
  tone: 'success' | 'info' | 'warning';
  message: string;
  timestamp: number;
}

const VALID_SFX: TikTokGiftSfxType[] = ['laser', 'horn', 'siren', 'zap', 'whoosh', 'scratch'];

function toValidSfx(val: unknown, fallback: TikTokGiftSfxType): TikTokGiftSfxType {
  return typeof val === 'string' && (VALID_SFX as string[]).includes(val)
    ? (val as TikTokGiftSfxType)
    : fallback;
}

function loadSavedConfig(): SavedTikTokConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const minCoins = Number(parsed.minRequestCoins);
      const aiMinCoins = Number(parsed.aiSongMinCoins);
      const bigThreshold = Number(parsed.bigGiftThreshold);
      return {
        username: parsed.username || '',
        signApiKey: parsed.signApiKey || '',
        minRequestCoins: Number.isFinite(minCoins) && minCoins >= 0 ? Math.floor(minCoins) : 1,
        requestsEnabled: parsed.requestsEnabled !== false,
        naturalRequestsEnabled: parsed.naturalRequestsEnabled !== false,
        aiSongRequestsEnabled: parsed.aiSongRequestsEnabled !== false,
        aiSongMinCoins: Number.isFinite(aiMinCoins) && aiMinCoins >= 0 ? Math.floor(aiMinCoins) : 50,
        autoPlayRequests: parsed.autoPlayRequests !== false,
        requireApproval: parsed.requireApproval === true,
        externalSearchEnabled: parsed.externalSearchEnabled !== false,
        giftSfxEnabled: parsed.giftSfxEnabled !== false,
        smallGiftSfx: toValidSfx(parsed.smallGiftSfx, 'laser'),
        bigGiftSfx: toValidSfx(parsed.bigGiftSfx, 'horn'),
        bigGiftThreshold: Number.isFinite(bigThreshold) && bigThreshold >= 1 ? Math.floor(bigThreshold) : 50,
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    username: '',
    signApiKey: '',
    minRequestCoins: 1,
    requestsEnabled: true,
    naturalRequestsEnabled: true,
    aiSongRequestsEnabled: true,
    aiSongMinCoins: 50,
    autoPlayRequests: true,
    requireApproval: false,
    externalSearchEnabled: true,
    giftSfxEnabled: true,
    smallGiftSfx: 'laser',
    bigGiftSfx: 'horn',
    bigGiftThreshold: 50,
  };
}

const STATUS_GROUP_ORDER: Record<TikTokRequestStatus, number> = {
  playing: 0,
  pending: 1,
  loaded: 2,
  queued: 2,
  played: 3,
};

function sortSongRequests(list: TikTokSongRequest[]): TikTokSongRequest[] {
  return [...list].sort((a, b) => {
    const groupDiff = STATUS_GROUP_ORDER[a.status] - STATUS_GROUP_ORDER[b.status];
    if (groupDiff !== 0) return groupDiff;
    // Active (queued/loaded): highest coins first, then earliest requested
    if (a.status !== 'played') {
      if (b.coins !== a.coins) return b.coins - a.coins;
      return a.requestedAt - b.requestedAt;
    }
    // Played history: most recent first
    return b.requestedAt - a.requestedAt;
  });
}

function isActiveRequest(req: TikTokSongRequest): boolean {
  return req.status === 'queued' || req.status === 'loaded';
}

export const useTikTokLive = ({
  songs = [],
  ownerId = '',
  userFolder = 'dj_guest',
  djName = 'DJ',
  deckState,
  onAutoPlayRequest,
  onStopSong,
  onPlaySoundEffect,
  onMemberJoin,
  onViewerChat,
  onFinalGift,
  onSocialEvent,
  onSongRequestFeedback,
}: UseTikTokLiveParams = {}) => {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.tiktok);

  const [config, setConfig] = useState<SavedTikTokConfig>(() => loadSavedConfig());
  const [isMockMode, setIsMockMode] = useState(false);
  const [status, setStatus] = useState<TikTokStatusEvent>({
    state: 'disconnected',
    uniqueId: '',
  });
  const [gifts, setGifts] = useState<TikTokGiftEvent[]>([]);
  const [chatMessages, setChatMessages] = useState<TikTokChatEvent[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [totalLikes, setTotalLikes] = useState(0);
  const [totalDiamonds, setTotalDiamonds] = useState(0);
  const [giftCount, setGiftCount] = useState(0);

  // Gift-backed Song Request state (purely in-memory — never mutates Firebase bids)
  const [viewerCredits, setViewerCredits] = useState<TikTokViewerCredit[]>([]);
  const [songRequests, setSongRequests] = useState<TikTokSongRequest[]>([]);
  const [requestLogs, setRequestLogs] = useState<TikTokRequestLog[]>([]);
  const [lastRequestNotice, setLastRequestNotice] = useState<TikTokRequestNotice | null>(null);
  const [searchingQueries, setSearchingQueries] = useState<string[]>([]);

  const countedGiftGroupsRef = useRef<Set<string>>(new Set());
  const viewerCreditsRef = useRef<Map<string, TikTokViewerCredit>>(new Map());
  const songRequestsRef = useRef<TikTokSongRequest[]>([]);
  const songsRef = useRef<Song[]>(songs);
  const ownerIdRef = useRef<string>(ownerId);
  const userFolderRef = useRef<string>(userFolder);
  const djNameRef = useRef<string>(djName);
  const configRef = useRef<SavedTikTokConfig>(config);
  const isMockModeRef = useRef<boolean>(isMockMode);
  const onAutoPlayRequestRef = useRef(onAutoPlayRequest);
  const onStopSongRef = useRef(onStopSong);
  const onPlaySoundEffectRef = useRef(onPlaySoundEffect);
  const onMemberJoinRef = useRef(onMemberJoin);
  const onViewerChatRef = useRef(onViewerChat);
  const onFinalGiftRef = useRef(onFinalGift);
  const onSocialEventRef = useRef(onSocialEvent);
  const onSongRequestFeedbackRef = useRef(onSongRequestFeedback);
  const lastGiftSfxAtRef = useRef<number>(0);
  const pendingAutoPlayUntilRef = useRef<number>(0);
  const inFlightExternalQueriesRef = useRef<Set<string>>(new Set());
  const webAbortControllerRef = useRef<AbortController | null>(null);
  const webReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webSessionIdRef = useRef<number>(0);

  const deckStateRef = useRef<TikTokDeckPlaybackState>({
    deckATrackId: undefined,
    deckAPlaying: false,
    deckAPosition: 0,
    deckADuration: 0,
    deckBTrackId: undefined,
    deckBPlaying: false,
    deckBPosition: 0,
    deckBDuration: 0,
  });

  useEffect(() => {
    songRequestsRef.current = songRequests;
  }, [songRequests]);

  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  useEffect(() => {
    ownerIdRef.current = ownerId;
  }, [ownerId]);

  useEffect(() => {
    userFolderRef.current = userFolder;
  }, [userFolder]);

  useEffect(() => {
    djNameRef.current = djName || 'DJ';
  }, [djName]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    isMockModeRef.current = isMockMode;
  }, [isMockMode]);

  useEffect(() => {
    onAutoPlayRequestRef.current = onAutoPlayRequest;
  }, [onAutoPlayRequest]);

  useEffect(() => {
    onStopSongRef.current = onStopSong;
  }, [onStopSong]);

  useEffect(() => {
    onPlaySoundEffectRef.current = onPlaySoundEffect;
  }, [onPlaySoundEffect]);

  useEffect(() => {
    onMemberJoinRef.current = onMemberJoin;
  }, [onMemberJoin]);

  useEffect(() => {
    onViewerChatRef.current = onViewerChat;
  }, [onViewerChat]);

  useEffect(() => {
    onFinalGiftRef.current = onFinalGift;
  }, [onFinalGift]);

  useEffect(() => {
    onSocialEventRef.current = onSocialEvent;
  }, [onSocialEvent]);

  useEffect(() => {
    onSongRequestFeedbackRef.current = onSongRequestFeedback;
  }, [onSongRequestFeedback]);

  useEffect(() => {
    if (deckState) {
      deckStateRef.current = deckState;
    }
  }, [deckState]);

  const showNotice = useCallback((tone: TikTokRequestNotice['tone'], message: string) => {
    setLastRequestNotice({
      id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      tone,
      message,
      timestamp: Date.now(),
    });
  }, []);

  const syncCreditsState = useCallback(() => {
    const list = Array.from(viewerCreditsRef.current.values())
      .filter((c) => c.availableCoins > 0)
      .sort((a, b) => b.availableCoins - a.availableCoins || b.lastGiftedAt - a.lastGiftedAt);
    setViewerCredits(list);
  }, []);

  const updateConfig = useCallback((patch: Partial<SavedTikTokConfig>) => {
    setConfig((prev) => {
      const next: SavedTikTokConfig = {
        ...prev,
        ...patch,
      };
      if (patch.minRequestCoins !== undefined) {
        const parsed = Math.floor(Number(patch.minRequestCoins));
        next.minRequestCoins = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      }
      if (patch.aiSongMinCoins !== undefined) {
        const parsed = Math.floor(Number(patch.aiSongMinCoins));
        next.aiSongMinCoins = Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
      }
      if (patch.bigGiftThreshold !== undefined) {
        const parsed = Math.floor(Number(patch.bigGiftThreshold));
        next.bigGiftThreshold = Number.isFinite(parsed) && parsed >= 1 ? parsed : 50;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const appendRequestLog = useCallback((entry: Omit<TikTokRequestLog, 'id' | 'timestamp'>) => {
    setRequestLogs((prev) =>
      [
        {
          ...entry,
          id: `reqlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
        },
        ...prev,
      ].slice(0, 40)
    );
  }, []);

  // Keep request lifecycle statuses synced live with Deck A & Deck B playback (never deleting requests abruptly)
  const deckATrackId = deckState?.deckATrackId;
  const deckAPlaying = Boolean(deckState?.deckAPlaying);
  const deckAPosition = deckState?.deckAPosition ?? 0;
  const deckADuration = deckState?.deckADuration ?? 0;
  const deckBTrackId = deckState?.deckBTrackId;
  const deckBPlaying = Boolean(deckState?.deckBPlaying);
  const deckBPosition = deckState?.deckBPosition ?? 0;
  const deckBDuration = deckState?.deckBDuration ?? 0;
  const hasDeckState = Boolean(deckState);

  useEffect(() => {
    if (!hasDeckState) return;

    const deckAEnded = !deckAPlaying && deckADuration > 0 && deckAPosition >= deckADuration - 1.5;
    const deckBEnded = !deckBPlaying && deckBDuration > 0 && deckBPosition >= deckBDuration - 1.5;

    setSongRequests((prev) => {
      let changed = false;
      const updated = prev.map((req) => {
        if (req.status === 'played' || req.status === 'pending') return req;

        const onA = Boolean(deckATrackId && req.song.id === deckATrackId);
        const onB = Boolean(deckBTrackId && req.song.id === deckBTrackId);

        let nextStatus: TikTokRequestStatus = req.status;
        let nextDeck: 'A' | 'B' | undefined = req.assignedDeck;

        if ((onA && deckAPlaying) || (onB && deckBPlaying)) {
          nextStatus = 'playing';
          nextDeck = onA && deckAPlaying ? 'A' : 'B';
        } else if (onA || onB) {
          const ended = (onA && deckAEnded) || (onB && deckBEnded);
          const otherDeckPlaying = (onA && deckBPlaying) || (onB && deckAPlaying);
          if (req.status === 'playing') {
            // Once a requested song has started playing, NEVER regress it back to 'loaded' or 'queued'
            // (otherwise pausing during Auto DJ crossfade puts it back on top and loops requested songs!).
            if (ended || otherDeckPlaying) {
              nextStatus = 'played';
              nextDeck = undefined;
            } else {
              nextStatus = 'playing';
              nextDeck = onA ? 'A' : 'B';
            }
          } else {
            nextStatus = 'loaded';
            nextDeck = onA ? 'A' : 'B';
          }
        } else {
          // Track is no longer on either deck
          if (req.status === 'playing') {
            nextStatus = 'played';
            nextDeck = undefined;
          } else if (req.status === 'loaded') {
            // Bumped from standby deck by a higher-coin track — put it back into queued!
            nextStatus = 'queued';
            nextDeck = undefined;
          }
        }

        if (nextStatus !== req.status || nextDeck !== req.assignedDeck) {
          changed = true;
          return { ...req, status: nextStatus, assignedDeck: nextDeck };
        }
        return req;
      });

      if (!changed) return prev;
      const sorted = sortSongRequests(updated);
      songRequestsRef.current = sorted;
      return sorted;
    });
  }, [
    hasDeckState,
    deckATrackId,
    deckAPlaying,
    deckAPosition,
    deckADuration,
    deckBTrackId,
    deckBPlaying,
    deckBPosition,
    deckBDuration,
  ]);

  const commitMatchedSong = useCallback(
    (
      chat: TikTokChatEvent,
      userKey: string,
      query: string,
      matchedSong: Song,
      source: 'library' | 'external' | 'ai',
      overrideMinCoins?: number
    ) => {
      const currentCfg = configRef.current;
      const minCoins =
        overrideMinCoins !== undefined
          ? Math.max(0, overrideMinCoins)
          : Math.max(
              0,
              Number.isFinite(currentCfg.minRequestCoins) ? currentCfg.minRequestCoins : 0
            );
      const credit = viewerCreditsRef.current.get(userKey);
      const availableCoins = credit?.availableCoins ?? 0;

      if (availableCoins < minCoins) {
        appendRequestLog({
          type: 'insufficient_coins',
          nickname: chat.nickname,
          uniqueId: chat.uniqueId,
          query,
          coins: availableCoins,
          minCoins,
        });
        showNotice(
          'warning',
          `@${chat.uniqueId} asked for "${query}" — needs ${minCoins} coins (has ${availableCoins})`
        );
        onSongRequestFeedbackRef.current?.({
          kind: 'insufficient_coins',
          viewerName: chat.nickname || chat.uniqueId,
          query,
          songTitle: `${matchedSong.artist} - ${matchedSong.title}`,
          availableCoins,
          requiredCoins: minCoins,
          isCustomAISong: source === 'ai',
        });
        return;
      }

      const ds = deckStateRef.current;
      const currentlyPlayingIds = new Set<string>(
        [
          ds.deckAPlaying ? ds.deckATrackId : undefined,
          ds.deckBPlaying ? ds.deckBTrackId : undefined,
        ].filter(Boolean) as string[]
      );

      // If this exact track is already actively playing right now, inform without duplicating or consuming coins
      if (currentlyPlayingIds.has(matchedSong.id)) {
        appendRequestLog({
          type: 'already_playing',
          nickname: chat.nickname,
          uniqueId: chat.uniqueId,
          query,
          songTitle: `${matchedSong.artist} - ${matchedSong.title}`,
          coins: availableCoins,
          minCoins,
        });
        showNotice('info', `Already playing: ${matchedSong.artist} - ${matchedSong.title}`);
        return;
      }

      const spentCoins = availableCoins;
      const prevRequests = songRequestsRef.current;
      const existingActiveIdx = prevRequests.findIndex(
        (r) => r.song.id === matchedSong.id && (isActiveRequest(r) || r.status === 'pending')
      );

      // Avoid duplicate free (0-coin) spam from the same viewer for the same already-queued/pending track
      if (
        existingActiveIdx >= 0 &&
        spentCoins === 0 &&
        prevRequests[existingActiveIdx].requesters.some((r) => r.userKey === userKey)
      ) {
        showNotice('info', `Already queued: ${matchedSong.artist} - ${matchedSong.title}`);
        return;
      }

      // Deduct available coins for this request
      if (credit && spentCoins > 0) {
        viewerCreditsRef.current.set(userKey, {
          ...credit,
          availableCoins: 0,
        });
        syncCreditsState();
      }

      const needsApproval = currentCfg.requireApproval && existingActiveIdx < 0;

      // Auto-play immediately if enabled, not waiting for manual approval, and both decks are currently idle
      const bothDecksIdle =
        !ds.deckAPlaying &&
        !ds.deckBPlaying &&
        Date.now() > pendingAutoPlayUntilRef.current;

      let triggeredAutoPlayDeck: 'A' | 'B' | undefined;
      if (
        !needsApproval &&
        existingActiveIdx < 0 &&
        currentCfg.autoPlayRequests &&
        bothDecksIdle &&
        onAutoPlayRequestRef.current
      ) {
        pendingAutoPlayUntilRef.current = Date.now() + 2500;
        const deck = onAutoPlayRequestRef.current(matchedSong);
        triggeredAutoPlayDeck = deck === 'B' ? 'B' : 'A';
      }

      const wasBoosted = existingActiveIdx >= 0;
      let nextRequests: TikTokSongRequest[];

      if (existingActiveIdx >= 0) {
        const existing = prevRequests[existingActiveIdx];
        const updated: TikTokSongRequest = {
          ...existing,
          coins: existing.coins + spentCoins,
          requesters: [
            ...existing.requesters,
            {
              userKey,
              uniqueId: chat.uniqueId,
              nickname: chat.nickname,
              coins: spentCoins,
            },
          ],
        };
        const copy = [...prevRequests];
        copy[existingActiveIdx] = updated;
        nextRequests = sortSongRequests(copy);
      } else {
        const nextReq: TikTokSongRequest = {
          id: `ttreq-${matchedSong.id}-${Date.now()}`,
          song: matchedSong,
          coins: spentCoins,
          status: needsApproval ? 'pending' : triggeredAutoPlayDeck ? 'playing' : 'queued',
          assignedDeck: triggeredAutoPlayDeck,
          source,
          requestedBy: {
            userKey,
            userId: chat.userId,
            uniqueId: chat.uniqueId,
            nickname: chat.nickname,
          },
          requesters: [
            {
              userKey,
              uniqueId: chat.uniqueId,
              nickname: chat.nickname,
              coins: spentCoins,
            },
          ],
          query,
          requestedAt: Date.now(),
        };
        nextRequests = sortSongRequests([...prevRequests, nextReq]);
      }

      songRequestsRef.current = nextRequests;
      setSongRequests(nextRequests);

      const songLabel = `${matchedSong.artist} - ${matchedSong.title}`;
      const sourceNote =
        source === 'ai'
          ? ' (Custom AI Song)'
          : source === 'external'
            ? ' (saved to Firebase)'
            : '';
      appendRequestLog({
        type: needsApproval
          ? 'pending'
          : triggeredAutoPlayDeck
          ? 'playing'
          : wasBoosted
          ? 'boosted'
          : 'queued',
        nickname: chat.nickname,
        uniqueId: chat.uniqueId,
        query,
        songTitle: songLabel,
        audioUrl: matchedSong.audioUrl || matchedSong.url,
        coins: spentCoins,
        minCoins,
      });

      if (needsApproval) {
        showNotice('info', `Waiting for DJ approval: ${songLabel}${sourceNote}`);
      } else if (triggeredAutoPlayDeck) {
        showNotice('success', `Playing on Deck ${triggeredAutoPlayDeck}: ${songLabel}${sourceNote}`);
      } else if (wasBoosted) {
        showNotice(
          'success',
          `Boosted ${songLabel} (${spentCoins > 0 ? `+${spentCoins} coins` : 'Free'})`
        );
      } else {
        showNotice(
          'success',
          `Queued: ${songLabel} (${spentCoins > 0 ? `${spentCoins} coins` : 'Free'})${sourceNote}`
        );
      }

      onSongRequestFeedbackRef.current?.({
        kind: source === 'ai' ? 'ai_song_ready' : triggeredAutoPlayDeck ? 'playing' : 'queued',
        viewerName: chat.nickname || chat.uniqueId,
        query,
        songTitle: source === 'ai' ? matchedSong.title : songLabel,
        availableCoins: spentCoins,
        requiredCoins: minCoins,
        isCustomAISong: source === 'ai',
      });
    },
    [appendRequestLog, showNotice, syncCreditsState]
  );

  const handleIncomingGift = useCallback(
    (gift: TikTokGiftEvent) => {
      setGifts((prev) => {
        if (gift.groupId) {
          const idx = prev.findIndex((g) => g.groupId === gift.groupId && g.userId === gift.userId);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = gift;
            return copy;
          }
        }
        return [gift, ...prev].slice(0, 100);
      });

      if (gift.isFinal) {
        const dedupeKey = gift.groupId ? `${gift.userId}:${gift.groupId}` : gift.id;
        if (!countedGiftGroupsRef.current.has(dedupeKey)) {
          countedGiftGroupsRef.current.add(dedupeKey);
          setTotalDiamonds((prev) => prev + gift.totalDiamonds);
          setGiftCount((prev) => prev + gift.repeatCount);

          // Credit this viewer's coin balance by TikTok userId (so they can request a song in chat)
          const userKey = getTikTokViewerKey(gift.userId, gift.uniqueId);
          if (userKey && gift.totalDiamonds > 0) {
            const existing = viewerCreditsRef.current.get(userKey);
            viewerCreditsRef.current.set(userKey, {
              userKey,
              userId: gift.userId,
              uniqueId: gift.uniqueId,
              nickname: gift.nickname,
              availableCoins: (existing?.availableCoins || 0) + gift.totalDiamonds,
              totalGiftedCoins: (existing?.totalGiftedCoins || 0) + gift.totalDiamonds,
              lastGiftedAt: Date.now(),
            });
            syncCreditsState();
          }

          onFinalGiftRef.current?.(gift);
        }

        // Play DJ sound effect reaction on gift (with 2.5s cooldown to avoid clipping on rapid combos)
        const cfg = configRef.current;
        if (cfg.giftSfxEnabled && onPlaySoundEffectRef.current) {
          const now = Date.now();
          if (now - lastGiftSfxAtRef.current > 2500) {
            lastGiftSfxAtRef.current = now;
            const effect =
              gift.totalDiamonds >= cfg.bigGiftThreshold ? cfg.bigGiftSfx : cfg.smallGiftSfx;
            onPlaySoundEffectRef.current(effect);
          }
        }
      }
    },
    [syncCreditsState]
  );

  const processPlaySongRequest = useCallback(
    (chat: TikTokChatEvent, query: string) => {
      const currentCfg = configRef.current;
      const userKey = getTikTokViewerKey(chat.userId, chat.uniqueId);
      if (!userKey) return;

      const credit = viewerCreditsRef.current.get(userKey);
      const availableCoins = credit?.availableCoins ?? 0;
      const minCoins = Math.max(
        0,
        Number.isFinite(currentCfg.minRequestCoins) ? currentCfg.minRequestCoins : 0
      );

      if (availableCoins < minCoins) {
        appendRequestLog({
          type: 'insufficient_coins',
          nickname: chat.nickname,
          uniqueId: chat.uniqueId,
          query,
          coins: availableCoins,
          minCoins,
        });
        showNotice(
          'warning',
          `@${chat.uniqueId} asked for "${query}" — needs ${minCoins} coins (has ${availableCoins})`
        );
        onSongRequestFeedbackRef.current?.({
          kind: 'insufficient_coins',
          viewerName: chat.nickname || chat.uniqueId,
          query,
          availableCoins,
          requiredCoins: minCoins,
          isCustomAISong: false,
        });
        return;
      }

      const ds = deckStateRef.current;
      const currentlyPlayingIds = new Set<string>(
        [
          ds.deckAPlaying ? ds.deckATrackId : undefined,
          ds.deckBPlaying ? ds.deckBTrackId : undefined,
        ].filter(Boolean) as string[]
      );
      const activeQueuedIds = new Set<string>(
        songRequestsRef.current.filter(isActiveRequest).map((r) => r.song.id)
      );

      // 1. First try matching inside the DJ's PlayMyJam server library
      const matchedSong = findBestMatchingSong(
        query,
        songsRef.current,
        currentlyPlayingIds,
        activeQueuedIds
      );

      if (matchedSong) {
        commitMatchedSong(chat, userKey, query, matchedSong, 'library');
        return;
      }

      // 2. Fallback: search externally via play-server, save to Firebase, and return playable URL
      if (!currentCfg.externalSearchEnabled) {
        appendRequestLog({
          type: 'not_found',
          nickname: chat.nickname,
          uniqueId: chat.uniqueId,
          query,
          coins: availableCoins,
          minCoins,
        });
        showNotice(
          'warning',
          `No PlayMyJam track matched "${query}" (searched ${songsRef.current.length} songs)`
        );
        return;
      }

      const normQueryKey = query.toLowerCase().trim();
      if (inFlightExternalQueriesRef.current.has(normQueryKey)) {
        showNotice('info', `Already searching online for "${query}"...`);
        return;
      }

      inFlightExternalQueriesRef.current.add(normQueryKey);
      setSearchingQueries((prev) => (prev.includes(query) ? prev : [...prev, query]));

      appendRequestLog({
        type: 'searching',
        nickname: chat.nickname,
        uniqueId: chat.uniqueId,
        query,
        coins: availableCoins,
        minCoins,
      });
      showNotice('info', `Not in PlayMyJam — searching online & saving "${query}" to Firebase...`);

      void (async () => {
        try {
          const { song } = await fetchAndSaveExternalSong({
            query,
            ownerId: ownerIdRef.current,
            user: userFolderRef.current,
          });
          commitMatchedSong(chat, userKey, query, song, 'external');
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'External search failed';
          appendRequestLog({
            type: 'external_error',
            nickname: chat.nickname,
            uniqueId: chat.uniqueId,
            query,
            error: errMsg,
            coins: availableCoins,
            minCoins,
          });
          showNotice('warning', `Could not fetch "${query}": ${errMsg}`);
        } finally {
          inFlightExternalQueriesRef.current.delete(normQueryKey);
          setSearchingQueries((prev) => prev.filter((q) => q !== query));
        }
      })();
    },
    [appendRequestLog, commitMatchedSong, showNotice]
  );

  const processCustomAISongRequest = useCallback(
    (chat: TikTokChatEvent, aiPrompt: string, songTitle?: string) => {
      const currentCfg = configRef.current;
      if (!currentCfg.aiSongRequestsEnabled) return;

      const userKey = getTikTokViewerKey(chat.userId, chat.uniqueId);
      if (!userKey) return;

      const credit = viewerCreditsRef.current.get(userKey);
      const availableCoins = credit?.availableCoins ?? 0;
      const requiredCoins = Math.max(
        0,
        Number.isFinite(currentCfg.aiSongMinCoins) ? currentCfg.aiSongMinCoins : 50
      );
      const displayTitle = (songTitle || aiPrompt.slice(0, 42)).trim();

      if (availableCoins < requiredCoins) {
        appendRequestLog({
          type: 'insufficient_coins',
          nickname: chat.nickname,
          uniqueId: chat.uniqueId,
          query: `AI Song: ${displayTitle}`,
          coins: availableCoins,
          minCoins: requiredCoins,
        });
        showNotice(
          'warning',
          `@${chat.uniqueId} wants a custom AI song ("${displayTitle}") — needs ${requiredCoins} VIP coins (has ${availableCoins})`
        );
        onSongRequestFeedbackRef.current?.({
          kind: 'insufficient_coins',
          viewerName: chat.nickname || chat.uniqueId,
          query: displayTitle,
          songTitle: `custom AI song "${displayTitle}"`,
          availableCoins,
          requiredCoins,
          isCustomAISong: true,
        });
        return;
      }

      const normKey = `ai:${aiPrompt.toLowerCase().trim()}`;
      if (inFlightExternalQueriesRef.current.has(normKey)) {
        showNotice('info', `Already cooking custom AI song "${displayTitle}"...`);
        return;
      }

      inFlightExternalQueriesRef.current.add(normKey);
      const searchingLabel = `✨ AI Song: ${displayTitle}`;
      setSearchingQueries((prev) => (prev.includes(searchingLabel) ? prev : [...prev, searchingLabel]));

      appendRequestLog({
        type: 'ai_generating',
        nickname: chat.nickname,
        uniqueId: chat.uniqueId,
        query: displayTitle,
        coins: availableCoins,
        minCoins: requiredCoins,
      });
      showNotice('info', `✨ Creating custom AI song for @${chat.uniqueId}: "${displayTitle}"...`);

      onSongRequestFeedbackRef.current?.({
        kind: 'ai_song_cooking',
        viewerName: chat.nickname || chat.uniqueId,
        query: aiPrompt,
        songTitle: displayTitle,
        availableCoins,
        requiredCoins,
        isCustomAISong: true,
      });

      void (async () => {
        try {
          const createdSong = await generateAndSaveLiveAISong({
            prompt: aiPrompt,
            songTitle: displayTitle,
            artistName: djNameRef.current || 'PlayMyJam AI',
            requestedBy: chat.nickname || chat.uniqueId,
            ownerId: ownerIdRef.current,
            user: userFolderRef.current,
            location: 'TikTok LIVE',
          });
          commitMatchedSong(chat, userKey, displayTitle, createdSong, 'ai', requiredCoins);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Custom AI song creation failed';
          appendRequestLog({
            type: 'external_error',
            nickname: chat.nickname,
            uniqueId: chat.uniqueId,
            query: `AI Song: ${displayTitle}`,
            error: errMsg,
            coins: availableCoins,
            minCoins: requiredCoins,
          });
          showNotice('warning', `Could not create custom AI song "${displayTitle}": ${errMsg}`);
        } finally {
          inFlightExternalQueriesRef.current.delete(normKey);
          setSearchingQueries((prev) => prev.filter((q) => q !== searchingLabel));
        }
      })();
    },
    [appendRequestLog, commitMatchedSong, showNotice]
  );

  const handleIncomingChat = useCallback(
    (chat: TikTokChatEvent) => {
      setChatMessages((prev) => [chat, ...prev].slice(0, 100));

      const currentCfg = configRef.current;

      // 1. Explicit slash commands (0ms, zero LLM cost)
      if (currentCfg.requestsEnabled) {
        const explicitQuery = extractSongRequestQuery(chat.comment);
        if (explicitQuery) {
          onViewerChatRef.current?.(chat, true);
          processPlaySongRequest(chat, explicitQuery);
          return;
        }

        if (currentCfg.aiSongRequestsEnabled) {
          const explicitAiPrompt = extractExplicitAISongPrompt(chat.comment);
          if (explicitAiPrompt) {
            onViewerChatRef.current?.(chat, true);
            processCustomAISongRequest(chat, explicitAiPrompt);
            return;
          }
        }

        // 2. Natural-language AI song request detection (English & Shona, gated by fast local pre-filter)
        if (
          (currentCfg.naturalRequestsEnabled || currentCfg.aiSongRequestsEnabled) &&
          looksLikeNaturalSongRequest(chat.comment)
        ) {
          void (async () => {
            try {
              const intentRes = await parseAISongRequestIntent({
                comment: chat.comment,
                viewerName: chat.nickname || chat.uniqueId,
                djName: djNameRef.current,
                allowCustomAiSong: currentCfg.aiSongRequestsEnabled,
              });

              if (intentRes.intent === 'play_song' && intentRes.query && currentCfg.naturalRequestsEnabled) {
                onViewerChatRef.current?.(chat, true);
                processPlaySongRequest(chat, intentRes.query);
                return;
              }

              if (intentRes.intent === 'create_ai_song' && intentRes.aiPrompt && currentCfg.aiSongRequestsEnabled) {
                onViewerChatRef.current?.(chat, true);
                processCustomAISongRequest(chat, intentRes.aiPrompt, intentRes.songTitle);
                return;
              }
            } catch (err) {
              console.warn('[TikTokLive] Natural AI song intent check failed:', err);
            }
            // Not a song request — let AI MC reply to it as normal live chat!
            onViewerChatRef.current?.(chat, false);
          })();
          return;
        }
      }

      // 3. Normal live chat comment (0ms, zero LLM cost)
      onViewerChatRef.current?.(chat, false);
    },
    [processCustomAISongRequest, processPlaySongRequest]
  );

  useEffect(() => {
    if (!window.electronAPI?.tiktok) return;

    window.electronAPI.tiktok
      .getStatus()
      .then((next) => {
        if (!isMockModeRef.current) setStatus(next);
      })
      .catch(() => {});

    const unsubs = [
      window.electronAPI.tiktok.onStatus((next) => {
        if (!isMockModeRef.current) setStatus(next);
      }),
      window.electronAPI.tiktok.onGift((gift) => {
        if (!isMockModeRef.current) handleIncomingGift(gift);
      }),
      window.electronAPI.tiktok.onChat((chat) => {
        if (!isMockModeRef.current) handleIncomingChat(chat);
      }),
      window.electronAPI.tiktok.onLike((like) => {
        if (!isMockModeRef.current) {
          setTotalLikes((prev) =>
            like.totalLikeCount > prev ? like.totalLikeCount : prev + like.likeCount
          );
        }
      }),
      window.electronAPI.tiktok.onRoomStats((stats) => {
        if (!isMockModeRef.current) {
          setViewerCount(stats.viewerCount);
        }
      }),
      window.electronAPI.tiktok.onSocial((social) => {
        if (!isMockModeRef.current) {
          onSocialEventRef.current?.(social);
        }
      }),
      window.electronAPI.tiktok.onMember?.((member) => {
        if (!isMockModeRef.current) {
          onMemberJoinRef.current?.(member);
        }
      }),
    ];

    return () => {
      unsubs.forEach((fn) => fn?.());
    };
  }, [handleIncomingGift, handleIncomingChat]);

  const stopWebRelay = useCallback(() => {
    webSessionIdRef.current += 1;
    if (webReconnectTimerRef.current) {
      clearTimeout(webReconnectTimerRef.current);
      webReconnectTimerRef.current = null;
    }
    if (webAbortControllerRef.current) {
      webAbortControllerRef.current.abort();
      webAbortControllerRef.current = null;
    }
  }, []);

  const connect = useCallback(
    async (overrideUsername?: string): Promise<{
      success: boolean;
      roomId?: string;
      uniqueId?: string;
      error?: string;
    }> => {
      const targetUser = (overrideUsername ?? config.username).trim();
      if (!targetUser) {
        const error = 'Enter your TikTok @username first.';
        setStatus({ state: 'error', uniqueId: '', error });
        return { success: false, error };
      }

      setIsMockMode(false);
      isMockModeRef.current = false;

      // 1. Electron Desktop App: use direct local Node.js IPC (residential IP, zero server load)
      if (window.electronAPI?.tiktok) {
        return window.electronAPI.tiktok.connect({
          uniqueId: targetUser,
          signApiKey: config.signApiKey || undefined,
        });
      }

      // 2. Web Browser: connect via PlayMyJam play-server SSE relay (auto-reconnects on Cloud Run timeout)
      stopWebRelay();
      const sessionId = webSessionIdRef.current;
      const cleanHandle = targetUser.replace(/^@+/, '');
      const signApiKey = config.signApiKey || undefined;

      setStatus({ state: 'connecting', uniqueId: cleanHandle });

      return new Promise((resolve) => {
        let initialSettled = false;
        const settleInitial = (result: {
          success: boolean;
          roomId?: string;
          uniqueId?: string;
          error?: string;
        }) => {
          if (initialSettled) return;
          initialSettled = true;
          resolve(result);
        };

        const runStreamAttempt = async (attemptNumber: number) => {
          if (webSessionIdRef.current !== sessionId || isMockModeRef.current) {
            settleInitial({ success: false, error: 'Connection cancelled.' });
            return;
          }

          const controller = new AbortController();
          webAbortControllerRef.current = controller;

          try {
            const outcome = await connectTikTokLiveStream({
              uniqueId: targetUser,
              signApiKey,
              signal: controller.signal,
              onStatus: (next) => {
                if (webSessionIdRef.current !== sessionId || isMockModeRef.current) return;
                // While silently reconnecting after a prior drop, ignore transient 'connecting'
                // unless we haven't connected yet.
                if (next.state === 'connecting' && attemptNumber > 0) return;

                // If stream drops unexpectedly (non-ended disconnect), keep connected UI briefly while reconnecting
                if (next.state === 'disconnected' && !next.ended && attemptNumber >= 0 && initialSettled) {
                  return;
                }

                setStatus(next);

                if (next.state === 'connected') {
                  settleInitial({
                    success: true,
                    roomId: next.roomId,
                    uniqueId: next.uniqueId,
                  });
                } else if (next.state === 'error' && next.fatal) {
                  settleInitial({
                    success: false,
                    uniqueId: next.uniqueId,
                    error: next.error || 'Failed to connect to TikTok LIVE.',
                  });
                }
              },
              onGift: (gift) => {
                if (webSessionIdRef.current === sessionId && !isMockModeRef.current) {
                  handleIncomingGift(gift);
                }
              },
              onChat: (chat) => {
                if (webSessionIdRef.current === sessionId && !isMockModeRef.current) {
                  handleIncomingChat(chat);
                }
              },
              onLike: (like) => {
                if (webSessionIdRef.current === sessionId && !isMockModeRef.current) {
                  setTotalLikes((prev) =>
                    like.totalLikeCount > prev ? like.totalLikeCount : prev + like.likeCount
                  );
                }
              },
              onRoomStats: (stats) => {
                if (webSessionIdRef.current === sessionId && !isMockModeRef.current) {
                  setViewerCount(stats.viewerCount);
                }
              },
              onSocial: (social) => {
                if (webSessionIdRef.current === sessionId && !isMockModeRef.current) {
                  onSocialEventRef.current?.(social);
                }
              },
              onMember: (member) => {
                if (webSessionIdRef.current === sessionId && !isMockModeRef.current) {
                  onMemberJoinRef.current?.(member);
                }
              },
            });

            if (webSessionIdRef.current !== sessionId || controller.signal.aborted) {
              settleInitial({ success: false, error: 'Disconnected.' });
              return;
            }

            if (outcome.fatalError) {
              setStatus({ state: 'error', uniqueId: cleanHandle, error: outcome.fatalError });
              settleInitial({ success: false, uniqueId: cleanHandle, error: outcome.fatalError });
              return;
            }

            if (outcome.endedNaturally) {
              settleInitial({ success: false, uniqueId: cleanHandle, error: 'TikTok LIVE stream ended.' });
              return;
            }

            // Stream ended unexpectedly after connecting (e.g. Cloud Run 60-min limit or Wi-Fi blip) — auto-reconnect!
            if (outcome.connectedOnce || initialSettled) {
              const delayMs = Math.min(10000, 2000 * Math.pow(1.5, Math.min(attemptNumber, 4)));
              showNotice('info', `Refreshing TikTok LIVE relay for @${cleanHandle}...`);
              webReconnectTimerRef.current = setTimeout(() => {
                void runStreamAttempt(attemptNumber + 1);
              }, delayMs);
              return;
            }

            const errMsg = 'TikTok LIVE stream closed before connecting.';
            setStatus({ state: 'error', uniqueId: cleanHandle, error: errMsg });
            settleInitial({ success: false, uniqueId: cleanHandle, error: errMsg });
          } catch (err) {
            if (webSessionIdRef.current !== sessionId || controller.signal.aborted) {
              settleInitial({ success: false, error: 'Disconnected.' });
              return;
            }

            const errMsg = err instanceof Error ? err.message : 'Failed to connect to TikTok LIVE relay.';

            // If we were already connected and lost network temporarily, retry up to 5 times
            if (initialSettled && attemptNumber < 5) {
              const delayMs = Math.min(12000, 2500 * (attemptNumber + 1));
              showNotice('warning', `TikTok relay interrupted — reconnecting in ${Math.round(delayMs / 1000)}s...`);
              webReconnectTimerRef.current = setTimeout(() => {
                void runStreamAttempt(attemptNumber + 1);
              }, delayMs);
              return;
            }

            setStatus({ state: 'error', uniqueId: cleanHandle, error: errMsg });
            settleInitial({ success: false, uniqueId: cleanHandle, error: errMsg });
          }
        };

        void runStreamAttempt(0);
      });
    },
    [config.username, config.signApiKey, handleIncomingChat, handleIncomingGift, showNotice, stopWebRelay]
  );

  // Offline Mock Live session for local testing without going live on TikTok
  const startMockLive = useCallback(async () => {
    stopWebRelay();
    if (window.electronAPI?.tiktok) {
      await window.electronAPI.tiktok.disconnect().catch(() => {});
    }
    setIsMockMode(true);
    isMockModeRef.current = true;
    setViewerCount(128);
    setStatus({
      state: 'connected',
      uniqueId: 'mock_live_test',
      roomId: 'mock-room',
      isMock: true,
    });
    showNotice(
      'info',
      songsRef.current.length > 0
        ? `Mock Live ready — ${songsRef.current.length} PlayMyJam songs + online search fallback active.`
        : 'Mock Live ready — online search fallback will fetch & save songs to Firebase.'
    );
  }, [showNotice, stopWebRelay]);

  const simulateGift = useCallback(
    (params: {
      uniqueId: string;
      nickname?: string;
      giftName?: string;
      diamondCount: number;
      repeatCount?: number;
    }) => {
      const cleanHandle = (params.uniqueId || 'testfan').trim().replace(/^@+/, '') || 'testfan';
      const diamondCount = Math.max(1, Math.floor(params.diamondCount || 1));
      const repeatCount = Math.max(1, Math.floor(params.repeatCount || 1));
      const event: TikTokGiftEvent = {
        id: `mock-gift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        giftId: `mock-${diamondCount}`,
        giftName:
          params.giftName ||
          (diamondCount >= 100
            ? 'Galaxy'
            : diamondCount >= 20
            ? 'Doughnut'
            : diamondCount >= 5
            ? 'Heart Me'
            : 'Rose'),
        giftPictureUrl: '',
        diamondCount,
        repeatCount,
        totalDiamonds: diamondCount * repeatCount,
        isStreakable: false,
        isFinal: true,
        groupId: '',
        userId: `mock-user-${cleanHandle.toLowerCase()}`,
        uniqueId: cleanHandle,
        nickname: params.nickname || cleanHandle,
        profilePictureUrl: '',
        timestamp: Date.now(),
      };
      handleIncomingGift(event);
    },
    [handleIncomingGift]
  );

  const creditViewerCoinsSilently = useCallback(
    (params: { uniqueId: string; nickname?: string; coins: number }) => {
      const cleanHandle = (params.uniqueId || 'testfan').trim().replace(/^@+/, '') || 'testfan';
      const userId = `mock-user-${cleanHandle.toLowerCase()}`;
      const userKey = getTikTokViewerKey(userId, cleanHandle);
      const amount = Math.max(0, Math.floor(Number(params.coins) || 0));
      if (!userKey || amount <= 0) return;

      const existing = viewerCreditsRef.current.get(userKey);
      viewerCreditsRef.current.set(userKey, {
        userKey,
        userId,
        uniqueId: cleanHandle,
        nickname: params.nickname || cleanHandle,
        availableCoins: (existing?.availableCoins || 0) + amount,
        totalGiftedCoins: (existing?.totalGiftedCoins || 0) + amount,
        lastGiftedAt: Date.now(),
      });
      syncCreditsState();
    },
    [syncCreditsState]
  );

  const simulateChat = useCallback(
    (params: { uniqueId: string; nickname?: string; comment: string }) => {
      const cleanComment = (params.comment || '').trim();
      if (!cleanComment) return;
      const cleanHandle = (params.uniqueId || 'testfan').trim().replace(/^@+/, '') || 'testfan';
      const event: TikTokChatEvent = {
        id: `mock-chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId: `mock-user-${cleanHandle.toLowerCase()}`,
        uniqueId: cleanHandle,
        nickname: params.nickname || cleanHandle,
        profilePictureUrl: '',
        comment: cleanComment,
        timestamp: Date.now(),
      };
      handleIncomingChat(event);
    },
    [handleIncomingChat]
  );

  const disconnect = useCallback(async () => {
    setIsMockMode(false);
    isMockModeRef.current = false;
    stopWebRelay();
    if (window.electronAPI?.tiktok) {
      await window.electronAPI.tiktok.disconnect();
    }
    setStatus({ state: 'disconnected', uniqueId: '' });
  }, [stopWebRelay]);

  // Mark a song request as playing right away so it drops off the top of the request queue immediately
  const consumeSongRequest = useCallback((songId: string, deck?: 'A' | 'B') => {
    if (!songId) return;
    setSongRequests((prev) => {
      let changed = false;
      const updated = prev.map((r) => {
        if (r.song.id === songId && isActiveRequest(r)) {
          changed = true;
          return {
            ...r,
            status: 'playing' as TikTokRequestStatus,
            assignedDeck: deck ?? r.assignedDeck,
          };
        }
        return r;
      });
      if (!changed) return prev;
      const sorted = sortSongRequests(updated);
      songRequestsRef.current = sorted;
      return sorted;
    });
  }, []);

  // Explicitly mark a song request as played (e.g. when Auto DJ crossfades away from it or skips it)
  const markSongRequestPlayed = useCallback((songId: string) => {
    if (!songId) return;
    setSongRequests((prev) => {
      let changed = false;
      const updated = prev.map((r) => {
        if (r.song.id === songId && (r.status === 'playing' || isActiveRequest(r))) {
          changed = true;
          return {
            ...r,
            status: 'played' as TikTokRequestStatus,
            assignedDeck: undefined,
          };
        }
        return r;
      });
      if (!changed) return prev;
      const sorted = sortSongRequests(updated);
      songRequestsRef.current = sorted;
      return sorted;
    });
  }, []);

  const markSongRequestLoaded = useCallback((songId: string, deck: 'A' | 'B') => {
    if (!songId) return;
    setSongRequests((prev) => {
      let changed = false;
      const updated = prev.map((r) => {
        if (r.song.id === songId && r.status === 'queued') {
          changed = true;
          return {
            ...r,
            status: 'loaded' as TikTokRequestStatus,
            assignedDeck: deck,
          };
        }
        return r;
      });
      if (!changed) return prev;
      const sorted = sortSongRequests(updated);
      songRequestsRef.current = sorted;
      return sorted;
    });
  }, []);

  const approveSongRequest = useCallback(
    (requestId: string) => {
      const target = songRequestsRef.current.find((r) => r.id === requestId);
      if (!target || target.status !== 'pending') return;

      const ds = deckStateRef.current;
      const bothDecksIdle =
        !ds.deckAPlaying && !ds.deckBPlaying && Date.now() > pendingAutoPlayUntilRef.current;

      let triggeredDeck: 'A' | 'B' | undefined;
      if (configRef.current.autoPlayRequests && bothDecksIdle && onAutoPlayRequestRef.current) {
        pendingAutoPlayUntilRef.current = Date.now() + 2500;
        const deck = onAutoPlayRequestRef.current(target.song);
        triggeredDeck = deck === 'B' ? 'B' : 'A';
      }

      const next = sortSongRequests(
        songRequestsRef.current.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: (triggeredDeck ? 'playing' : 'queued') as TikTokRequestStatus,
                assignedDeck: triggeredDeck,
              }
            : r
        )
      );
      songRequestsRef.current = next;
      setSongRequests(next);

      const songLabel = `${target.song.artist} - ${target.song.title}`;
      appendRequestLog({
        type: 'approved',
        nickname: target.requestedBy.nickname,
        uniqueId: target.requestedBy.uniqueId,
        query: target.query,
        songTitle: songLabel,
        coins: target.coins,
        minCoins: configRef.current.minRequestCoins,
      });
      showNotice(
        'success',
        triggeredDeck ? `Approved & playing on Deck ${triggeredDeck}: ${songLabel}` : `Approved & queued: ${songLabel}`
      );
    },
    [appendRequestLog, showNotice]
  );

  // DJ Reject: stops/unloads the track if active, removes from queue, and refunds TikTok coins to viewer(s)
  const rejectSongRequest = useCallback(
    (requestId: string) => {
      const target = songRequestsRef.current.find((r) => r.id === requestId);
      if (!target) return;

      if (target.status === 'playing' || target.status === 'loaded') {
        onStopSongRef.current?.(target.song.id);
      }

      // Refund in-memory TikTok gift coins back to the requester(s) so they can request another track
      let refundedTotal = 0;
      for (const reqUser of target.requesters) {
        if (reqUser.coins > 0 && reqUser.userKey) {
          refundedTotal += reqUser.coins;
          const existing = viewerCreditsRef.current.get(reqUser.userKey);
          viewerCreditsRef.current.set(reqUser.userKey, {
            userKey: reqUser.userKey,
            userId: existing?.userId || reqUser.userKey,
            uniqueId: reqUser.uniqueId,
            nickname: reqUser.nickname,
            availableCoins: (existing?.availableCoins || 0) + reqUser.coins,
            totalGiftedCoins: existing?.totalGiftedCoins || reqUser.coins,
            lastGiftedAt: Date.now(),
          });
        }
      }
      if (refundedTotal > 0) {
        syncCreditsState();
      }

      const next = songRequestsRef.current.filter((r) => r.id !== requestId);
      songRequestsRef.current = next;
      setSongRequests(next);

      const songLabel = `${target.song.artist} - ${target.song.title}`;
      appendRequestLog({
        type: 'rejected',
        nickname: target.requestedBy.nickname,
        uniqueId: target.requestedBy.uniqueId,
        query: target.query,
        songTitle: songLabel,
        coins: refundedTotal,
        minCoins: configRef.current.minRequestCoins,
      });
      showNotice(
        'warning',
        `Rejected: ${songLabel}${refundedTotal > 0 ? ` (${refundedTotal} coins refunded)` : ''}`
      );
    },
    [appendRequestLog, showNotice, syncCreditsState]
  );

  const removeSongRequest = useCallback((requestId: string) => {
    const next = songRequestsRef.current.filter((r) => r.id !== requestId);
    songRequestsRef.current = next;
    setSongRequests(next);
  }, []);

  const clearPlayedRequests = useCallback(() => {
    const next = songRequestsRef.current.filter((r) => r.status !== 'played');
    songRequestsRef.current = next;
    setSongRequests(next);
  }, []);

  const clearFeed = useCallback(() => {
    setGifts([]);
    setChatMessages([]);
    setRequestLogs([]);
    setLastRequestNotice(null);
    songRequestsRef.current = [];
    setSongRequests([]);
    setViewerCredits([]);
    setTotalDiamonds(0);
    setGiftCount(0);
    setTotalLikes(0);
    countedGiftGroupsRef.current.clear();
    viewerCreditsRef.current.clear();
  }, []);

  // Active (queued/loaded) requests in exact priority order (excludes pending unapproved requests)
  const activeSongRequests = useMemo(
    () => songRequests.filter(isActiveRequest),
    [songRequests]
  );

  const pendingApprovalCount = useMemo(
    () => songRequests.filter((r) => r.status === 'pending').length,
    [songRequests]
  );

  // Next request ready to play (top queued/loaded item)
  const nextQueuedRequest = activeSongRequests[0] ?? null;

  // Lookup map passed optionally into useAutoDJ and MusicLibrary (read-only priority signal; never touches Firestore).
  const tiktokRequestCoinsBySongId = useMemo(() => {
    const map: Record<string, number> = {};
    if (!config.requestsEnabled) return map;
    activeSongRequests.forEach((req, idx) => {
      map[req.song.id] = req.coins + 1 + 0.5 / (1 + idx);
    });
    return map;
  }, [activeSongRequests, config.requestsEnabled]);

  useEffect(() => {
    return () => {
      stopWebRelay();
      window.electronAPI?.tiktok?.disconnect().catch(() => {});
    };
  }, [stopWebRelay]);

  return {
    isElectron,
    isMockMode,
    librarySongCount: songs.length,
    searchingQueries,
    config,
    updateConfig,
    status,
    isConnected: status.state === 'connected',
    isConnecting: status.state === 'connecting',
    connect,
    startMockLive,
    simulateGift,
    creditViewerCoinsSilently,
    simulateChat,
    disconnect,
    gifts,
    chatMessages,
    viewerCount,
    totalLikes,
    totalDiamonds,
    giftCount,
    viewerCredits,
    songRequests,
    activeSongRequests,
    pendingApprovalCount,
    nextQueuedRequest,
    requestLogs,
    lastRequestNotice,
    tiktokRequestCoinsBySongId,
    consumeSongRequest,
    markSongRequestPlayed,
    markSongRequestLoaded,
    approveSongRequest,
    rejectSongRequest,
    removeSongRequest,
    clearPlayedRequests,
    clearFeed,
  };
};
