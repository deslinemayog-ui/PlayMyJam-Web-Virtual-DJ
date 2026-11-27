import type { Song } from '@/Types';

export type DownloadableSong = Pick<Song, 'title' | 'artist' | 'url' | 'audioUrl' | 'isLocal'> & {
  fileName?: string;
};

export interface TrackDownloadResult {
  success: boolean;
  fileName: string;
  filePath?: string;
  fallbackOpened?: boolean;
  error?: string;
}

const AUDIO_EXT_REGEX = /\.(mp3|wav|m4a|aac|flac|ogg|opus|webm)$/i;
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/g;

function stripControlChars(input: string): string {
  return Array.from(input)
    .map((ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch))
    .join('');
}

function getDownloadUrl(song: DownloadableSong | null | undefined): string {
  if (!song || song.isLocal) return '';
  const url = (song.audioUrl || song.url || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

export function canDownloadTrack(song: DownloadableSong | null | undefined): boolean {
  return Boolean(getDownloadUrl(song));
}

function inferAudioExtension(url: string, contentType?: string | null): string {
  const mime = (contentType || '').toLowerCase();
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('flac')) return '.flac';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return '.m4a';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';

  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const match = pathname.match(AUDIO_EXT_REGEX);
    if (match) return match[0].toLowerCase();
  } catch {
    // fallback to .mp3
  }
  return '.mp3';
}

export function buildTrackFileName(
  song: DownloadableSong,
  contentType?: string | null
): string {
  const url = getDownloadUrl(song);
  const rawTitle = (song.title || '').trim();
  const rawArtist = (song.artist || '').trim();

  let baseName = (song.fileName || '').trim();
  if (!baseName) {
    const hasUsefulArtist =
      rawArtist &&
      !/^(unknown|unknown artist|local track|system music)$/i.test(rawArtist);
    const titleAlreadyIncludesArtist =
      hasUsefulArtist &&
      rawTitle.toLowerCase().startsWith(`${rawArtist.toLowerCase()} -`);

    if (hasUsefulArtist && rawTitle && !titleAlreadyIncludesArtist) {
      baseName = `${rawArtist} - ${rawTitle}`;
    } else {
      baseName = rawTitle || rawArtist || 'PlayMyJam Track';
    }
  }

  let safeName = stripControlChars(baseName)
    .replace(ILLEGAL_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 160);

  if (!safeName) {
    safeName = 'PlayMyJam Track';
  }

  if (!AUDIO_EXT_REGEX.test(safeName)) {
    safeName = `${safeName}${inferAudioExtension(url, contentType)}`;
  }

  return safeName;
}

function triggerBrowserDownload(href: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads a PlayMyJam / TikTok / AI track directly to the user's Downloads folder.
 * - In Electron Desktop: saves via main-process IPC (`app.getPath('downloads')`), bypassing CORS.
 * - In Web Browsers: fetches the audio as a Blob so the `download` attribute works even for
 *   cross-origin Firebase Storage URLs, saving straight to the browser's Downloads folder.
 */
export async function downloadTrackLocally(
  song: DownloadableSong
): Promise<TrackDownloadResult> {
  const audioUrl = getDownloadUrl(song);
  if (!audioUrl) {
    return {
      success: false,
      fileName: '',
      error: 'This track is already on your device or has no downloadable link.',
    };
  }

  const initialFileName = buildTrackFileName(song);

  // Desktop app (Electron): write directly into OS Downloads folder
  if (typeof window !== 'undefined' && window.electronAPI?.downloadTrack) {
    const result = await window.electronAPI.downloadTrack({
      url: audioUrl,
      fileName: initialFileName,
    });
    return {
      success: result.success,
      fileName: result.fileName || initialFileName,
      filePath: result.filePath,
      error: result.error,
    };
  }

  // Web browser: fetch as same-origin Blob so `<a download>` reliably triggers a file download
  try {
    const response = await fetch(audioUrl, { mode: 'cors' });
    if (!response.ok) {
      return {
        success: false,
        fileName: initialFileName,
        error: `Download failed (HTTP ${response.status}).`,
      };
    }

    const resolvedFileName = buildTrackFileName(song, response.headers.get('content-type'));
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      triggerBrowserDownload(objectUrl, resolvedFileName);
    } finally {
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 15_000);
    }

    return {
      success: true,
      fileName: resolvedFileName,
    };
  } catch (err) {
    // If a third-party host blocks CORS on fetch(), fall back to opening the audio URL
    if (err instanceof TypeError && typeof window !== 'undefined') {
      window.open(audioUrl, '_blank', 'noopener,noreferrer');
      return {
        success: true,
        fileName: initialFileName,
        fallbackOpened: true,
      };
    }

    return {
      success: false,
      fileName: initialFileName,
      error: err instanceof Error ? err.message : 'Failed to download track.',
    };
  }
}
