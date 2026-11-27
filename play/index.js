// Import required modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fileUpload = require('express-fileupload');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { v4: uuidv4, v4: randomUUID } = require('uuid');
const CryptoJS = require('crypto-js');
const { parseBuffer } = require('music-metadata');

// Load environment variables
dotenv.config();

// Initialize Firebase Client SDK
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, getDocs, query, collection, where } = require('firebase/firestore');
const { getStorage, ref, uploadBytes, getDownloadURL } = require('firebase/storage');

const firebaseConfig = {
  apiKey: "AIzaSyC_YPbgewHXM_GtGYyQTI8I4rFQCWOqtn8",
  authDomain: "municipality-b179d.firebaseapp.com",
  projectId: "municipality-b179d",
  storageBucket: "municipality-b179d.appspot.com",
  messagingSenderId: "952540645244",
  appId: "1:952540645244:web:129d4269d2e120d3b246f9",
};

const firebaseApp = initializeApp(firebaseConfig);
const firestoreDb = getFirestore(firebaseApp);
const firebaseStorage = getStorage(firebaseApp);


const getSecretKeys = async () => {
  try {
    const querySnapshot = await getDocs(query(collection(firestoreDb, "secrets")));
    const data = querySnapshot.docs.map((doc) => doc.data());
    return data;
  } catch (e) {
    console.error(e);
    return [];
  }
};
// Initialize express app
const app = express();

// Define port
const PORT = process.env.PORT || 3500;

// Global in-memory cache for generated music pending user approval to save
const pendingSongs = new Map();

// Helper function to extract Chromaprint fingerprint using local fpcalc utility
const getFingerprint = (filePath) => {
  return new Promise((resolve, reject) => {
    exec(`fpcalc -json "${filePath}"`, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    });
  });
};

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploads directory statically for access to generated music
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  createParentPath: true,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  },
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: './uploads/'
}));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Simple route for testing
app.get('/', (_req, res) => {
  res.json({ message: 'Welcome to the Audio Fingerprinting Server!' });
});

// API routes
app.get('/api/hello', (_req, res) => {
  res.json({ message: 'Hello, World!' });
});

