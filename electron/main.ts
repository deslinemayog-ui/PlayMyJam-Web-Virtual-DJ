import { app, BrowserWindow, protocol, ipcMain, net, session } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { pathToFileURL, fileURLToPath } from 'url';
import electronUpdater from 'electron-updater';
import { TikTokLiveManager } from './tiktokLiveManager';

const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Allow Pioneer MIDI controllers to start deck playback immediately without requiring a mouse click first
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

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
  // Auto-grant Web MIDI, SysEx, and audio output/device selection permissions for Pioneer DJ controllers & CDJs
  const allowedHardwarePermissions = new Set([
    'midi',
    'midiSysex',
    'media',
    'audioCapture',
    'speaker-selection',
    'hid',
  ]);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedHardwarePermissions.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedHardwarePermissions.has(permission);
  });

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

  // Save a remote track directly into the user's Downloads folder
  ipcMain.handle(
    'download-track',
    async (_event, payload: { url: string; fileName?: string }) => {
      try {
        const rawUrl = typeof payload?.url === 'string' ? payload.url.trim() : '';
        if (!/^https?:\/\//i.test(rawUrl)) {
          return { success: false, error: 'Invalid track download URL.' };
        }

        const response = await net.fetch(rawUrl);
        if (!response.ok) {
          return { success: false, error: `Download failed (HTTP ${response.status}).` };
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        const inferExt = (): string => {
          if (contentType.includes('wav')) return '.wav';
          if (contentType.includes('flac')) return '.flac';
          if (contentType.includes('ogg')) return '.ogg';
          if (contentType.includes('mp4') || contentType.includes('m4a') || contentType.includes('aac')) {
            return '.m4a';
          }
          if (contentType.includes('webm')) return '.webm';
          try {
            const urlPath = decodeURIComponent(new URL(rawUrl).pathname);
            const urlExtMatch = urlPath.match(/\.(mp3|wav|m4a|aac|flac|ogg|opus|webm)$/i);
            if (urlExtMatch) return urlExtMatch[0].toLowerCase();
          } catch {
            // fallback to .mp3
          }
          return '.mp3';
        };

        const rawName = path.basename(
          typeof payload?.fileName === 'string' && payload.fileName.trim()
            ? payload.fileName.trim()
            : 'PlayMyJam Track.mp3'
        );
        // Strip characters disallowed on Windows/macOS/Linux filesystems and ASCII control chars
        let safeName = Array.from(rawName)
          .map((ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch))
          .join('')
          .replace(/[<>:"/\\|?*]/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/^[.\s]+|[.\s]+$/g, '')
          .slice(0, 160);

        if (!safeName) {
          safeName = 'PlayMyJam Track';
        }
        if (!/\.(mp3|wav|m4a|aac|flac|ogg|opus|webm)$/i.test(safeName)) {
          safeName = `${safeName}${inferExt()}`;
        }

        const downloadsDir = app.getPath('downloads');
        await fs.promises.mkdir(downloadsDir, { recursive: true });

        const ext = path.extname(safeName);
        const stem = path.basename(safeName, ext);
        let finalFileName = safeName;
        let filePath = path.join(downloadsDir, finalFileName);
        let counter = 1;
        while (fs.existsSync(filePath) && counter < 1000) {
          finalFileName = `${stem} (${counter})${ext}`;
          filePath = path.join(downloadsDir, finalFileName);
          counter += 1;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.promises.writeFile(filePath, buffer);

        return { success: true, filePath, fileName: finalFileName };
      } catch (err) {
        console.error('[DownloadTrack] Failed to download track:', err);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to save song to Downloads.',
        };
      }
    }
  );

  // File-based persistent storage for redux-persist
  const storageFile = path.join(app.getPath('userData'), 'playmyjam-store.json');

  const readStore = (): Record<string, string> => {
    try {
      if (fs.existsSync(storageFile)) {
        return JSON.parse(fs.readFileSync(storageFile, 'utf-8'));
      }
    } catch {
      // ignore read errors
    }
    return {};
  };

  const writeStore = (data: Record<string, string>) => {
    try {
      fs.writeFileSync(storageFile, JSON.stringify(data), 'utf-8');
    } catch {
      // ignore write errors
    }
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

function resolveLocalBinary(candidates: string[], fallback: string): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return fallback;
}

function runLocalYtDlp(args: string[], timeoutMs = 150000): Promise<{ stdout: string; stderr: string }> {
  const ytdlpBin = resolveLocalBinary(
    ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'],
    'yt-dlp'
  );
  const ffmpegBin = resolveLocalBinary(
    ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'],
    ''
  );
  const finalArgs = [
    '--force-ipv4',
    ...(ffmpegBin ? ['--ffmpeg-location', path.dirname(ffmpegBin)] : []),
    ...args,
  ];

  return new Promise((resolve, reject) => {
    execFile(
      ytdlpBin,
      finalArgs,
      {
        timeout: timeoutMs,
        maxBuffer: 15 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:${process.env.PATH || ''}`,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as NodeJS.ErrnoException;
          if (err.code === 'ENOENT') {
            const missingErr = new Error('LOCAL_YTDLP_MISSING');
            reject(missingErr);
            return;
          }
          const detail =
            (stderr || '').trim().split('\n').filter(Boolean).slice(-4).join(' | ') ||
            error.message;
          reject(new Error(detail || 'Local yt-dlp failed.'));
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function parseLocalArtistTitle(entry: Record<string, unknown>): { artist: string; title: string } {
  const rawTitle = String(entry?.title || '').trim();
  const cleaned =
    rawTitle
      .replace(
        /\s*[([](?:official\s*)?(?:music\s*)?(?:video|audio|lyric(?:s)?|hd|hq|4k|visualizer|mv|full\s*song|explicit|clean|remastered)[^\])]*[\])]/gi,
        ''
      )
      .replace(/\s*\|\s*official.*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim() ||
    rawTitle ||
    'Untitled Track';

  const fallbackArtist =
    String(entry?.artist || entry?.creator || '').trim() ||
    String(entry?.channel || entry?.uploader || '')
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/\s*VEVO$/i, '')
      .replace(/\s*Official$/i, '')
      .trim() ||
    'Unknown Artist';

  const sep = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (sep && sep[1].length <= 60 && sep[2].length >= 2) {
    return { artist: sep[1].trim(), title: sep[2].trim() };
  }
  return { artist: fallbackArtist, title: cleaned };
}

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

  // Residential-IP local yt-dlp song fetcher (immune to Cloud Run YouTube datacenter bot blocks)
  ipcMain.handle(
    'fetch-local-external-song',
    async (
      _event,
      payload: {
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
      }
    ) => {
      const tempDir = path.join(os.tmpdir(), 'playmyjam-local-fetch');
      const tempId = randomUUID();
      let downloadedPath = '';

      try {
        await fs.promises.mkdir(tempDir, { recursive: true });

        let videoId = (payload?.videoId || '').trim();
        let title = (payload?.title || '').trim();
        let artist = (payload?.artist || '').trim();
        let duration = Math.max(0, Math.round(Number(payload?.duration) || 0));
        let thumbnail = (payload?.thumbnail || '').trim();
        const query = (payload?.query || '').trim();

        if (!videoId) {
          if (query.length < 2) {
            return { success: false, error: 'Missing song query or videoId.' };
          }
          const { stdout } = await runLocalYtDlp(
            ['--dump-single-json', '--flat-playlist', '--no-warnings', `ytsearch5:${query}`],
            30000
          );
          const parsed = JSON.parse(stdout) as { entries?: Array<Record<string, unknown>>; id?: string };
          const rawEntries = Array.isArray(parsed?.entries)
            ? parsed.entries
            : parsed?.id
              ? [parsed as Record<string, unknown>]
              : [];
          const nonLive = rawEntries.filter(
            (e) => e && e.id && !e.is_live && e.live_status !== 'is_live'
          );
          const normal = nonLive.filter((e) => !e.duration || Number(e.duration) <= 900);
          const chosen = (normal.length > 0 ? normal : nonLive)[0];
          if (!chosen?.id) {
            return { success: false, error: `No external track found for "${query}".` };
          }
          videoId = String(chosen.id).trim();
          const parsedMeta = parseLocalArtistTitle(chosen);
          if (!title) title = parsedMeta.title;
          if (!artist) artist = parsedMeta.artist;
          if (!duration) duration = Math.round(Number(chosen.duration) || 0);
          if (!thumbnail) {
            thumbnail =
              (typeof chosen.thumbnail === 'string' && chosen.thumbnail) ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          }
        } else if (!title) {
          title = query || 'Untitled Track';
        }

        if (!artist) artist = 'Unknown Artist';
        if (!thumbnail) thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        const ffmpegAvailable = Boolean(
          resolveLocalBinary(['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'], '')
        );
        const outputTemplate = path.join(tempDir, `${tempId}.%(ext)s`);
        const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;

        const dlArgs = ffmpegAvailable
          ? [
              '--no-playlist',
              '--no-warnings',
              '--write-info-json',
              '-f',
              'bestaudio[ext=m4a]/bestaudio[abr<=160]/bestaudio/best',
              '-x',
              '--audio-format',
              'mp3',
              '--audio-quality',
              '128K',
              '--max-filesize',
              '50M',
              '-o',
              outputTemplate,
              targetUrl,
            ]
          : [
              '--no-playlist',
              '--no-warnings',
              '--write-info-json',
              '-f',
              'bestaudio[ext=m4a]/bestaudio/best',
              '--max-filesize',
              '50M',
              '-o',
              outputTemplate,
              targetUrl,
            ];

        await runLocalYtDlp(dlArgs, 180000);

        const files = await fs.promises.readdir(tempDir);
        const infoJsonFile = files.find((f) => f === `${tempId}.info.json`);
        if (infoJsonFile) {
          try {
            const infoRaw = await fs.promises.readFile(path.join(tempDir, infoJsonFile), 'utf-8');
            const info = JSON.parse(infoRaw) as Record<string, unknown>;
            const meta = parseLocalArtistTitle(info);
            if ((!artist || artist === 'Unknown Artist') && meta.artist && meta.artist !== 'Unknown Artist') {
              artist = meta.artist;
            }
            if ((!title || title === 'Untitled Track') && meta.title) {
              title = meta.title;
            }
            if (!duration && info.duration) {
              duration = Math.round(Number(info.duration) || 0);
            }
          } catch {
            // ignore metadata json parse failures
          }
        }

        const matchedFile =
          files.find((f) => f === `${tempId}.mp3`) ||
          files.find((f) => f === `${tempId}.m4a`) ||
          files.find((f) => f.startsWith(`${tempId}.`) && !f.endsWith('.json') && !f.endsWith('.part'));
        if (!matchedFile) {
          return { success: false, error: 'Local download finished but audio file was not found.' };
        }
        downloadedPath = path.join(tempDir, matchedFile);
        const ext = path.extname(matchedFile).toLowerCase() || '.mp3';
        const mimeType = ext === '.m4a' ? 'audio/mp4' : 'audio/mpeg';
        const audioBuffer = await fs.promises.readFile(downloadedPath);

        // Upload to play-server so it is saved permanently to Firebase Storage & Firestore for both Desktop and Web
        const uploadBase = (payload?.uploadBaseUrl || 'https://play-server-371330410186.africa-south1.run.app').replace(
          /\/+$/,
          ''
        );
        try {
          const form = new FormData();
          form.append('audio', new Blob([audioBuffer], { type: mimeType }), `track${ext}`);
          form.append('videoId', videoId);
          form.append('title', title);
          form.append('artist', artist);
          form.append('duration', String(duration));
          form.append('thumbnail', thumbnail);
          if (payload?.ownerId) form.append('ownerId', payload.ownerId);
          if (payload?.user) form.append('user', payload.user);
          form.append('location', payload?.location || 'TikTok LIVE');
          form.append('externalSource', 'youtube');

          const uploadRes = await net.fetch(`${uploadBase}/api/upload-external-song`, {
            method: 'POST',
            body: form,
          });
          if (uploadRes.ok) {
            const uploadedJson = (await uploadRes.json()) as { success?: boolean; data?: Record<string, unknown> };
            if (uploadedJson?.success && uploadedJson?.data?.audioUrl) {
              return { success: true, cached: false, data: uploadedJson.data };
            }
          }
        } catch (uploadErr) {
          console.warn('[LocalFetch] Cloud upload failed, using local:// playback fallback:', uploadErr);
        }

        // Offline/fallback: persist locally inside userData so Deck A/B plays it immediately via local://
        const persistentDir = path.join(app.getPath('userData'), 'fetched-songs');
        await fs.promises.mkdir(persistentDir, { recursive: true });
        const musicId = `local_yt_${videoId}_${Date.now()}`;
        const persistentPath = path.join(persistentDir, `${musicId}${ext}`);
        await fs.promises.copyFile(downloadedPath, persistentPath);
        const localUrl = `local://${persistentPath}`;

        return {
          success: true,
          cached: false,
          localFallback: true,
          data: {
            id: musicId,
            title,
            artist,
            albumArt: thumbnail,
            audioUrl: localUrl,
            url: localUrl,
            duration,
            ownerId: payload?.ownerId || '',
            externalSource: 'youtube',
            externalSourceId: `yt_${videoId}`,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'LOCAL_YTDLP_MISSING') {
          return { success: false, unavailable: true, error: 'yt-dlp is not installed locally.' };
        }
        return { success: false, error: msg || 'Local external song fetch failed.' };
      } finally {
        try {
          if (downloadedPath && fs.existsSync(downloadedPath)) {
            await fs.promises.unlink(downloadedPath);
          }
          const leftover = fs.existsSync(tempDir)
            ? (await fs.promises.readdir(tempDir)).filter((f) => f.startsWith(`${tempId}.`))
            : [];
          for (const f of leftover) {
            await fs.promises.unlink(path.join(tempDir, f)).catch(() => {});
          }
        } catch {
          // ignore cleanup errors
        }
      }
    }
  );

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
