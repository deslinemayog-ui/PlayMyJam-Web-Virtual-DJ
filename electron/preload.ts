import { contextBridge, ipcRenderer } from 'electron';

function subscribe<T = unknown>(channel: string, callback: (payload: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('electronAPI', {
  scanMusic: () => ipcRenderer.invoke('scan-music'),
  downloadTrack: (payload: { url: string; fileName?: string }) =>
    ipcRenderer.invoke('download-track', payload),
  fetchLocalExternalSong: (payload: {
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
  }) => ipcRenderer.invoke('fetch-local-external-song', payload),
  storeGet: (key: string) => ipcRenderer.invoke('store-get', key),
  storeSet: (key: string, value: string) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: (key: string) => ipcRenderer.invoke('store-delete', key),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  restartAndInstallUpdate: () => ipcRenderer.invoke('restart-and-install-update'),
  onUpdateAvailable: (callback: (info: unknown) => void) => subscribe('update-available', callback),
  onUpdateProgress: (callback: (progress: unknown) => void) => subscribe('update-progress', callback),
  onUpdateDownloaded: (callback: (info: unknown) => void) => subscribe('update-downloaded', callback),

  // TikTok Live Connector (Gifts, Chat, Likes, Viewers)
  tiktok: {
    connect: (options: { uniqueId: string; signApiKey?: string }) =>
      ipcRenderer.invoke('tiktok-connect', options),
    disconnect: () => ipcRenderer.invoke('tiktok-disconnect'),
    getStatus: () => ipcRenderer.invoke('tiktok-status'),
    onStatus: (callback: (status: unknown) => void) => subscribe('tiktok:status', callback),
    onGift: (callback: (gift: unknown) => void) => subscribe('tiktok:gift', callback),
    onChat: (callback: (chat: unknown) => void) => subscribe('tiktok:chat', callback),
    onLike: (callback: (like: unknown) => void) => subscribe('tiktok:like', callback),
    onSocial: (callback: (social: unknown) => void) => subscribe('tiktok:social', callback),
    onMember: (callback: (member: unknown) => void) => subscribe('tiktok:member', callback),
    onRoomStats: (callback: (stats: unknown) => void) => subscribe('tiktok:roomStats', callback),
  },
});
