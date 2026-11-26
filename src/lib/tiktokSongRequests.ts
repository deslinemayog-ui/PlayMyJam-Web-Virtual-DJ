import type { Song } from '@/Types';

const FILLER_WORDS = new Set([
  'please',
  'pls',
  'plz',
  'dj',
  'by',
  'song',
  'songs',
  'track',
  'tracks',
  'music',
  'jam',
  'tune',
  'hit',
  'me',
  'us',
  'play',
  'some',
  'any',
  'a',
  'the',
  'of',
  'from',
  'for',
  'bro',
  'boss',
  'man',
  'next',
  'now',
  'ft',
  'feat',
  'featuring',
  'and',
]);

/**
 * Stable viewer identifier shared across TikTok gift and chat events.
 * Prefers numeric TikTok userId, falls back to normalized @uniqueId.
 */
export function getTikTokViewerKey(userId?: string, uniqueId?: string): string {
  const cleanId = (userId || '').trim();
  if (cleanId && cleanId !== '0') {
    return cleanId;
  }
  return (uniqueId || '').trim().replace(/^@+/, '').toLowerCase();
}

export function normalizeSearchText(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.(mp3|wav|m4a|flac|aac|ogg|wma)\b/g, ' ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractSongRequestQuery(comment: string): string | null {
  const trimmed = (comment || '').trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^\/play\s+(.+)$/i);
  if (!match?.[1]) return null;

  const cleaned = match[1]
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .trim();

  if (cleaned.length < 2) return null;
  return cleaned;
}

function getMeaningfulTokens(normalized: string): string[] {
  const all = normalized.split(' ').filter((t) => t.length > 0);
  const filtered = all.filter((t) => !FILLER_WORDS.has(t));
  return filtered.length > 0 ? filtered : all;
}

/**
 * Bounded Levenshtein edit distance for typo-tolerant artist/track matching
 * on longer words (>= 5 chars, e.g. "machesso" -> "macheso", "charakopa" -> "charakupa").
 * Short words (<= 4 chars like "naye" vs "raye") are NOT fuzzy-matched to avoid false hits.
 */