// Audio fingerprinting endpoint
app.post('/api/fingerprint', async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const audioFile = req.files.audio;

    // Check if the file is an audio file
    const allowedMimeTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/mp3', 'audio/x-m4a'];
    if (!allowedMimeTypes.includes(audioFile.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Only audio files are allowed.' });
    }

    // Generate a unique filename
    const fileName = `${uuidv4()}${path.extname(audioFile.name)}`;
    const filePath = path.join(uploadsDir, fileName);

    // Move the file to the uploads directory
    await audioFile.mv(filePath);

    // Execute fpcalc to generate the fingerprint
    exec(`fpcalc -json "${filePath}"`, (error, stdout, stderr) => {
      // Clean up the temporary file
      fs.unlink(filePath, (err) => {
        if (err) console.error(`Error deleting file: ${err}`);
      });

      if (error) {
        console.error(`Error executing fpcalc: ${error.message}`);

        // Run diagnostics to help troubleshoot the issue
        const diagnostics = {
          error: 'Failed to generate fingerprint',
          details: error.message,
          command: `fpcalc -json "${filePath}"`,
          errorCode: error.code,
          errorSignal: error.signal,
          path: filePath,
          os: process.platform,
          nodeVersion: process.version
        };

        // Try to get fpcalc version information
        try {
          const fpcalcVersionOutput = require('child_process').execSync('fpcalc -version').toString();
          diagnostics.fpcalcVersion = fpcalcVersionOutput.trim();
        } catch (versionError) {
          diagnostics.fpcalcVersionError = versionError.message;

          // Check if fpcalc is installed
          try {
            const fpcalcPath = require('child_process').execSync('which fpcalc').toString();
            diagnostics.fpcalcPath = fpcalcPath.trim();
          } catch (whichError) {
            diagnostics.fpcalcNotFound = true;
            diagnostics.error = 'Failed to generate fingerprint: fpcalc not found. Please make sure Chromaprint is installed.';
          }
        }

        console.error('Diagnostics:', JSON.stringify(diagnostics, null, 2));
        return res.status(500).json(diagnostics);
      }

      if (stderr) {
        console.error(`fpcalc stderr: ${stderr}`);
      }

      try {
        // Parse the JSON output from fpcalc
        const fingerprintData = JSON.parse(stdout);

        // Hash the fingerprint using CryptoJS
        const originalFingerprint = fingerprintData.fingerprint;

        // Create different hash formats
        const sha256Hash = CryptoJS.SHA256(originalFingerprint).toString();
        const md5Hash = CryptoJS.MD5(originalFingerprint).toString();

        // Create response object with hashed fingerprints
        const responseData = {
          ...fingerprintData,
          originalFingerprint: fingerprintData.fingerprint,
          fingerprint: sha256Hash, // Replace original with SHA-256 hash
          hashes: {
            sha256: sha256Hash,
            md5: md5Hash
          }
        };

        // Return the fingerprint data to the client
        return res.json({
          success: true,
          message: 'Fingerprint generated and hashed successfully',
          data: responseData
        });
      } catch (parseError) {
        console.error(`Error parsing fpcalc output: ${parseError.message}`);
        return res.status(500).json({ error: 'Failed to parse fingerprint data' });
      }
    });
  } catch (error) {
    console.error(`Server error: ${error.message}`);
    return res.status(500).json({ error: 'Server error' });
  }
});
// Music generation endpoint
app.post('/api/generate-music', async (req, res) => {
  try {
    const sanitizedUser = req.body.user;
    if (!sanitizedUser || typeof sanitizedUser !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(sanitizedUser)) {
      return res.status(400).json({
        error: 'Invalid or missing user parameter. Only alphanumeric characters, dashes, and underscores are allowed.'
      });
    }

    const prompt = req.body.prompt;
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({
        error: 'Invalid or missing prompt parameter.'
      });
    }

    const artistName = req.body.artistName ? req.body.artistName.trim() : '';
    const songTitle = req.body.songTitle ? req.body.songTitle.trim() : '';

    const secrets = await getSecretKeys();
    const apiKey = secrets?.[0]?.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server. Please verify your environment configuration.'
      });
    }

    console.log(`Sending music generation request for user "${sanitizedUser}" with prompt: "${prompt}"`);

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        model: 'lyria-3-pro-preview',
        input: prompt,
        response_format: {
          type: 'audio'
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Google API error response (Status ${response.status}): ${errorText}`);
      return res.status(response.status).json({
        error: `Google API returned status ${response.status}`,
        details: errorText
      });
    }

    const responseJson = await response.json();
    let audioBase64 = null;
    let lyricsArray = [];

    if (responseJson.steps && Array.isArray(responseJson.steps)) {
      for (const step of responseJson.steps) {
        if (step.type === 'model_output' && step.content && Array.isArray(step.content)) {
          for (const contentBlock of step.content) {
            if (contentBlock.type === 'audio' && contentBlock.data) {
              audioBase64 = contentBlock.data;
            } else if (contentBlock.type === 'text' && contentBlock.text) {
              lyricsArray.push(contentBlock.text);
            }
          }
        }
      }
    }

    if (!audioBase64) {
      return res.status(502).json({
        error: 'No audio data returned from Google API response.',
        response: responseJson
      });
    }

    const lyrics = lyricsArray.join('\n\n').trim();
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const userMusicDir = path.join(__dirname, 'uploads', 'music', sanitizedUser);

    // Create target directory if it does not exist
    if (!fs.existsSync(userMusicDir)) {
      fs.mkdirSync(userMusicDir, { recursive: true });
    }

    const songId = uuidv4();
    const fileName = `tmp_${songId}.mp3`;
    const filePath = path.join(userMusicDir, fileName);

    fs.writeFileSync(filePath, audioBuffer);
    console.log(`Saved temporary generated music to: ${filePath}`);

    // Store in global pendingSongs Map
    pendingSongs.set(songId, {
      id: songId,
      user: sanitizedUser,
      artistName: artistName || 'Unknown Artist',
      songTitle: songTitle || 'Untitled Track',
      prompt: prompt,
      lyrics: lyrics,
      tempPath: filePath,
      relativePath: `uploads/music/${sanitizedUser}/${fileName}`,
      sizeBytes: audioBuffer.length
    });

    return res.json({
      success: true,
      message: 'Music generated successfully. Ready to listen and save.',
      data: {
        id: songId,
        artistName: artistName || 'Unknown Artist',
        songTitle: songTitle || 'Untitled Track',
        lyrics: lyrics,
        relativePath: `uploads/music/${sanitizedUser}/${fileName}`,
        sizeBytes: audioBuffer.length
      }
    });

  } catch (error) {
    console.error(`Music generation endpoint error: ${error.message}`);
    return res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

// Save music endpoint
app.post('/api/save-music', async (req, res) => {
  try {
    const { id, location, ownerId: requestOwnerId } = req.body;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid song ID parameter.' });
    }

    const song = pendingSongs.get(id);
    if (!song) {
      return res.status(404).json({ error: 'Song not found or has expired.' });
    }

    console.log('====================================');
    console.log('SAVING SONG REQUESTED BY USER:');
    console.log(`ID:            ${song.id}`);
    console.log(`User:          ${song.user}`);
    console.log(`Artist Name:   ${song.artistName}`);
    console.log(`Song Title:    ${song.songTitle}`);
    console.log(`Prompt:        ${song.prompt}`);
    console.log(`Lyrics:        \n${song.lyrics}`);
    console.log(`Temp Path:     ${song.tempPath}`);
    console.log('====================================');

    // Verify temp file exists before proceeding
    if (!fs.existsSync(song.tempPath)) {
      return res.status(410).json({ error: 'Temporary audio file has already been deleted or does not exist.' });
    }

    // 1. Parse MP3 duration from buffer (no fingerprinting needed for AI-generated music)
    let trackDurationSeconds = 0;
    try {
      const audioBuffer = fs.readFileSync(song.tempPath);
      const metadata = await parseBuffer(audioBuffer, 'audio/mpeg');
      trackDurationSeconds = Math.round(metadata.format.duration || 0);
      console.log(`Parsed audio duration: ${trackDurationSeconds}s`);
    } catch (metaErr) {
      console.warn(`Could not parse audio duration: ${metaErr.message}`);
    }
    const fingerprintData = randomUUID();

    // 2. Generate final IDs and file names
    const musicId = `music_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const sanitizeFilename = (name) => {
      return name.replace(/[^a-zA-Z0-9\s._-]/g, '').trim();
    };
    const cleanArtist = sanitizeFilename(song.artistName) || 'Unknown Artist';
    const cleanTitle = sanitizeFilename(song.songTitle) || 'Untitled Track';
    const finalFileName = `${cleanArtist} - ${cleanTitle}.mp3`;

    // 3. Upload file to Firebase Storage
    const storagePath = `music/${song.user}/${musicId}_audio.mp3`;
    const storageRef = ref(firebaseStorage, storagePath);

    console.log(`Uploading file to Firebase Storage: ${storagePath}`);
    const audioBuffer = fs.readFileSync(song.tempPath);
    await uploadBytes(storageRef, audioBuffer, {
      contentType: 'audio/mpeg'
    });

    const audioUrl = await getDownloadURL(storageRef);
    console.log(`Uploaded to Storage. URL: ${audioUrl}`);

    // 4. Save metadata documents to Firestore
    const currentLoc = location || 'Unknown';
    // Use explicit ownerId (Firebase user UID) if provided, otherwise fall back to song.user
    const firestoreOwnerId = (requestOwnerId && typeof requestOwnerId === 'string' && requestOwnerId.trim())
      ? requestOwnerId.trim()
      : song.user;
    const musicData = {
      id: musicId,
      title: song.songTitle,
      artist: song.artistName,
      active: true,
      genres: "AI",
      albumArt: 'https://mrdocs.empiredigitals.org/playIcon.png',
      audioUrl: audioUrl,
      url: audioUrl,
      duration: trackDurationSeconds,
      ownerId: firestoreOwnerId,
      uploadDate: new Date().toISOString(),
      playCount: 0,
      fileName: finalFileName,
      currentBid: 0,
      fingerprint: fingerprintData,
      titleLowerCase: song.songTitle.toLowerCase(),
      artistLowerCase: song.artistName.toLowerCase(),
      albumLowerCase: '',
      location: currentLoc
    };

    console.log(`Writing documents to Firestore collection 'music' and 'tracks' for ID: ${musicId}`);

    // Save to Firestore collections in parallel
    const writeMusicPromise = setDoc(doc(firestoreDb, 'music', musicId), musicData);

    const trackData = {
      ...musicData,
      ownerId: '',
      freePlays: 0,
      premiumPlays: 0,
      creditPlays: 0,
      creditPlaysClaimed: 0
    };
    const writeTracksPromise = setDoc(doc(firestoreDb, 'tracks', musicId), trackData);

    await Promise.all([writeMusicPromise, writeTracksPromise]);
    console.log('Successfully saved documents to Firestore.');

    // 5. Clean up temporary local file & in-memory cache
    fs.unlink(song.tempPath, (err) => {
      if (err) console.error(`Error deleting local temp file: ${err.message}`);
    });
    pendingSongs.delete(id);

    return res.json({
      success: true,
      message: 'Song saved to Firebase successfully.',
      data: {
        id: musicId,
        fileName: finalFileName,
        audioUrl: audioUrl
      }
    });

  } catch (error) {
    console.error(`Save music endpoint error: ${error.message}`);
    return res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

// ============================================================================
// External Song Search & Auto-Import to Firebase (YouTube via yt-dlp + ffmpeg)
// ============================================================================

const inFlightSongFetches = new Map();

function resolveBinary(envVar, candidates, fallback) {
  if (process.env[envVar] && fs.existsSync(process.env[envVar])) {
    return process.env[envVar];
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return fallback;
}

const YTDLP_BIN = resolveBinary(
  'YTDLP_PATH',
  ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'],
  'yt-dlp'
);

const FFMPEG_BIN = resolveBinary(
  'FFMPEG_PATH',
  ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'],
  ''
);

const WRITABLE_COOKIES_PATH = path.join(os.tmpdir(), 'ytdlp-cookies.txt');
const GCS_COOKIES_OBJECT_NAME = 'ytdlp-cookies.json';
let seededCookiesSourceHash = null;
let lastPersistedCookiesHash = null;
let cookieJobChain = Promise.resolve();
let cachedGcpAccessToken = null;
let cachedGcpAccessTokenExpiry = 0;

function hasRealCookieEntries(content) {
  return String(content || '')
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('#');
    });
}

