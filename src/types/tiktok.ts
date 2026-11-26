import type { Song } from '@/Types';

export interface TikTokGiftEvent {
  id: string;
  giftId: string;
  giftName: string;
  giftPictureUrl: string;
  diamondCount: number;
  repeatCount: number;
  totalDiamonds: number;
  isStreakable: boolean;
  isFinal: boolean;
  groupId: string;
  userId: string;
  uniqueId: string;
  nickname: string;
  profilePictureUrl: string;
  timestamp: number;
}

export interface TikTokChatEvent {
  id: string;
  userId: string;
  uniqueId: string;
  nickname: string;
  profilePictureUrl: string;
  comment: string;
  timestamp: number;
}

export interface TikTokLikeEvent {
  userId: string;
  uniqueId: string;
  nickname: string;
  likeCount: number;
  totalLikeCount: number;
  timestamp: number;
}

export interface TikTokSocialEvent {
  type: 'follow' | 'share';
  userId: string;
  uniqueId: string;
  nickname: string;
  profilePictureUrl: string;
  timestamp: number;
}

export interface TikTokRoomStatsEvent {
  viewerCount: number;
  timestamp: number;
}

export type TikTokConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TikTokStatusEvent {
  state: TikTokConnectionState;
  uniqueId: string;
  roomId?: string;
  error?: string;
  isMock?: boolean;
}

export interface TikTokViewerCredit {
  userKey: string;
  userId: string;
  uniqueId: string;
  nickname: string;
  availableCoins: number;
  totalGiftedCoins: number;
  lastGiftedAt: number;
}

export type TikTokRequestStatus = 'pending' | 'queued' | 'loaded' | 'playing' | 'played';

export interface TikTokSongRequest {
  id: string;
  song: Song;
  coins: number;
  status: TikTokRequestStatus;
  assignedDeck?: 'A' | 'B';
  source?: 'library' | 'external';
  requestedBy: {
    userKey: string;
    userId: string;
    uniqueId: string;
    nickname: string;
  };
  requesters: Array<{
    userKey: string;
    uniqueId: string;
    nickname: string;
    coins: number;
  }>;
  query: string;
  requestedAt: number;
}

export interface TikTokRequestLog {
  id: string;
  type:
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'queued'
    | 'boosted'
    | 'playing'
    | 'already_playing'
    | 'insufficient_coins'
    | 'not_found'
    | 'searching'
    | 'external_error';
  nickname: string;
  uniqueId: string;
  query: string;
  songTitle?: string;
  audioUrl?: string;
  error?: string;
  coins: number;
  minCoins: number;
  timestamp: number;
}