function levenshteinDistance(a: string, b: string, maxDist: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function scoreTokenAgainstWordList(queryToken: string, words: string[]): number {
  let best = 0;
  for (const word of words) {
    if (!word) continue;
    if (word === queryToken) return 35;

    if (queryToken.length >= 4 && word.startsWith(queryToken)) {
      best = Math.max(best, 26);
    } else if (word.length >= 4 && queryToken.startsWith(word)) {
      best = Math.max(best, 22);
    } else if (queryToken.length >= 4 && word.includes(queryToken)) {
      best = Math.max(best, 19);
    } else if (queryToken.length >= 5 && word.length >= 5) {
      const maxEdits = queryToken.length >= 8 ? 2 : 1;
      const dist = levenshteinDistance(queryToken, word, maxEdits);
      if (dist <= maxEdits) {
        best = Math.max(best, dist === 1 ? 22 : 16);
      }
    }
  }
  return best;
}

function extractGenreText(song: Song): string {
  const extended = song as Song & { genre?: string; genres?: string | string[] };
  const parts: string[] = [];
  if (typeof extended.genre === 'string') parts.push(extended.genre);
  if (typeof extended.genres === 'string') parts.push(extended.genres);
  if (Array.isArray(extended.genres)) parts.push(...extended.genres.filter((g) => typeof g === 'string'));
  return normalizeSearchText(parts.join(' '));
}

/**
 * Finds the best matching track in the PlayMyJam server song list for a viewer's request query.
 * Enforces strict multi-word coverage so partial/unrelated hits (e.g. "Tongai Moyo naye" vs "RAYE")
 * return null and cleanly fall back to external search instead of playing the wrong song.
 */
export function findBestMatchingSong(
  query: string,
  songs: Song[],
  currentlyPlayingIds?: Set<string>,
  queuedSongIds?: Set<string>
): Song | null {
  if (!query || !songs || songs.length === 0) return null;

  const normQuery = normalizeSearchText(query);
  if (normQuery.length < 2) return null;

  const queryTokens = getMeaningfulTokens(normQuery);
  const cleanPhrase = queryTokens.join(' ');
  if (cleanPhrase.length < 2) return null;

  const significantTokens = queryTokens.filter((t) => t.length >= 2);
  if (significantTokens.length === 0) return null;

  let bestSong: Song | null = null;
  let bestFinalScore = -Infinity;

  for (const song of songs) {
    const title = normalizeSearchText(song.title || '');
    const artist = normalizeSearchText(song.artist || '');
    const genre = extractGenreText(song);
    if (!title && !artist) continue;

    const combined = `${artist} ${title}`.trim();
    const reversed = `${title} ${artist}`.trim();
    const titleWords = title.split(' ').filter(Boolean);
    const artistWords = artist.split(' ').filter(Boolean);
    const genreWords = genre.split(' ').filter(Boolean);

    const exactWholeField =
      title === cleanPhrase ||
      artist === cleanPhrase ||
      combined === cleanPhrase ||
      reversed === cleanPhrase;

    let rawScore = 0;

    // 1. Whole-phrase matching
    if (exactWholeField) {
      rawScore += 140;
    } else if (title.startsWith(cleanPhrase) || artist.startsWith(cleanPhrase)) {
      rawScore += 95;
    } else if (title.includes(cleanPhrase) || artist.includes(cleanPhrase)) {
      rawScore += 75;
    } else if (combined.includes(cleanPhrase) || reversed.includes(cleanPhrase)) {
      rawScore += 65;
    }

    // 2. Per-token matching across artist and title (with typo tolerance for >= 5-char words)
    let matchedPrimaryTokens = 0;
    let strongTokenMatches = 0;
    let matchedArtist = false;
    let matchedTitle = false;
    let exactSingleTitleMatch = false;

    for (const token of significantTokens) {
      const artistTokenScore = scoreTokenAgainstWordList(token, artistWords);
      const titleTokenScore = scoreTokenAgainstWordList(token, titleWords);
      const primaryScore = Math.max(artistTokenScore, titleTokenScore);

      if (primaryScore > 0) {
        matchedPrimaryTokens += 1;
        rawScore += primaryScore;
        if (primaryScore >= 26) strongTokenMatches += 1;
        if (artistTokenScore > 0) matchedArtist = true;
        if (titleTokenScore > 0) matchedTitle = true;
        if (token.length >= 5 && title === token) {
          exactSingleTitleMatch = true;
        }
      } else if (significantTokens.length === 1) {
        // Only allow genre-only fallback for single-word requests like "play amapiano"
        const genreScore = scoreTokenAgainstWordList(token, genreWords);
        if (genreScore >= 35) {
          rawScore += 24;
        }
      }
    }

    // 3. Strict coverage checks so unrelated tracks NEVER block external search fallback
    const tokenCount = significantTokens.length;
    if (tokenCount === 1) {
      // Single-word query (e.g. "play kygo", "play charakupa"): require real match
      if (rawScore < 22) continue;
    } else if (tokenCount === 2) {
      // Two-word query (e.g. "play macheso charakupa", "play burna boy"):
      // Must match BOTH words, OR match the full exact artist/title (e.g. title === "charakupa" under Unknown Artist)
      const allMatched = matchedPrimaryTokens === 2;
      if (!allMatched && !exactWholeField && !exactSingleTitleMatch) {
        continue;
      }
      if (allMatched) rawScore += 55;
      else if (exactSingleTitleMatch) rawScore += 25;
      if (matchedArtist && matchedTitle) rawScore += 30;
    } else {
      // 3+ word query (e.g. "play tongai moyo naye", "play alick macheso charakupa denga"):
      // Must match >= 70% of words, include at least 1 strong/exact token, and touch the title
      // (unless the entire phrase is an exact artist name like "black eyed peas").
      const requiredMatches = Math.ceil(tokenCount * 0.7);
      const validMulti =
        exactWholeField ||
        (matchedPrimaryTokens >= requiredMatches &&
          strongTokenMatches >= 1 &&
          (matchedTitle || artist === cleanPhrase));
      if (!validMulti) {
        continue;
      }
      if (matchedPrimaryTokens === tokenCount) rawScore += 55;
      if (matchedArtist && matchedTitle) rawScore += 30;
    }

    // Check minimum threshold BEFORE freshness tie-breakers
    const minThreshold = tokenCount === 1 ? 22 : 40;
    if (rawScore < minThreshold) continue;

    let finalScore = rawScore;
    if (currentlyPlayingIds?.has(song.id)) {
      finalScore -= 60;
    }
    if (queuedSongIds?.has(song.id)) {
      finalScore -= 50;
    }

    if (finalScore > bestFinalScore) {
      bestFinalScore = finalScore;
      bestSong = song;
    }
  }

  return bestSong;
}
