/// <reference types="vite/client" />
import type {
  TikTokChatEvent,
  TikTokGiftEvent,
  TikTokLikeEvent,
  TikTokMemberEvent,
  TikTokRoomStatsEvent,
  TikTokSocialEvent,
  TikTokStatusEvent,
} from './types/tiktok';

declare global {
  interface Window {
    electronAPI?: {
      scanMusic: () => Promise<string[]>;
      downloadTrack?: (payload: { url: string; fileName?: string }) => Promise<{
        success: boolean;
        filePath?: string;
        fileName?: string;
        error?: string;
      }>;
      fetchLocalExternalSong?: (payload: {
        query?: string;
        videoId?: string;
        title?: string;
        artist?: string;
        duration?: number;
        thumbnail?: string;
        ownerId?: string;
        user?: string;
        location?: string;
        uploadBaseUrl?: string;
      }) => Promise<{
        success: boolean;
        unavailable?: boolean;
        cached?: boolean;
        localFallback?: boolean;
        data?: {
          id: string;
          title: string;
          artist: string;
          albumArt?: string;
          audioUrl: string;
          url: string;
          duration?: number;
          ownerId?: string;
          externalSource?: string;
          externalSourceId?: string;
        };
        error?: string;
      }>;
      storeGet: (key: string) => Promise<string | null>;
      storeSet: (key: string, value: string) => Promise<void>;
      storeDelete: (key: string) => Promise<void>;
      checkForUpdates?: () => Promise<unknown>;
      restartAndInstallUpdate?: () => Promise<void>;
      onUpdateAvailable?: (callback: (info: unknown) => void) => () => void;
      onUpdateProgress?: (callback: (progress: unknown) => void) => () => void;
      onUpdateDownloaded?: (callback: (info: unknown) => void) => () => void;
      tiktok?: {
        connect: (options: { uniqueId: string; signApiKey?: string }) => Promise<{
          success: boolean;
          roomId?: string;
          uniqueId?: string;
          error?: string;
        }>;
        disconnect: () => Promise<{ success: boolean }>;
        getStatus: () => Promise<TikTokStatusEvent>;
        onStatus: (callback: (status: TikTokStatusEvent) => void) => () => void;
        onGift: (callback: (gift: TikTokGiftEvent) => void) => () => void;
        onChat: (callback: (chat: TikTokChatEvent) => void) => () => void;
        onLike: (callback: (like: TikTokLikeEvent) => void) => () => void;
        onSocial: (callback: (social: TikTokSocialEvent) => void) => () => void;
        onMember?: (callback: (member: TikTokMemberEvent) => void) => () => void;
        onRoomStats: (callback: (stats: TikTokRoomStatsEvent) => void) => () => void;
      };
    };
  }
}

export {};
