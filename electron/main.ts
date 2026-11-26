import { app, BrowserWindow, protocol, ipcMain, net } from 'electron';
import path from 'path';
import fs from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import electronUpdater from 'electron-updater';
import { TikTokLiveManager } from './tiktokLiveManager';

const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const tiktokManager = new TikTokLiveManager(() => mainWindow?.webContents ?? null);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'PlayMyJam',
    icon: path.join(__dirname, '../public/playIcon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.maximize();

  const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(`${VITE_DEV_SERVER_URL}#/virtual-dj`);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'virtual-dj' });
  }

  mainWindow.on('closed', () => {
    void tiktokManager.disconnect();
    mainWindow = null;
  });
}

function scanDirectory(dir: string, maxDepth: number = 15): string[] {
  let results: string[] = [];
  if (maxDepth < 0) return results;
  
  try {
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          if (!file.startsWith('.')) {
            results = results.concat(scanDirectory(fullPath, maxDepth - 1));
          }
        } else {
          if (/\.(mp3|wav|m4a|flac|ogg)$/i.test(file)) {
            results.push(fullPath);
          }
        }
      } catch (e) {
        // ignore unreadable files
      }
    });
  } catch (e) {
    // ignore
  }
  return results;
}

app.whenReady().then(() => {
  protocol.handle('local', (request) => {
    let filePath = request.url.replace('local://', '');
    if (process.platform === 'win32') {
      filePath = filePath.replace(/^\//, ''); 
    }
    filePath = decodeURIComponent(filePath);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  ipcMain.handle('scan-music', () => {
    const musicDir = app.getPath('music');
    return scanDirectory(musicDir);
  });

  // File-based persistent storage for redux-persist
  const storageFile = path.join(app.getPath('userData'), 'playmyjam-store.json');

  const readStore = (): Record<string, string> => {
    try {
      if (fs.existsSync(storageFile)) {
        return JSON.parse(fs.readFileSync(storageFile, 'utf-8'));
      }
    } catch (e) {}
    return {};
  };

  const writeStore = (data: Record<string, string>) => {
    try {
      fs.writeFileSync(storageFile, JSON.stringify(data), 'utf-8');
    } catch (e) {}
  };

  ipcMain.handle('store-get', (_event, key: string) => {
    return readStore()[key] ?? null;
  });

  ipcMain.handle('store-set', (_event, key: string, value: string) => {
    const data = readStore();
    data[key] = value;
    writeStore(data);
  });

  ipcMain.handle('store-delete', (_event, key: string) => {
    const data = readStore();
    delete data[key];
    writeStore(data);
  });

  // Auto-updater IPC handlers
  ipcMain.handle('check-for-updates', async () => {
    if (app.isPackaged) {
      try {
        return await autoUpdater.checkForUpdates();
      } catch (err) {
        console.error('[AutoUpdater] Error checking for updates:', err);
        return null;
      }
    }
    return null;
  });

  ipcMain.handle('restart-and-install-update', () => {
    autoUpdater.quitAndInstall();
  });

  // TikTok Live Connector IPC handlers (gifts, chat, likes, viewers)
  ipcMain.handle('tiktok-connect', async (_event, options: { uniqueId: string; signApiKey?: string }) => {
    return tiktokManager.connect(options);
  });

  ipcMain.handle('tiktok-disconnect', async () => {
    await tiktokManager.disconnect();
    return { success: true };
  });

  ipcMain.handle('tiktok-status', () => {
    return tiktokManager.getStatus();
  });

  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] Running latest version:', info.version);
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`[AutoUpdater] Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent.toFixed(1)}%`);
    mainWindow?.webContents.send('update-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    mainWindow?.webContents.send('update-downloaded', info);
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[AutoUpdater] Failed to check for updates:', err);
    });
  }
}

app.on('before-quit', () => {
  void tiktokManager.disconnect();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