function getCookiesStateBucket() {
  return (process.env.YTDLP_COOKIES_STATE_BUCKET || '').trim();
}

function getYtDlpProxyUrl() {
  return (process.env.YTDLP_PROXY || '').trim();
}

function readConfiguredSourceCookies() {
  const cookiesB64 = (process.env.YTDLP_COOKIES_B64 || '').trim();
  if (cookiesB64) {
    try {
      const decoded = Buffer.from(cookiesB64, 'base64').toString('utf8');
      if (hasRealCookieEntries(decoded)) {
        return { mode: 'file', content: decoded };
      }
    } catch (err) {
      console.warn('[yt-dlp] Failed to decode YTDLP_COOKIES_B64:', err.message);
    }
  }

  const cookieFile = (process.env.YTDLP_COOKIES_FILE || '').trim();
  if (cookieFile) {
    try {
      if (fs.existsSync(cookieFile)) {
        const content = fs.readFileSync(cookieFile, 'utf8');
        if (hasRealCookieEntries(content)) {
          return { mode: 'file', content };
        }
      }
    } catch (err) {
      console.warn(`[yt-dlp] Failed to read YTDLP_COOKIES_FILE (${cookieFile}):`, err.message);
    }
  }

  const cookieBrowser = (process.env.YTDLP_COOKIES_FROM_BROWSER || '').trim();
  if (cookieBrowser) {
    return { mode: 'browser', browser: cookieBrowser };
  }

  return { mode: 'none' };
}

function hasYtDlpCookiesConfigured() {
  return readConfiguredSourceCookies().mode !== 'none';
}

async function getGcpAccessToken() {
  if (cachedGcpAccessToken && Date.now() < cachedGcpAccessTokenExpiry) {
    return cachedGcpAccessToken;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.access_token) return null;
    cachedGcpAccessToken = data.access_token;
    cachedGcpAccessTokenExpiry = Date.now() + Math.max(60, Number(data.expires_in || 300) - 90) * 1000;
    return cachedGcpAccessToken;
  } catch {
    return null;
  }
}

async function loadPersistedCookiesFromGcs(expectedSourceHash) {
  const bucket = getCookiesStateBucket();
  if (!bucket) return null;
  const token = await getGcpAccessToken();
  if (!token) return null;

  try {
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(GCS_COOKIES_OBJECT_NAME)}?alt=media`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (
      payload &&
      payload.sourceHash === expectedSourceHash &&
      typeof payload.cookies === 'string' &&
      hasRealCookieEntries(payload.cookies)
    ) {
      return payload.cookies;
    }
  } catch (err) {
    console.warn('[yt-dlp] Could not load persisted cookies from GCS:', err.message);
  }
  return null;
}

async function savePersistedCookiesToGcs(sourceHash, cookiesContent) {
  const bucket = getCookiesStateBucket();
  if (!bucket || !sourceHash || !hasRealCookieEntries(cookiesContent)) return;
  const contentHash = CryptoJS.SHA256(cookiesContent).toString();
  if (contentHash === lastPersistedCookiesHash) return;

  const token = await getGcpAccessToken();
  if (!token) return;

  try {
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(GCS_COOKIES_OBJECT_NAME)}`;
    const body = JSON.stringify({
      sourceHash,
      cookies: cookiesContent,
      updatedAt: new Date().toISOString(),
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    if (res.ok) {
      lastPersistedCookiesHash = contentHash;
      console.log('[yt-dlp] Persisted rotated cookies to GCS state bucket');
    } else {
      console.warn(`[yt-dlp] Failed to persist rotated cookies to GCS (HTTP ${res.status})`);
    }
  } catch (err) {
    console.warn('[yt-dlp] Error persisting rotated cookies to GCS:', err.message);
  }
}

// Seed /tmp/ytdlp-cookies.txt ONCE per secret version, restoring rotated cookies from GCS across Cloud Run cold starts
async function prepareWritableCookiesArgs() {
  const configured = readConfiguredSourceCookies();
  if (configured.mode === 'browser') {
    return { args: ['--cookies-from-browser', configured.browser], sourceHash: null };
  }
  if (configured.mode !== 'file') {
    return { args: [], sourceHash: null };
  }

  const sourceHash = CryptoJS.SHA256(
    `${process.env.YTDLP_COOKIES_UPDATED_AT || ''}:${configured.content}`
  ).toString();

  if (seededCookiesSourceHash !== sourceHash || !fs.existsSync(WRITABLE_COOKIES_PATH)) {
    const restoredFromGcs = await loadPersistedCookiesFromGcs(sourceHash);
    const activeCookies = restoredFromGcs || configured.content;
    fs.writeFileSync(WRITABLE_COOKIES_PATH, activeCookies, { mode: 0o600 });
    seededCookiesSourceHash = sourceHash;
    lastPersistedCookiesHash = CryptoJS.SHA256(activeCookies).toString();
    console.log(
      restoredFromGcs
        ? '[yt-dlp] Restored rotated cookies from GCS state bucket into /tmp'
        : '[yt-dlp] Seeded writable cookies file in /tmp from Secret Manager'
    );
  }

  return { args: ['--cookies', WRITABLE_COOKIES_PATH], sourceHash };
}

function isYouTubeBotError(err) {
  const msg = String(err?.message || err || '');
  return /sign in to confirm you.?re not a bot|login_required|use --cookies-from-browser or --cookies/i.test(
    msg
  );
}

function formatFetchSongError(err) {
  const msg = String(err?.message || err || 'Failed to fetch and save external song.');
  if (isYouTubeBotError(msg)) {
    return 'YouTube rejected the cloud server session (expired cookies on datacenter IP). Please refresh YouTube cookies from a fresh Incognito window using ./play/upload-cookies.sh, or configure YTDLP_PROXY on play-server.';
  }
  return msg;
}

async function execYtDlpOnce(args, timeoutMs, options = {}) {
  const proxyUrl = getYtDlpProxyUrl();
  const skipCookiesForProxy = Boolean(proxyUrl) && process.env.YTDLP_USE_COOKIES_WITH_PROXY !== 'true';
  const shouldUseCookies = options.useCookies !== false && !skipCookiesForProxy;

  let cookieArgs = [];
  let activeSourceHash = null;
  if (shouldUseCookies) {
    const prepared = await prepareWritableCookiesArgs();
    cookieArgs = prepared.args;
    activeSourceHash = prepared.sourceHash;
  }

  const proxyArgs = proxyUrl && options.useProxy !== false ? ['--proxy', proxyUrl] : [];
  const finalArgs = [
    '--force-ipv4',
    '--js-runtimes',
    'deno',
    '--js-runtimes',
    'node',
    '--remote-components',
    'ejs:github',
    ...proxyArgs,
    ...cookieArgs,
    ...args,
  ];
  if (FFMPEG_BIN) {
    finalArgs.unshift('--ffmpeg-location', path.dirname(FFMPEG_BIN));
  }

  const result = await new Promise((resolve, reject) => {
    execFile(
      YTDLP_BIN,
      finalArgs,
      {
        timeout: timeoutMs,
        maxBuffer: 15 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          if (error.code === 'ENOENT') {
            return reject(
              new Error(
                'yt-dlp is not installed on play-server. Install it with "brew install yt-dlp" (macOS) or rebuild the Docker image.'
              )
            );
          }
          if (error.killed || error.signal === 'SIGTERM') {
            return reject(
              new Error(`yt-dlp timed out after ${Math.round(timeoutMs / 1000)}s while downloading audio.`)
            );
          }
          const stderrLines = (stderr || '').trim().split('\n').filter(Boolean);
          const stdoutLines = (stdout || '').trim().split('\n').filter(Boolean);
          if (stderrLines.length > 0) {
            console.error('[yt-dlp stderr]\n' + stderrLines.join('\n'));
          }
          const detail =
            stderrLines.slice(-5).join(' | ') ||
            stdoutLines.slice(-3).join(' | ') ||
            error.message;
          return reject(new Error(detail || 'yt-dlp failed'));
        }
        resolve({ stdout, stderr });
      }
    );
  });

  // Persist rotated cookies after a successful cookie-backed yt-dlp call so Cloud Run restarts keep them
  if (activeSourceHash && fs.existsSync(WRITABLE_COOKIES_PATH)) {
    try {
      const updatedCookies = fs.readFileSync(WRITABLE_COOKIES_PATH, 'utf8');
      await savePersistedCookiesToGcs(activeSourceHash, updatedCookies);
    } catch (persistErr) {
      console.warn('[yt-dlp] Could not read updated cookies for persistence:', persistErr.message);
    }
  }

  return result;
}

