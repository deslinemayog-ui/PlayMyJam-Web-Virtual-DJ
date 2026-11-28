import type { Song } from '@/Types';
import type {
  TikTokChatEvent,
  TikTokGiftEvent,
  TikTokLikeEvent,
  TikTokMemberEvent,
  TikTokRoomStatsEvent,
  TikTokSocialEvent,
  TikTokStatusEvent,
} from '@/types/tiktok';

const PROD_PLAY_SERVER_URL = 'https://play-server-371330410186.africa-south1.run.app';
const LOCAL_PLAY_SERVER_URL = 'http://localhost:3500';

let cachedWorkingBaseUrl: string | null = null;

function isLocalRuntime(): boolean {
  // Only prioritize localhost:3500 during Vite development (never in packaged Electron file:// or production web builds)
  return Boolean(import.meta.env.DEV);
}

function getCandidateBaseUrls(): string[] {
  const configured = (import.meta.env.VITE_PLAY_SERVER_URL as string | undefined)?.trim();
  const candidates: string[] = [];

  if (configured) {
    candidates.push(configured.replace(/\/+$/, ''));
  }
  if (cachedWorkingBaseUrl) {
    candidates.push(cachedWorkingBaseUrl);
  }
  if (isLocalRuntime()) {
    candidates.push(LOCAL_PLAY_SERVER_URL);
  }
  candidates.push(PROD_PLAY_SERVER_URL);

  return Array.from(new Set(candidates));
}

