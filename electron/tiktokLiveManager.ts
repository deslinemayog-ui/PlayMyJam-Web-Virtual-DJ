import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
  type TikTokLiveConstructorConnectionOptions,
  type User,
} from 'tiktok-live-connector';
import type { WebContents } from 'electron';

export interface TikTokConnectOptions {
  uniqueId: string;
  signApiKey?: string;
}

interface ExtendedGiftInfo {
  type?: number;
  name?: string;
  diamond_count?: number;
  image?: { url_list?: string[] };
}

function normalizeHandle(input: string): string {
  let clean = (input || '').trim();
  const urlMatch = clean.match(/tiktok\.com\/@([^/?#]+)/i);
  if (urlMatch?.[1]) {
    clean = urlMatch[1];
  }
  return clean.replace(/^@+/, '').trim();
}

function getAvatarUrl(user?: User): string {
  return (
    user?.avatarThumb?.urlList?.[0] ||
    user?.avatarMedium?.urlList?.[0] ||
    ''
  );
}

function formatError(err: unknown): string {
  const obj = err && typeof err === 'object' ? (err as Record<string, unknown>) : null;
  const inner = obj && 'exception' in obj ? obj.exception : err;
  const msg =
    inner instanceof Error
      ? inner.message
      : typeof inner === 'string'
        ? inner
        : obj && typeof obj.message === 'string'
          ? obj.message
          : obj && typeof obj.info === 'string'
            ? obj.info
            : 'Connection failed';
  const name = inner instanceof Error ? inner.name : err instanceof Error ? err.name : '';

  if (name === 'UserOfflineError' || /offline|not live|LIVE has ended/i.test(msg)) {
    return 'This TikTok account is currently offline. Start your TikTok LIVE first, then connect.';
  }
  if (/Failed to retrieve Room ID/i.test(msg)) {
    return 'Could not find an active TikTok LIVE for this @username. Double-check the handle and make sure the account is currently LIVE.';
  }
  if (name === 'SignatureRateLimitError' || /rate limit/i.test(msg)) {
    return 'TikTok signing service rate limit reached. Wait a moment or add an EulerStream API key in Advanced settings.';
  }
  if (name === 'InvalidUniqueIdError') {
    return 'Invalid TikTok username. Enter a valid handle like @yourname.';
  }
  return msg;
}

export class TikTokLiveManager {
  private connection: TikTokLiveConnection | null = null;
  private currentHandle = '';
  private currentRoomId = '';
  private state: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private getWebContents: () => WebContents | null;

  constructor(getWebContents: () => WebContents | null) {
    this.getWebContents = getWebContents;
  }

  private emit(channel: string, payload: unknown) {
    const wc = this.getWebContents();
    if (wc && !wc.isDestroyed()) {
      wc.send(channel, payload);
    }
  }

  private emitStatus(
    state: 'disconnected' | 'connecting' | 'connected' | 'error',
    error?: string
  ) {
    this.state = state;
    this.emit('tiktok:status', {
      state,
      uniqueId: this.currentHandle,
      roomId: this.currentRoomId || undefined,
      error,
    });
  }

  public getStatus() {
    return {
      state: this.state,
      uniqueId: this.currentHandle,
      roomId: this.currentRoomId || undefined,
    };
  }

  public async connect(options: TikTokConnectOptions): Promise<{
    success: boolean;
    roomId?: string;
    uniqueId?: string;
    error?: string;
  }> {
    const uniqueId = normalizeHandle(options.uniqueId);
    if (!uniqueId) {
      return { success: false, error: 'Please enter a TikTok @username.' };
    }

    await this.disconnect();

    this.currentHandle = uniqueId;
    this.currentRoomId = '';
    this.emitStatus('connecting');

    try {
      const connectionOptions: TikTokLiveConstructorConnectionOptions = {
        processInitialData: true,
        fetchRoomInfoOnConnect: true,
        // Keep false: fetchRoomGiftsRoute calls EulerStream's paid signTikTokUrl (Business plan).
        // Gift name, diamond count, icon URL, and combo count already arrive directly on WebcastGiftMessage.
        enableExtendedGiftInfo: false,
        ...(options.signApiKey?.trim() ? { signApiKey: options.signApiKey.trim() } : {}),
      };

      const conn = new TikTokLiveConnection(uniqueId, connectionOptions);
      this.connection = conn;

      // Gifts (including streakable combo handling)
      conn.on(WebcastEvent.GIFT, (data) => {
        const ext = data.extendedGiftInfo as ExtendedGiftInfo | undefined;
        const giftType = Number(data.gift?.type ?? ext?.type ?? 0);
        const isStreakable = giftType === 1;
        const repeatEnd = Number(data.repeatEnd ?? 0);
        const isFinal = !isStreakable || repeatEnd === 1;
        const repeatCount = Math.max(1, Number(data.repeatCount || data.comboCount || 1));
        const diamondCount = Number(data.gift?.diamondCount ?? ext?.diamond_count ?? 1);
        const giftPictureUrl =
          data.gift?.image?.urlList?.[0] ||
          data.gift?.icon?.urlList?.[0] ||
          ext?.image?.url_list?.[0] ||
          '';

        const user = data.user;
        this.emit('tiktok:gift', {
          id: `${data.groupId || data.giftId || 'gift'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          giftId: String(data.giftId ?? data.gift?.id ?? ''),
          giftName: data.gift?.name || ext?.name || 'TikTok Gift',
          giftPictureUrl,
          diamondCount,
          repeatCount,
          totalDiamonds: diamondCount * repeatCount,
          isStreakable,
          isFinal,
          groupId: String(data.groupId || ''),
          userId: String(user?.id ?? ''),
          uniqueId: user?.displayId || 'viewer',
          nickname: user?.nickname || user?.displayId || 'TikTok Viewer',
          profilePictureUrl: getAvatarUrl(user),
          timestamp: Date.now(),
        });
      });

      // Live chat comments
      conn.on(WebcastEvent.CHAT, (data) => {
        const user = data.user;
        this.emit('tiktok:chat', {
          id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId: String(user?.id ?? ''),
          uniqueId: user?.displayId || 'viewer',
          nickname: user?.nickname || user?.displayId || 'TikTok Viewer',
          profilePictureUrl: getAvatarUrl(user),
          comment: data.content || '',
          timestamp: Date.now(),
        });
      });

      // Likes
      conn.on(WebcastEvent.LIKE, (data) => {
        const user = data.user;
        this.emit('tiktok:like', {
          userId: String(user?.id ?? ''),
          uniqueId: user?.displayId || 'viewer',
          nickname: user?.nickname || user?.displayId || 'TikTok Viewer',
          likeCount: Number(data.count ?? 1),
          totalLikeCount: Number(data.total ?? 0),
          timestamp: Date.now(),
        });
      });

      // Viewer count updates
      conn.on(WebcastEvent.ROOM_USER, (data) => {
        this.emit('tiktok:roomStats', {
          viewerCount: Number(data.total ?? 0),
          timestamp: Date.now(),
        });
      });

      // Follows & Shares
      conn.on(WebcastEvent.FOLLOW, (data) => {
        const user = data.user;
        this.emit('tiktok:social', {
          type: 'follow',
          userId: String(user?.id ?? ''),
          uniqueId: user?.displayId || 'viewer',
          nickname: user?.nickname || user?.displayId || 'TikTok Viewer',
          profilePictureUrl: getAvatarUrl(user),
          timestamp: Date.now(),
        });
      });

      conn.on(WebcastEvent.SHARE, (data) => {
        const user = data.user;
        this.emit('tiktok:social', {
          type: 'share',
          userId: String(user?.id ?? ''),
          uniqueId: user?.displayId || 'viewer',
          nickname: user?.nickname || user?.displayId || 'TikTok Viewer',
          profilePictureUrl: getAvatarUrl(user),
          timestamp: Date.now(),
        });
      });

      // Stream ended
      conn.on(WebcastEvent.STREAM_END, () => {
        this.emitStatus('disconnected', 'TikTok LIVE stream ended.');
        this.connection = null;
      });

      conn.on(ControlEvent.DISCONNECTED, () => {
        if (this.connection === conn) {
          this.emitStatus('disconnected');
        }
      });

      conn.on(ControlEvent.ERROR, (err: unknown) => {
        console.warn('[TikTokLive] Event warning:', formatError(err));
        // During 'connecting', conn.connect() emits intermediate fallback warnings before rejecting cleanly.
        // During 'connected', transient decode warnings shouldn't hide the live queue/feed UI.
      });

      const state = await conn.connect();
      this.currentRoomId = String(state?.roomId || conn.roomId || '');
      this.emitStatus('connected');

      return {
        success: true,
        roomId: this.currentRoomId,
        uniqueId: this.currentHandle,
      };
    } catch (err) {
      const message = formatError(err);
      console.error('[TikTokLive] Connect failed:', message);
      this.connection = null;
      this.emitStatus('error', message);
      return { success: false, error: message };
    }
  }

  public async disconnect(): Promise<void> {
    if (this.connection) {
      const conn = this.connection;
      this.connection = null;
      try {
        await conn.disconnect();
      } catch (err) {
        console.warn('[TikTokLive] Disconnect warning:', err);
      }
    }
    this.currentRoomId = '';
    if (this.state !== 'disconnected') {
      this.emitStatus('disconnected');
    }
  }
}