function runYtDlp(args, timeoutMs = 120000, options = {}) {
  const useCookies = options.useCookies !== false;
  if (!useCookies) {
    return execYtDlpOnce(args, timeoutMs, options);
  }
  // Serialize cookie-backed yt-dlp calls so concurrent downloads never race-write /tmp/ytdlp-cookies.txt
  const nextJob = cookieJobChain.then(
    () => execYtDlpOnce(args, timeoutMs, options),
    () => execYtDlpOnce(args, timeoutMs, options)
  );
  cookieJobChain = nextJob.catch(() => {});
  return nextJob;
}

function cleanVideoTitle(raw) {
  return (raw || '')
    .replace(/\s*[\(\[]\s*(?:official\s*)?(?:music\s*)?(?:video|audio|lyric(?:s)?|hd|hq|4k|visualizer|mv|full\s*song|explicit|clean|remastered)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*\|\s*official.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanChannelName(channel) {
  return (channel || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*VEVO$/i, '')
    .replace(/\s*Official$/i, '')
    .trim();
}

function parseArtistAndTitle(entry) {
  const rawTitle = String(entry?.title || '').trim();
  const cleaned = cleanVideoTitle(rawTitle) || rawTitle || 'Untitled Track';
  const fallbackArtist =
    String(entry?.artist || entry?.creator || '').trim() ||
    cleanChannelName(entry?.channel || entry?.uploader || '') ||
    'Unknown Artist';

  const separatorMatch = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (separatorMatch && separatorMatch[1].length <= 60 && separatorMatch[2].length >= 2) {
    return {
      artist: separatorMatch[1].trim(),
      title: separatorMatch[2].trim(),
    };
  }

  return {
    artist: fallbackArtist,
    title: cleaned,
  };
}

function pickThumbnail(entry) {
  if (entry?.thumbnail && typeof entry.thumbnail === 'string') {
    return entry.thumbnail;
  }
  if (Array.isArray(entry?.thumbnails) && entry.thumbnails.length > 0) {
    const valid = entry.thumbnails.filter((t) => t && t.url);
    if (valid.length > 0) {
      return valid[valid.length - 1].url;
    }
  }
  if (entry?.id) {
    return `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`;
  }
  return 'https://mrdocs.empiredigitals.org/playIcon.png';
}

function formatSearchEntry(entry) {
  const videoId = String(entry?.id || '').trim();
  const { artist, title } = parseArtistAndTitle(entry);
  return {
    videoId,
    title,
    artist,
    rawTitle: String(entry?.title || title),
    duration: Math.round(Number(entry?.duration) || 0),
    thumbnail: pickThumbnail(entry),
    webpageUrl: entry?.webpage_url || entry?.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''),
  };
}

async function searchYouTubeTracks(searchQuery, limit = 5) {
  const safeLimit = Math.max(1, Math.min(8, Number(limit) || 5));
  // Metadata flat-playlist search does not require YouTube cookies; skipping avoids unnecessary cookie rotation
  const { stdout } = await runYtDlp(
    ['--dump-single-json', '--flat-playlist', '--no-warnings', `ytsearch${safeLimit}:${searchQuery}`],
    30000,
    { useCookies: false }
  );

  const parsed = JSON.parse(stdout);
  const rawEntries = Array.isArray(parsed?.entries) ? parsed.entries : parsed?.id ? [parsed] : [];

  const nonLive = rawEntries.filter(
    (e) => e && e.id && !e.is_live && e.live_status !== 'is_live'
  );
  // Prefer normal song lengths (<= 15 min) over long DJ mixes
  const normalLength = nonLive.filter((e) => !e.duration || Number(e.duration) <= 900);
  const chosen = normalLength.length > 0 ? normalLength : nonLive;

  return chosen.map(formatSearchEntry);
}

async function findExistingFirebaseSong(externalSourceId, firestoreOwnerId) {
  try {
    const musicSnap = await getDocs(
      query(collection(firestoreDb, 'music'), where('externalSourceId', '==', externalSourceId))
    );
    const docs = musicSnap.docs.map((d) => d.data());
    const ownerMatch = docs.find((d) => d && d.ownerId === firestoreOwnerId && (d.audioUrl || d.url));
    if (ownerMatch) {
      return { ownerMatch, sharedTrack: ownerMatch };
    }
    const anyMusicMatch = docs.find((d) => d && (d.audioUrl || d.url));
    if (anyMusicMatch) {
      return { ownerMatch: null, sharedTrack: anyMusicMatch };
    }

    const trackSnap = await getDocs(
      query(collection(firestoreDb, 'tracks'), where('externalSourceId', '==', externalSourceId))
    );
    const sharedTrack = trackSnap.docs
      .map((d) => d.data())
      .find((d) => d && (d.audioUrl || d.url));

    return { ownerMatch: null, sharedTrack: sharedTrack || null };
  } catch (err) {
    console.warn(`Firestore cache lookup skipped: ${err.message}`);
    return { ownerMatch: null, sharedTrack: null };
  }
}

// Fast external song search endpoint (returns metadata candidates without downloading audio yet)
app.post('/api/search-song', async (req, res) => {
  try {
    const rawQuery = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (rawQuery.length < 2 || rawQuery.length > 160) {
      return res.status(400).json({
        success: false,
        error: 'Provide a search query between 2 and 160 characters.',
      });
    }

    const limit = Math.max(1, Math.min(8, Number(req.body?.limit) || 5));
    console.log(`🔎 External song search: "${rawQuery}" (limit=${limit})`);

    const results = await searchYouTubeTracks(rawQuery, limit);
    return res.json({
      success: true,
      query: rawQuery,
      results,
    });
  } catch (error) {
    console.error(`Search song endpoint error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to search songs externally.',
    });
  }
});

async function fetchYouTubeOEmbedMetadata(videoId) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(oembedUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.title) return null;
    return formatSearchEntry({
      id: videoId,
      title: data.title,
      channel: data.author_name || '',
      thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0,
      webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  } catch {
    return null;
  }
}

function tokenizeMatchText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !/^(official|video|audio|lyrics|hd|hq|ft|feat|remix|the|and)$/.test(w));
}

async function findMatchingSoundCloudTrack(artist, title) {
  const searchTerms = [artist, title]
    .filter((s) => s && !/^unknown artist$/i.test(s.trim()))
    .join(' ')
    .trim();
  if (searchTerms.length < 3) return null;

  try {
    const { stdout } = await runYtDlp(
      ['--dump-single-json', '--flat-playlist', '--no-warnings', `scsearch5:${searchTerms}`],
      25000,
      { useCookies: false }
    );
    const parsed = JSON.parse(stdout);
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const expectedTokens = Array.from(new Set(tokenizeMatchText(`${artist} ${title}`)));
    if (expectedTokens.length === 0) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const entry of entries) {
      const url = entry?.webpage_url || entry?.url || '';
      const duration = Math.round(Number(entry?.duration) || 0);
      // Skip 30-second Go+ previews and ultra-long DJ sets
      if (!url || (duration > 0 && (duration < 60 || duration > 900))) continue;

      const candidateText = `${entry?.title || ''} ${entry?.uploader || ''} ${entry?.channel || ''}`;
      const candidateTokens = new Set(tokenizeMatchText(candidateText));
      const matchedCount = expectedTokens.filter((t) => candidateTokens.has(t)).length;
      const ratio = matchedCount / expectedTokens.length;
      const minNeeded = expectedTokens.length >= 2 ? 2 : 1;

      if (matchedCount >= minNeeded && ratio >= 0.65 && ratio > bestScore) {
        bestScore = ratio;
        bestMatch = {
          url,
          duration,
          title: entry?.title || title,
        };
      }
    }

    return bestMatch;
  } catch (err) {
    console.warn('[SoundCloud fallback] Search failed:', err.message);
    return null;
  }
}

async function downloadAudioToTemp({ candidate, outputTemplate }) {
  const targetUrl = `https://www.youtube.com/watch?v=${candidate.videoId}`;
  const commonDownloadArgs = [
    '--no-playlist',
    '-f',
    'bestaudio[ext=m4a]/bestaudio[abr<=160]/bestaudio/best',
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '128K',
    '--max-filesize',
    '60M',
    '--retries',
    '3',
    '--fragment-retries',
    '3',
    '--socket-timeout',
    '25',
    '-o',
    outputTemplate,
  ];

  // 1. Primary YouTube download (uses persisted cookies or YTDLP_PROXY if configured)
  try {
    await runYtDlp([...commonDownloadArgs, targetUrl], 220000);
    return { source: 'youtube' };
  } catch (primaryErr) {
    if (!isYouTubeBotError(primaryErr)) {
      throw primaryErr;
    }

    console.warn(
      `⚠️ YouTube bot/cookie wall hit for ${candidate.videoId}. Trying cookie-free alternate clients...`
    );

    // 2. Quick cookie-free retry with alternate YouTube clients (recovers if only the cookie expired)
    try {
      await runYtDlp(
        [
          '--extractor-args',
          'youtube:player_client=tv,android_vr,mweb',
          ...commonDownloadArgs,
          targetUrl,
        ],
        90000,
        { useCookies: false }
      );
      return { source: 'youtube' };
    } catch (altClientErr) {
      console.warn(`⚠️ Alternate YouTube clients also blocked: ${altClientErr.message}`);
    }

    // 3. Verified SoundCloud fallback (no cookies required, not blocked on Cloud Run IPs)
    const scMatch = await findMatchingSoundCloudTrack(candidate.artist, candidate.title);
    if (scMatch) {
      console.log(`🎵 Falling back to SoundCloud match: "${scMatch.title}" (${scMatch.url})`);
      await runYtDlp([...commonDownloadArgs, scMatch.url], 150000, { useCookies: false });
      return { source: 'soundcloud' };
    }

    throw primaryErr;
  }
}

// Search/fetch audio via yt-dlp + ffmpeg, upload to Firebase Storage, save to Firestore, and return PlayMyJam song URL
app.post('/api/fetch-song', async (req, res) => {
  try {
    const rawQuery = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const rawVideoId = typeof req.body?.videoId === 'string' ? req.body.videoId.trim() : '';
    const providedTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const providedArtist = typeof req.body?.artist === 'string' ? req.body.artist.trim() : '';
    const providedThumbnail = typeof req.body?.thumbnail === 'string' ? req.body.thumbnail.trim() : '';
    const providedDuration = Math.max(0, Math.round(Number(req.body?.duration) || 0));

    if (!rawQuery && !rawVideoId) {
      return res.status(400).json({
        success: false,
        error: 'Provide either "query" or "videoId".',
      });
    }

    if (rawVideoId && !/^[a-zA-Z0-9_-]{6,20}$/.test(rawVideoId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid videoId format.',
      });
    }

    const sanitizedUser =
      typeof req.body?.user === 'string' && req.body.user.trim()
        ? req.body.user.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
        : 'external_search';

    const firestoreOwnerId =
      typeof req.body?.ownerId === 'string' && req.body.ownerId.trim()
        ? req.body.ownerId.trim()
        : sanitizedUser;

    const location =
      typeof req.body?.location === 'string' && req.body.location.trim()
        ? req.body.location.trim()
        : 'Unknown';

    const dedupeKey = `${firestoreOwnerId}:${rawVideoId || rawQuery.toLowerCase()}`;
    if (inFlightSongFetches.has(dedupeKey)) {
      console.log(`⏳ Joining in-flight fetch for "${dedupeKey}"`);
      const existingResult = await inFlightSongFetches.get(dedupeKey);
      return res.json(existingResult);
    }

    const fetchPromise = (async () => {
      const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9\s._-]/g, '').trim();

      const buildOrCloneCachedResponse = async (candidate, externalSourceId) => {
        const cleanArtist = sanitizeFilename(candidate.artist) || 'Unknown Artist';
        const cleanTitle = sanitizeFilename(candidate.title) || 'Untitled Track';
        const finalFileName = `${cleanArtist} - ${cleanTitle}.mp3`;

        const { ownerMatch, sharedTrack } = await findExistingFirebaseSong(
          externalSourceId,
          firestoreOwnerId
        );

        if (ownerMatch) {
          console.log(`⚡ Reusing existing Firebase song for owner ${firestoreOwnerId}: ${ownerMatch.title}`);
          return {
            success: true,
            cached: true,
            message: 'Song already exists in your PlayMyJam library.',
            data: ownerMatch,
          };
        }

        if (sharedTrack && (sharedTrack.audioUrl || sharedTrack.url)) {
          const musicId = `music_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const audioUrl = sharedTrack.audioUrl || sharedTrack.url;
          const musicData = {
            id: musicId,
            title: sharedTrack.title || candidate.title || 'Untitled Track',
            artist: sharedTrack.artist || candidate.artist || 'Unknown Artist',
            active: true,
            genres: sharedTrack.genres || 'External',
            albumArt: sharedTrack.albumArt || candidate.thumbnail || 'https://mrdocs.empiredigitals.org/playIcon.png',
            audioUrl,
            url: audioUrl,
            duration: Number(sharedTrack.duration) || candidate.duration || 0,
            ownerId: firestoreOwnerId,
            uploadDate: new Date().toISOString(),
            playCount: 0,
            fileName: sharedTrack.fileName || finalFileName,
            currentBid: 0,
            fingerprint: sharedTrack.fingerprint || randomUUID(),
            titleLowerCase: (sharedTrack.title || candidate.title || 'Untitled Track').toLowerCase(),
            artistLowerCase: (sharedTrack.artist || candidate.artist || 'Unknown Artist').toLowerCase(),
            albumLowerCase: '',
            location,
            externalSource: sharedTrack.externalSource || 'youtube',
            externalSourceId,
          };

          await setDoc(doc(firestoreDb, 'music', musicId), musicData);
          console.log(`⚡ Cloned existing Firebase Storage track into DJ library: ${musicData.artist} - ${musicData.title}`);
          return {
            success: true,
            cached: true,
            message: 'Song added from PlayMyJam Firebase cache.',
            data: musicData,
          };
        }

        return null;
      };

      // 0. Cache-first shortcut for explicit videoId BEFORE making any YouTube request!
      if (rawVideoId) {
        const quickCached = await buildOrCloneCachedResponse(
          {
            videoId: rawVideoId,
            title: providedTitle || rawQuery || 'Untitled Track',
            artist: providedArtist || 'Unknown Artist',
            duration: providedDuration,
            thumbnail: providedThumbnail || `https://i.ytimg.com/vi/${rawVideoId}/hqdefault.jpg`,
          },
          `yt_${rawVideoId}`
        );
        if (quickCached) {
          return quickCached;
        }
      }

      // 1. Resolve candidate track(s) metadata without burning an extra cookie-backed YouTube request
      let candidateList = [];
      if (rawVideoId) {
        if (providedTitle) {
          candidateList = [
            {
              videoId: rawVideoId,
              title: providedTitle,
              artist: providedArtist || 'Unknown Artist',
              rawTitle: providedTitle,
              duration: providedDuration,
              thumbnail: providedThumbnail || `https://i.ytimg.com/vi/${rawVideoId}/hqdefault.jpg`,
              webpageUrl: `https://www.youtube.com/watch?v=${rawVideoId}`,
            },
          ];
        } else {
          const oembedCandidate = await fetchYouTubeOEmbedMetadata(rawVideoId);
          if (oembedCandidate) {
            candidateList = [oembedCandidate];
          } else {
            const { stdout } = await runYtDlp(
              ['--dump-single-json', '--no-playlist', '--no-warnings', `https://www.youtube.com/watch?v=${rawVideoId}`],
              45000
            );
            candidateList = [formatSearchEntry(JSON.parse(stdout))];
          }
        }
      } else {
        const candidates = await searchYouTubeTracks(rawQuery, 5);
        if (!candidates.length) {
          const notFoundErr = new Error(`No external audio found for "${rawQuery}".`);
          notFoundErr.statusCode = 404;
          throw notFoundErr;
        }
        candidateList = candidates.slice(0, 3);
      }

      const fetchedDir = path.join(os.tmpdir(), 'play-server-fetched');
      if (!fs.existsSync(fetchedDir)) {
        fs.mkdirSync(fetchedDir, { recursive: true });
      }

      let lastAttemptError = null;

      for (const candidate of candidateList) {
        const externalSourceId = `yt_${candidate.videoId}`;
        const cleanArtist = sanitizeFilename(candidate.artist) || 'Unknown Artist';
        const cleanTitle = sanitizeFilename(candidate.title) || 'Untitled Track';
        const finalFileName = `${cleanArtist} - ${cleanTitle}.mp3`;

        // 2. Check if already stored in Firebase (instant reuse for query-based imports)
        if (!rawVideoId) {
          const cachedResponse = await buildOrCloneCachedResponse(candidate, externalSourceId);
          if (cachedResponse) {
            return cachedResponse;
          }
        }

        // 3. Download MP3 audio via yt-dlp + ffmpeg into OS temp dir (avoids nodemon restarts in dev)
        const tempId = uuidv4();
        const outputTemplate = path.join(fetchedDir, `${tempId}.%(ext)s`);
        const expectedMp3Path = path.join(fetchedDir, `${tempId}.mp3`);
        const targetUrl = `https://www.youtube.com/watch?v=${candidate.videoId}`;

        console.log(`⬇️ Fetching external audio: ${candidate.artist} - ${candidate.title} (${targetUrl})`);

        try {
          const downloadOutcome = await downloadAudioToTemp({ candidate, outputTemplate });

          let downloadedPath = expectedMp3Path;
          if (!fs.existsSync(downloadedPath)) {
            const matchFile = fs
              .readdirSync(fetchedDir)
              .find((f) => f.startsWith(`${tempId}.`));
            if (!matchFile) {
              throw new Error('Audio download completed but MP3 output file was not found.');
            }
            downloadedPath = path.join(fetchedDir, matchFile);
          }

          const audioBuffer = fs.readFileSync(downloadedPath);

          // 4. Parse actual duration & optional Chromaprint fingerprint
          let trackDurationSeconds = candidate.duration || 0;
          try {
            const metadata = await parseBuffer(audioBuffer, 'audio/mpeg');
            if (metadata?.format?.duration) {
              trackDurationSeconds = Math.round(metadata.format.duration);
            }
          } catch (metaErr) {
            console.warn(`Could not parse fetched MP3 duration: ${metaErr.message}`);
          }

          let fingerprintHash = randomUUID();
          try {
            const fp = await getFingerprint(downloadedPath);
            if (fp?.fingerprint) {
              fingerprintHash = CryptoJS.SHA256(fp.fingerprint).toString();
            }
          } catch (fpErr) {
            console.warn(`Skipping Chromaprint for fetched track: ${fpErr.message}`);
          }

          // 5. Upload MP3 to Firebase Storage
          const musicId = `music_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const storagePath = `music/${sanitizedUser}/${musicId}_audio.mp3`;
          const storageRef = ref(firebaseStorage, storagePath);

          console.log(`☁️ Uploading fetched MP3 to Firebase Storage: ${storagePath}`);
          await uploadBytes(storageRef, audioBuffer, {
            contentType: 'audio/mpeg',
          });

          const audioUrl = await getDownloadURL(storageRef);
          console.log(`✅ Uploaded to Firebase Storage: ${audioUrl}`);

          // 6. Save metadata to Firestore 'music' and 'tracks' collections (matching /api/save-music schema)
          const musicData = {
            id: musicId,
            title: candidate.title,
            artist: candidate.artist,
            active: true,
            genres: 'External',
            albumArt: candidate.thumbnail || 'https://mrdocs.empiredigitals.org/playIcon.png',
            audioUrl,
            url: audioUrl,
            duration: trackDurationSeconds,
            ownerId: firestoreOwnerId,
            uploadDate: new Date().toISOString(),
            playCount: 0,
            fileName: finalFileName,
            currentBid: 0,
            fingerprint: fingerprintHash,
            titleLowerCase: candidate.title.toLowerCase(),
            artistLowerCase: candidate.artist.toLowerCase(),
            albumLowerCase: '',
            location,
            externalSource: downloadOutcome.source || 'youtube',
            externalSourceId,
          };

          const trackData = {
            ...musicData,
            ownerId: '',
            freePlays: 0,
            premiumPlays: 0,
            creditPlays: 0,
            creditPlaysClaimed: 0,
          };

          await Promise.all([
            setDoc(doc(firestoreDb, 'music', musicId), musicData),
            setDoc(doc(firestoreDb, 'tracks', musicId), trackData),
          ]);

          console.log(`✅ Saved external track to Firestore: ${musicData.artist} - ${musicData.title} (${musicId})`);

          return {
            success: true,
            cached: false,
            message: 'Song fetched and saved to Firebase successfully.',
            data: musicData,
          };
        } catch (attemptErr) {
          lastAttemptError = attemptErr;
          console.warn(
            `⚠️ Failed candidate ${candidate.videoId} (${candidate.title}): ${attemptErr.message}`
          );
        } finally {
          // Always clean up temp files for this attempt
          try {
            const leftover = fs.readdirSync(fetchedDir).filter((f) => f.startsWith(`${tempId}.`));
            for (const f of leftover) {
              fs.unlinkSync(path.join(fetchedDir, f));
            }
          } catch {
            // ignore cleanup errors
          }
        }
      }

      throw lastAttemptError || new Error(`Could not download external audio for "${rawQuery}".`);
    })();

    inFlightSongFetches.set(dedupeKey, fetchPromise);
    try {
      const result = await fetchPromise;
      return res.json(result);
    } finally {
      inFlightSongFetches.delete(dedupeKey);
    }
  } catch (error) {
    console.error(`Fetch song endpoint error: ${error.message}`);
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      error: formatFetchSongError(error),
    });
  }
});

// ============================================================================
// TikTok LIVE Real-Time SSE Relay (enables Web Browser TikTok LIVE Connector)
// ============================================================================

const MAX_CONCURRENT_TIKTOK_STREAMS = 25;
const activeTikTokConnections = new Set();
let tiktokConnectorModulePromise = null;

function loadTikTokConnector() {
  if (!tiktokConnectorModulePromise) {
    tiktokConnectorModulePromise = import('tiktok-live-connector');
  }
  return tiktokConnectorModulePromise;
}

function normalizeTikTokHandle(input) {
  let clean = String(input || '').trim();
  const urlMatch = clean.match(/tiktok\.com\/@([^/?#]+)/i);
  if (urlMatch && urlMatch[1]) {
    clean = urlMatch[1];
  }
  return clean.replace(/^@+/, '').trim();
}

function getTikTokAvatarUrl(user) {
  return (
    user?.avatarThumb?.urlList?.[0] ||
    user?.avatarMedium?.urlList?.[0] ||
    ''
  );
}

function formatTikTokError(err) {
  const inner = err && typeof err === 'object' && 'exception' in err ? err.exception : err;
  const msg =
    inner instanceof Error
      ? inner.message
      : typeof inner === 'string'
        ? inner
        : err && typeof err === 'object' && typeof err.message === 'string'
          ? err.message
          : err && typeof err === 'object' && typeof err.info === 'string'
            ? err.info
            : 'Connection failed';
  const name = inner instanceof Error ? inner.name : err instanceof Error ? err.name : '';

  if (name === 'UserOfflineError' || /offline|not live|LIVE has ended/i.test(msg)) {
    return 'This TikTok account is currently offline. Start your TikTok LIVE first, then connect.';
  }
  if (/Failed to retrieve Room ID/i.test(msg)) {
    return 'Could not find an active TikTok LIVE for this @username. Double-check the handle and make sure the account is currently LIVE.';
  }
  if (name === 'SignatureRateLimitError' || /rate limit/i.test(msg)) {
    return 'TikTok signing service rate limit reached on the cloud relay. Wait a moment, add an EulerStream API key in Advanced settings, or use the PlayMyJam Desktop app.';
  }
  if (name === 'InvalidUniqueIdError') {
    return 'Invalid TikTok username. Enter a valid handle like @yourname.';
  }
  return msg;
}

app.get('/api/tiktok/health', (_req, res) => {
  res.json({
    ok: true,
    region: process.env.CLOUD_RUN_REGION || 'local',
    activeStreams: activeTikTokConnections.size,
    maxStreams: MAX_CONCURRENT_TIKTOK_STREAMS,
    ytdlpCookiesConfigured: hasYtDlpCookiesConfigured(),
    cookiesStateBucketConfigured: Boolean(getCookiesStateBucket()),
    proxyConfigured: Boolean(getYtDlpProxyUrl()),
  });
});

app.post('/api/tiktok/stream', async (req, res) => {
  const uniqueId = normalizeTikTokHandle(req.body?.uniqueId);
  if (!uniqueId || uniqueId.length > 64 || !/^[a-zA-Z0-9._-]+$/.test(uniqueId)) {
    return res.status(400).json({
      success: false,
      error: 'Please enter a valid TikTok @username.',
    });
  }

  if (activeTikTokConnections.size >= MAX_CONCURRENT_TIKTOK_STREAMS) {
    return res.status(503).json({
      success: false,
      error: 'TikTok LIVE relay is currently at full capacity. Please try again shortly or use the Desktop app.',
    });
  }

  const signApiKey =
    (typeof req.body?.signApiKey === 'string' && req.body.signApiKey.trim()) ||
    (process.env.EULER_SIGN_API_KEY || '').trim() ||
    undefined;

  // Switch response to Server-Sent Events (SSE)
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  let cleanedUp = false;
  let currentState = 'connecting';
  let currentRoomId = '';
  let conn = null;

  const sendEvent = (eventName, payload) => {
    if (cleanedUp || res.writableEnded || res.destroyed) return;
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // client disconnected mid-write
    }
  };

  const emitStatus = (state, extra = {}) => {
    currentState = state;
    sendEvent('status', {
      state,
      uniqueId,
      roomId: currentRoomId || undefined,
      ...extra,
    });
  };

  const heartbeatTimer = setInterval(() => {
    if (cleanedUp || res.writableEnded || res.destroyed) return;
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      // ignore write error on dead socket
    }
  }, 20000);

  const sessionHandle = {
    uniqueId,
    close: async (reason) => {
      if (cleanedUp) return;
      if (reason) {
        emitStatus('disconnected', { error: reason });
      }
      await cleanup();
    },
  };

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeatTimer);
    activeTikTokConnections.delete(sessionHandle);

    if (conn) {
      const target = conn;
      conn = null;
      try {
        await target.disconnect();
      } catch (err) {
        console.warn(`[TikTokRelay] Disconnect warning for @${uniqueId}:`, err?.message || err);
      }
    }

    if (!res.writableEnded && !res.destroyed) {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  };

  activeTikTokConnections.add(sessionHandle);
  // Note: On Node.js 16+ POST routes, `req.on('close')` fires as soon as the JSON body finishes
  // reading, NOT when the client disconnects. Use `res.on('close')` to detect true client aborts.
  res.on('close', () => {
    void cleanup();
  });

  emitStatus('connecting');
  console.log(`📡 [TikTokRelay] Connecting browser client to @${uniqueId} (active=${activeTikTokConnections.size})`);

  try {
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await loadTikTokConnector();
    if (cleanedUp) return;

    const connectionOptions = {
      processInitialData: true,
      fetchRoomInfoOnConnect: true,
      // Keep false: fetchRoomGiftsRoute calls EulerStream's paid signTikTokUrl.
      enableExtendedGiftInfo: false,
      ...(signApiKey ? { signApiKey } : {}),
    };

    conn = new TikTokLiveConnection(uniqueId, connectionOptions);

    conn.on(WebcastEvent.GIFT, (data) => {
      const ext = data.extendedGiftInfo;
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

      sendEvent('gift', {
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
        profilePictureUrl: getTikTokAvatarUrl(user),
        timestamp: Date.now(),
      });
    });

    conn.on(WebcastEvent.CHAT, (data) => {
      const user = data.user;
      sendEvent('chat', {
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId: String(user?.id ?? ''),
        uniqueId: user?.displayId || 'viewer',
        nickname: user?.nickname || user?.displayId || 'TikTok Viewer',
        profilePictureUrl: getTikTokAvatarUrl(user),
        comment: data.content || '',
        timestamp: Date.now(),
      });
    });

    conn.on(WebcastEvent.LIKE, (data) => {
      const user = data.user;
      sendEvent('like', {
        userId: String(user?.id ?? ''),
        uniqueId: user?.displayId || 'viewer',
        nickname: user?.nickname || user?.displayId || 'TikTok Viewer',
        likeCount: Number(data.count ?? 1),
        totalLikeCount: Number(data.total ?? 0),
        timestamp: Date.now(),
      });
    });

    conn.on(WebcastEvent.ROOM_USER, (data) => {
      sendEvent('roomStats', {
        viewerCount: Number(data.total ?? 0),
        timestamp: Date.now(),
      });
    });

    conn.on(WebcastEvent.FOLLOW, (data) => {
      const user = data.user;
      sendEvent('social', {
        type: 'follow',
        userId: String(user?.id ?? ''),
        uniqueId: user?.displayId || 'viewer',
        nickname: user?.nickname || user?.displayId || 'TikTok Viewer',
        profilePictureUrl: getTikTokAvatarUrl(user),
        timestamp: Date.now(),
      });
    });

    conn.on(WebcastEvent.SHARE, (data) => {
      const user = data.user;
      sendEvent('social', {
        type: 'share',
        userId: String(user?.id ?? ''),
        uniqueId: user?.displayId || 'viewer',
        nickname: user?.nickname || user?.displayId || 'TikTok Viewer',
        profilePictureUrl: getTikTokAvatarUrl(user),
        timestamp: Date.now(),
      });
    });

    conn.on(WebcastEvent.STREAM_END, () => {
      console.log(`🛑 [TikTokRelay] Stream ended for @${uniqueId}`);
      emitStatus('disconnected', {
        error: 'TikTok LIVE stream ended.',
        ended: true,
      });
      void cleanup();
    });

    conn.on(ControlEvent.DISCONNECTED, () => {
      if (!cleanedUp) {
        emitStatus('disconnected');
        void cleanup();
      }
    });

    conn.on(ControlEvent.ERROR, (err) => {
      console.warn(`[TikTokRelay] Event warning for @${uniqueId}:`, formatTikTokError(err));
      // During 'connecting', conn.connect() tries fallback sources internally and rejects with the final error.
      // During 'connected', transient decode warnings shouldn't interrupt the active feed.
    });

    const state = await conn.connect();
    if (cleanedUp) {
      await cleanup();
      return;
    }

    currentRoomId = String(state?.roomId || conn.roomId || '');
    console.log(`✅ [TikTokRelay] Connected to @${uniqueId} (roomId=${currentRoomId})`);
    emitStatus('connected');
  } catch (err) {
    const message = formatTikTokError(err);
    console.error(`❌ [TikTokRelay] Connect failed for @${uniqueId}:`, message);
    emitStatus('error', { error: message, fatal: true });
    await cleanup();
  }
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Allow long-lived SSE streams (60 min matches Cloud Run max timeout)
server.requestTimeout = 0;
server.headersTimeout = 65000;
server.keepAliveTimeout = 65000;

process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, closing active TikTok LIVE relay streams...');
  await Promise.allSettled(Array.from(activeTikTokConnections).map((s) => s.close()));
  server.close(() => process.exit(0));
});

server.on('error', (err) => {
  console.error(`Failed to start server on port ${PORT}:`, err);
  process.exit(1);
});