async function postPlayServerJson<T>(path: string, body: Record<string, unknown>, timeoutMs = 240000): Promise<T> {
  const urls = getCandidateBaseUrls();
  let lastError: Error | null = null;

  for (const baseUrl of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const payload = isJson ? await response.json().catch(() => ({})) : {};

      if (!response.ok) {
        // If local play-server responded with a non-JSON 404 (Express "Cannot POST /api/..."),
        // tell the developer clearly to restart local play-server instead of silently hitting Cloud Run.
        if (response.status === 404 && !isJson && baseUrl === LOCAL_PLAY_SERVER_URL) {
          throw new Error(
            `Local play-server (${LOCAL_PLAY_SERVER_URL}) is running without ${path}. Restart it with "cd play && npm start".`
          );
        }
        // Any structured JSON error from a live server (400, 404 "No external audio found", 500) is real — surface it directly!
        throw new Error(payload?.error || `Endpoint ${path} failed (${response.status}) on ${baseUrl}`);
      }

      cachedWorkingBaseUrl = baseUrl;
      return payload as T;
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      // Only fall back to the next URL if connection was refused immediately (server not running),
      // NOT if the server was running and restarted/dropped the request mid-flight.
      const isNetworkErr =
        err instanceof TypeError ||
        /failed to fetch|networkerror|load failed|err_connection_refused/i.test(message);
      if (isNetworkErr && baseUrl === LOCAL_PLAY_SERVER_URL && elapsedMs > 2000) {
        throw new Error(
          `Local play-server (${LOCAL_PLAY_SERVER_URL}) disconnected while processing ${path}. Check the play-server terminal logs.`
        );
      }
      lastError = err instanceof Error ? err : new Error(message);
      if (!isNetworkErr) {
        throw lastError;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Unable to reach play-server.');
}

export interface ExternalSongSearchResult {
  videoId: string;
  title: string;
  artist: string;
  rawTitle: string;
  duration: number;
  thumbnail: string;
  webpageUrl: string;
}

export interface SearchExternalSongsResponse {
  success: boolean;
  query: string;
  results: ExternalSongSearchResult[];
  error?: string;
}

export interface FetchExternalSongResponse {
  success: boolean;
  cached?: boolean;
  message?: string;
  candidate?: {
    videoId: string;
    title: string;
    artist: string;
    duration?: number;
    thumbnail?: string;
  } | null;
  data: {
    id: string;
    title: string;
    artist: string;
    albumArt?: string;
    audioUrl: string;
    url: string;
    duration?: number;
    ownerId?: string;
    fileName?: string;
    externalSource?: string;
    externalSourceId?: string;
  } | null;
  error?: string;
}

function toPlayableSong(d: NonNullable<FetchExternalSongResponse['data']>): Song {
  return {
    id: d.id,
    title: d.title || 'Untitled Track',
    artist: d.artist || 'Unknown Artist',
    albumArt: d.albumArt || 'https://mrdocs.empiredigitals.org/playIcon.png',
    url: d.url || d.audioUrl,
    audioUrl: d.audioUrl || d.url,
    duration: Number(d.duration) || 0,
    ownerId: d.ownerId || '',
    active: true,
    currentBid: 0,
    action: 'stop',
    isPlaying: false,
    isSuggested: false,
  };
}

export async function searchExternalSongs(
  query: string,
  limit = 5
): Promise<ExternalSongSearchResult[]> {
  const res = await postPlayServerJson<SearchExternalSongsResponse>(
    '/api/search-song',
    { query: query.trim(), limit },
    30000
  );
  if (!res.success) {
    throw new Error(res.error || 'External search failed.');
  }
  return Array.isArray(res.results) ? res.results : [];
}

export async function fetchAndSaveExternalSong(params: {
  query?: string;
  videoId?: string;
  title?: string;
  artist?: string;
  duration?: number;
  thumbnail?: string;
  ownerId?: string;
  user?: string;
  location?: string;
}): Promise<{ song: Song; cached: boolean }> {
  const baseBody = {
    query: params.query?.trim() || undefined,
    videoId: params.videoId?.trim() || undefined,
    title: params.title?.trim() || undefined,
    artist: params.artist?.trim() || undefined,
    duration: params.duration || undefined,
    thumbnail: params.thumbnail?.trim() || undefined,
    ownerId: params.ownerId?.trim() || undefined,
    user: params.user?.trim() || undefined,
    location: params.location?.trim() || undefined,
  };

  // Desktop Electron fast path:
  // 1) Check Firebase cache first (~0.5s, zero YouTube download if already saved)
  // 2) If uncached, download directly via residential-IP local yt-dlp (zero datacenter bot walls!) and upload to Firebase
  // 3) If local yt-dlp isn't installed, fall through seamlessly to Cloud Run /api/fetch-song
  const localFetcher =
    typeof window !== 'undefined' ? window.electronAPI?.fetchLocalExternalSong : undefined;

  if (localFetcher) {
    let resolvedCandidate: FetchExternalSongResponse['candidate'] = null;
    try {
      const cacheRes = await postPlayServerJson<FetchExternalSongResponse>(
        '/api/fetch-song',
        { ...baseBody, cacheOnly: true },
        25000
      );
      if (cacheRes.success && cacheRes.cached && cacheRes.data?.audioUrl) {
        return { song: toPlayableSong(cacheRes.data), cached: true };
      }
      resolvedCandidate = cacheRes.candidate || null;
    } catch {
      // Cache check is best-effort; continue to local residential download
    }

    const uploadBaseUrl = cachedWorkingBaseUrl || PROD_PLAY_SERVER_URL;
    const localRes = await localFetcher({
      query: baseBody.query,
      videoId: baseBody.videoId || resolvedCandidate?.videoId,
      title: baseBody.title || resolvedCandidate?.title,
      artist: baseBody.artist || resolvedCandidate?.artist,
      duration: baseBody.duration || resolvedCandidate?.duration,
      thumbnail: baseBody.thumbnail || resolvedCandidate?.thumbnail,
      ownerId: baseBody.ownerId,
      user: baseBody.user,
      location: baseBody.location,
      uploadBaseUrl,
    });

    if (localRes?.success && localRes.data?.audioUrl) {
      return { song: toPlayableSong(localRes.data), cached: Boolean(localRes.cached) };
    }

    // If local yt-dlp IS installed and returned a real error (not missing binary), still fall back to Cloud Run
    // in case SoundCloud/proxy on the server succeeds!
    if (!localRes?.unavailable && localRes?.error) {
      console.warn('[fetchAndSaveExternalSong] Local Electron fetch failed, trying Cloud Run:', localRes.error);
    }
  }

  const res = await postPlayServerJson<FetchExternalSongResponse>('/api/fetch-song', baseBody, 240000);

  if (!res.success || !res.data?.audioUrl) {
    throw new Error(res.error || 'Failed to fetch and save external song.');
  }

  return { song: toPlayableSong(res.data), cached: Boolean(res.cached) };
}

export interface TikTokStreamStatusPayload extends TikTokStatusEvent {
  ended?: boolean;
  fatal?: boolean;
}

export interface ConnectTikTokStreamParams {
  uniqueId: string;
  signApiKey?: string;
  signal: AbortSignal;
  onStatus?: (status: TikTokStreamStatusPayload) => void;
  onGift?: (gift: TikTokGiftEvent) => void;
  onChat?: (chat: TikTokChatEvent) => void;
  onLike?: (like: TikTokLikeEvent) => void;
  onRoomStats?: (stats: TikTokRoomStatsEvent) => void;
  onSocial?: (social: TikTokSocialEvent) => void;
  onMember?: (member: TikTokMemberEvent) => void;
}

export interface TikTokStreamOutcome {
  connectedOnce: boolean;
  endedNaturally: boolean;
  fatalError?: string;
}

/**
 * Opens a Server-Sent Events (SSE) stream against play-server (`POST /api/tiktok/stream`)
 * so TikTok LIVE works directly in web browsers without Electron.
 */
export async function connectTikTokLiveStream(
  params: ConnectTikTokStreamParams
): Promise<TikTokStreamOutcome> {
  const urls = getCandidateBaseUrls();
  let response: Response | null = null;
  let lastError: Error | null = null;

  for (const baseUrl of urls) {
    if (params.signal.aborted) {
      return { connectedOnce: false, endedNaturally: true };
    }

    try {
      const res = await fetch(`${baseUrl}/api/tiktok/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          uniqueId: params.uniqueId,
          signApiKey: params.signApiKey || undefined,
        }),
        signal: params.signal,
      });

      const contentType = res.headers.get('content-type') || '';

      if (!res.ok) {
        const isJson = contentType.includes('application/json');
        const payload = isJson ? await res.json().catch(() => ({})) : {};
        // If local dev play-server doesn't have /api/tiktok/stream yet, fall back to Cloud Run
        if (res.status === 404 && !isJson && baseUrl === LOCAL_PLAY_SERVER_URL) {
          lastError = new Error(
            `Local play-server (${LOCAL_PLAY_SERVER_URL}) does not have /api/tiktok/stream yet.`
          );
          continue;
        }
        throw new Error(payload?.error || `TikTok relay failed (${res.status}) on ${baseUrl}`);
      }

      if (!res.body) {
        throw new Error('Browser does not support streaming responses for TikTok LIVE relay.');
      }

      cachedWorkingBaseUrl = baseUrl;
      response = res;
      break;
    } catch (err) {
      if (params.signal.aborted) {
        return { connectedOnce: false, endedNaturally: true };
      }
      const message = err instanceof Error ? err.message : String(err);
      const isNetworkErr =
        err instanceof TypeError ||
        /failed to fetch|networkerror|load failed|err_connection_refused/i.test(message);
      lastError = err instanceof Error ? err : new Error(message);
      if (!isNetworkErr) {
        throw lastError;
      }
    }
  }

  if (!response || !response.body) {
    throw lastError || new Error('Unable to reach PlayMyJam TikTok LIVE relay server.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let connectedOnce = false;
  let endedNaturally = false;
  let fatalError: string | undefined;

  const dispatchFrame = (rawFrame: string) => {
    const lines = rawFrame.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) return;

    let payload: unknown;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }

    switch (eventName) {
      case 'status': {
        const statusPayload = payload as TikTokStreamStatusPayload;
        if (statusPayload.state === 'connected') {
          connectedOnce = true;
        }
        if (statusPayload.ended) {
          endedNaturally = true;
        }
        if (statusPayload.state === 'error' && statusPayload.fatal) {
          fatalError = statusPayload.error || 'TikTok LIVE connection failed.';
        }
        params.onStatus?.(statusPayload);
        break;
      }
      case 'gift':
        params.onGift?.(payload as TikTokGiftEvent);
        break;
      case 'chat':
        params.onChat?.(payload as TikTokChatEvent);
        break;
      case 'like':
        params.onLike?.(payload as TikTokLikeEvent);
        break;
      case 'roomStats':
        params.onRoomStats?.(payload as TikTokRoomStatsEvent);
        break;
      case 'social':
        params.onSocial?.(payload as TikTokSocialEvent);
        break;
      case 'member':
        params.onMember?.(payload as TikTokMemberEvent);
        break;
      default:
        break;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        if (frame.trim()) {
          dispatchFrame(frame);
        }
      }
    }

    // Flush any remaining partial frame
    buffer += decoder.decode();
    if (buffer.trim()) {
      dispatchFrame(buffer);
    }
  } catch (err) {
    if (!params.signal.aborted) {
      throw err;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore cancel errors
    }
  }

  return { connectedOnce, endedNaturally, fatalError };
}

export type AIMCEventType =
  | 'join'
  | 'question'
  | 'gift'
  | 'follow'
  | 'share'
  | 'now_playing'
  | 'hype'
  | 'custom'
  | 'song_queued'
  | 'song_need_coins'
  | 'ai_song_cooking'
  | 'ai_song_ready';

export type AIMCAccent = 'zim' | 'sa' | 'jamaican' | 'us_club' | 'uk_club';
export type AIMCEnergy = 'hype' | 'radio' | 'chill';
export type AIMCVoiceName = 'Fenrir' | 'Puck' | 'Charon' | 'Kore' | 'Aoede' | 'Zephyr';

export interface RequestAIMCSpeakParams {
  eventType: AIMCEventType;
  djName?: string;
  mcName?: string;
  aboutLive?: string;
  accent?: AIMCAccent;
  voiceName?: AIMCVoiceName;
  energy?: AIMCEnergy;
  viewerName?: string;
  viewerNames?: string[];
  question?: string;
  giftName?: string;
  giftCount?: number;
  giftCoins?: number;
  currentTrack?: { title: string; artist: string } | null;
  recentLines?: string[];
  customText?: string;
  includeAudio?: boolean;
}

export interface RequestAIMCSpeakResponse {
  success: boolean;
  text: string;
  audioBase64?: string | null;
  mimeType?: string;
  voiceName?: string;
  ttsFallbackReason?: string;
  error?: string;
}

export async function requestAIMCSpeak(
  params: RequestAIMCSpeakParams
): Promise<RequestAIMCSpeakResponse> {
  const res = await postPlayServerJson<RequestAIMCSpeakResponse>(
    '/api/ai-mc/speak',
    params as unknown as Record<string, unknown>,
    45000
  );
  if (!res.success || !res.text) {
    throw new Error(res.error || 'AI MC could not generate a line.');
  }
  return res;
}

export interface AIMCCommentFilterResult {
  success: boolean;
  shouldReply: boolean;
  reason?: string;
}

export async function classifyAIMCCommentTarget(params: {
  comment: string;
  viewerName?: string;
  djName?: string;
  hostHandle?: string;
  mcName?: string;
  aboutLive?: string;
  currentTrack?: { title: string; artist: string } | null;
  recentMessages?: Array<{ sender: string; text: string }>;
}): Promise<AIMCCommentFilterResult> {
  return postPlayServerJson<AIMCCommentFilterResult>(
    '/api/ai-mc/should-reply',
    {
      comment: params.comment.trim(),
      viewerName: params.viewerName?.trim() || undefined,
      djName: params.djName?.trim() || undefined,
      hostHandle: params.hostHandle?.trim() || undefined,
      mcName: params.mcName?.trim() || undefined,
      aboutLive: params.aboutLive?.trim() || undefined,
      currentTrack: params.currentTrack || null,
      recentMessages: params.recentMessages || [],
    },
    6000
  );
}

export interface AISongIntentResult {
  success: boolean;
  intent: 'play_song' | 'create_ai_song' | 'none';
  query?: string;
  songTitle?: string;
  aiPrompt?: string;
  style?: string;
  error?: string;
}

export async function parseAISongRequestIntent(params: {
  comment: string;
  viewerName?: string;
  djName?: string;
  allowCustomAiSong?: boolean;
}): Promise<AISongIntentResult> {
  return postPlayServerJson<AISongIntentResult>(
    '/api/ai-song-intent',
    {
      comment: params.comment.trim(),
      viewerName: params.viewerName?.trim() || undefined,
      djName: params.djName?.trim() || undefined,
      allowCustomAiSong: params.allowCustomAiSong !== false,
    },
    12000
  );
}

export async function generateAndSaveLiveAISong(params: {
  prompt: string;
  songTitle?: string;
  artistName?: string;
  requestedBy?: string;
  ownerId?: string;
  user?: string;
  location?: string;
}): Promise<Song> {
  const res = await postPlayServerJson<FetchExternalSongResponse>(
    '/api/generate-and-save-ai-song',
    {
      prompt: params.prompt.trim(),
      songTitle: params.songTitle?.trim() || undefined,
      artistName: params.artistName?.trim() || undefined,
      requestedBy: params.requestedBy?.trim() || undefined,
      ownerId: params.ownerId?.trim() || undefined,
      user: params.user?.trim() || undefined,
      location: params.location?.trim() || 'TikTok LIVE',
    },
    200000
  );

  if (!res.success || !res.data?.audioUrl) {
    throw new Error(res.error || 'Failed to create custom AI song.');
  }

  const d = res.data;
  return {
    id: d.id,
    title: d.title || params.songTitle || 'Custom AI Track',
    artist: d.artist || params.artistName || 'PlayMyJam AI',
    albumArt: d.albumArt || 'https://mrdocs.empiredigitals.org/playIcon.png',
    url: d.url || d.audioUrl,
    audioUrl: d.audioUrl || d.url,
    duration: Number(d.duration) || 0,
    ownerId: d.ownerId || '',
    active: true,
    currentBid: 0,
    action: 'stop',
    isPlaying: false,
    isSuggested: false,
  };
}
