import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Song } from '@/Types';
import type {
  TikTokChatEvent,
  TikTokGiftEvent,
  TikTokRequestLog,
  TikTokRequestStatus,
  TikTokSongRequest,
  TikTokStatusEvent,
  TikTokViewerCredit,
} from '@/types/tiktok';
import {
  extractSongRequestQuery,
  findBestMatchingSong,
  getTikTokViewerKey,
} from '@/lib/tiktokSongRequests';
import { fetchAndSaveExternalSong } from '@/lib/playServerApi';

const STORAGE_KEY = 'playmyjam_tiktok_live_v1';

export type TikTokGiftSfxType = 'laser' | 'horn' | 'siren' | 'zap' | 'whoosh' | 'scratch';

interface SavedTikTokConfig {
  username: string;
  signApiKey: string;
  minRequestCoins: number;
  requestsEnabled: boolean;
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
  deckState?: TikTokDeckPlaybackState;
  onAutoPlayRequest?: (song: Song) => 'A' | 'B' | void;
  onStopSong?: (songId: string) => void;
  onPlaySoundEffect?: (effect: TikTokGiftSfxType) => void;
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
      const bigThreshold = Number(parsed.bigGiftThreshold);
      return {
        username: parsed.username || '',
        signApiKey: parsed.signApiKey || '',
        minRequestCoins: Number.isFinite(minCoins) && minCoins >= 0 ? Math.floor(minCoins) : 1,
        requestsEnabled: parsed.requestsEnabled !== false,
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
  deckState,
  onAutoPlayRequest,
  onStopSong,
  onPlaySoundEffect,
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
  const configRef = useRef<SavedTikTokConfig>(config);
  const isMockModeRef = useRef<boolean>(isMockMode);
  const onAutoPlayRequestRef = useRef(onAutoPlayRequest);
  const onStopSongRef = useRef(onStopSong);
  const onPlaySoundEffectRef = useRef(onPlaySoundEffect);
  const lastGiftSfxAtRef = useRef<number>(0);
  const pendingAutoPlayUntilRef = useRef<number>(0);
  const inFlightExternalQueriesRef = useRef<Set<string>>(new Set());

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

    const deckAEnded = !deckAPlaying && deckADuration > 0 && deckAPosition >= deckADuration - 1.2;
    const deckBEnded = !deckBPlaying && deckBDuration > 0 && deckBPosition >= deckBDuration - 1.2;

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
          if (req.status === 'playing' && ended) {
            nextStatus = 'played';
            nextDeck = undefined;
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
      source: 'library' | 'external'
    ) => {
      const currentCfg = configRef.current;
      const minCoins = Math.max(
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
          status: needsApproval ? 'pending' : triggeredAutoPlayDeck ? 'loaded' : 'queued',
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
      const sourceNote = source === 'external' ? ' (saved to Firebase)' : '';
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

  const handleIncomingChat = useCallback(
    (chat: TikTokChatEvent) => {
      setChatMessages((prev) => [chat, ...prev].slice(0, 100));

      const currentCfg = configRef.current;
      if (!currentCfg.requestsEnabled) return;

      const query = extractSongRequestQuery(chat.comment);
      if (!query) return;

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
    ];

    return () => {
      unsubs.forEach((fn) => fn?.());
    };
  }, [handleIncomingGift, handleIncomingChat]);

  const connect = useCallback(
    async (overrideUsername?: string) => {
      const targetUser = (overrideUsername ?? config.username).trim();
      if (!targetUser) {
        const error = 'Enter your TikTok @username first.';
        setStatus({ state: 'error', uniqueId: '', error });
        return { success: false, error };
      }

      if (!window.electronAPI?.tiktok) {
        const error = 'TikTok Live Connector requires the PlayMyJam Desktop (Electron) app.';
        setStatus({ state: 'error', uniqueId: targetUser, error });
        return { success: false, error };
      }

      setIsMockMode(false);
      isMockModeRef.current = false;

      return window.electronAPI.tiktok.connect({
        uniqueId: targetUser,
        signApiKey: config.signApiKey || undefined,
      });
    },
    [config.username, config.signApiKey]
  );

  // Offline Mock Live session for local testing without going live on TikTok
  const startMockLive = useCallback(async () => {
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
  }, [showNotice]);

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
    if (window.electronAPI?.tiktok) {
      await window.electronAPI.tiktok.disconnect();
    }
    setStatus({ state: 'disconnected', uniqueId: '' });
  }, []);

  // Mark a song request as playing/loaded rather than deleting it immediately from the UI
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
                status: (triggeredDeck ? 'loaded' : 'queued') as TikTokRequestStatus,
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
      window.electronAPI?.tiktok?.disconnect().catch(() => {});
    };
  }, []);

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
    markSongRequestLoaded,
    approveSongRequest,
    rejectSongRequest,
    removeSongRequest,
    clearPlayedRequests,
    clearFeed,
  };
};
