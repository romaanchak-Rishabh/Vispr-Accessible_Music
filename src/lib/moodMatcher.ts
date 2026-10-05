import type { Track } from '../types';
import { getTrackProfile } from './classifier';

/**
 * Mood matching engine.
 * Scores each track for a target mood using multiple signals:
 *  1. Explicit `track.mood` string (Gemini/manual tag) — strongest signal
 *  2. Classifier genre tags mapped to mood affinities
 *  3. Raw genre1/genre2 string keywords
 *  4. Artist-name heuristics for well-known mood artists
 *  5. Era heuristics (e.g. old acoustic → calm)
 *
 * Returns tracks sorted by mood score, best first. Tracks with score 0 are excluded.
 */

interface MoodDef {
  name: string;
  /** Words that appear in track.mood / genre strings → strong match */
  moodWords: string[];
  /** Classifier GenreTag values that strongly suggest this mood */
  genreTags: string[];
  /** Genre substrings checked against raw genre1/genre2 strings */
  genreKeywords: string[];
}

export const MOOD_DEFS: Record<string, MoodDef> = {
  chill: {
    name: 'Chill',
    moodWords: ['chill', 'calm', 'relax', 'mellow', 'laid-back', 'laidback', 'lofi', 'lo-fi', 'peaceful', 'serene', 'dreamy'],
    genreTags: ['lo-fi', 'ambient', 'acoustic', 'folk', 'jazz', 'classical'],
    genreKeywords: ['chill', 'calm', 'lofi', 'lo-fi', 'ambient', 'acoustic', 'mellow', 'downtempo'],
  },
  focus: {
    name: 'Focus',
    moodWords: ['focus', 'concentrate', 'study', 'instrumental', 'minimal', 'deep', 'coding'],
    genreTags: ['classical', 'ambient', 'lo-fi', 'electronic'],
    genreKeywords: ['focus', 'study', 'instrumental', 'minimal', 'piano', 'ambient', 'lo-fi', 'lofi'],
  },
  workout: {
    name: 'Workout',
    moodWords: ['workout', 'gym', 'energetic', 'hype', 'pump', 'motivation', 'aggressive', 'power', 'beast', 'run'],
    genreTags: ['edm', 'rock', 'metal', 'hip-hop', 'rap', 'electronic', 'punk'],
    genreKeywords: ['workout', 'gym', 'energetic', 'hype', 'pump', 'motivation', 'aggressive', 'power'],
  },
  party: {
    name: 'Party',
    moodWords: ['party', 'dance', 'club', 'banger', 'celebration', 'festive', 'upbeat', 'fun', 'turnt', 'lit', 'disco'],
    genreTags: ['edm', 'electronic', 'pop', 'bollywood', 'reggaeton', 'dance'],
    genreKeywords: ['party', 'dance', 'club', 'edm', 'electronic', 'disco', 'bhangra', 'reggaeton', 'dhol'],
  },
  commute: {
    name: 'Commute',
    moodWords: ['commute', 'drive', 'road', 'travel', 'journey', 'car', 'highway', 'motion'],
    genreTags: ['pop', 'indie', 'alternative', 'rock', 'hip-hop', 'bollywood'],
    genreKeywords: ['commute', 'drive', 'road', 'travel', 'journey', 'highway'],
  },
  sleep: {
    name: 'Sleep',
    moodWords: ['sleep', 'bedtime', 'lullaby', 'dream', 'night', 'quiet', 'soft', 'gentle', 'meditation', 'soothing'],
    genreTags: ['classical', 'ambient', 'acoustic', 'folk', 'jazz'],
    genreKeywords: ['sleep', 'lullaby', 'night', 'soft', 'gentle', 'soothing', 'meditation', 'piano'],
  },
  sad: {
    name: 'Sad',
    moodWords: ['sad', 'melancholic', 'melancholy', 'heartbreak', 'heartbreak', 'breakup', 'sorrow', 'grief', 'lonely', 'depressing', 'emotional', 'bittersweet', 'weepy', 'blue'],
    genreTags: ['ghazal', 'sufi', 'classical', 'acoustic', 'folk'],
    genreKeywords: ['sad', 'melancholic', 'heartbreak', 'sorrow', 'emotional', 'bittersweet', 'blue', 'grief'],
  },
};

/** Extra genre→mood affinities for genres the classifier actually produces */
const GENRE_MOOD_MAP: Record<string, string[]> = {
  'lo-fi': ['chill', 'focus', 'sleep'],
  ambient: ['chill', 'focus', 'sleep'],
  classical: ['focus', 'sleep', 'sad'],
  acoustic: ['chill', 'sad', 'sleep'],
  jazz: ['chill', 'commute'],
  folk: ['chill', 'sad', 'commute'],
  pop: ['party', 'commute'],
  bollywood: ['party', 'commute', 'workout'],
  punjabi: ['party', 'workout'],
  tamil: ['party', 'commute'],
  telugu: ['party', 'commute'],
  edm: ['party', 'workout'],
  electronic: ['party', 'workout', 'focus'],
  dance: ['party', 'workout'],
  reggaeton: ['party', 'workout'],
  rock: ['workout', 'commute'],
  metal: ['workout'],
  punk: ['workout'],
  alternative: ['commute', 'workout'],
  indie: ['commute', 'chill'],
  'hip-hop': ['workout', 'party'],
  rap: ['workout', 'party'],
  'r&b': ['chill', 'party'],
  ghazal: ['sad', 'chill'],
  sufi: ['sad', 'chill', 'sleep'],
};

/** Well-known artist → mood affinities (fallback when metadata is thin) */
const ARTIST_MOOD_MAP: Record<string, string[]> = {
  'ludwig van beethoven': ['focus', 'sleep'],
  'yiruma': ['focus', 'sleep', 'sad'],
  'lana del rey': ['sad', 'chill'],
  'billie eilish': ['sad', 'chill', 'sleep'],
  'the weeknd': ['party', 'chill'],
  'ariana grande': ['party'],
  'dua lipa': ['party'],
  'ed sheeran': ['sad', 'commute', 'chill'],
  'coldplay': ['commute', 'chill'],
  'imagine dragons': ['workout', 'commute'],
  'eminem': ['workout'],
  'drake': ['commute', 'party'],
  'travis scott': ['party', 'workout'],
  'kanye west': ['workout', 'party'],
  'arijit singh': ['sad', 'chill'],
  'shreya ghoshal': ['sad', 'party'],
  'arijit': ['sad', 'chill'],
  'sid sriram': ['sad', 'chill'],
  'anirudh ravichander': ['party', 'workout'],
  'prateek kuhad': ['chill', 'sad'],
  'kesha': ['party'],
  'marshmello': ['party', 'workout'],
  'calvin harris': ['party'],
  'avicii': ['party', 'commute'],
  'daft punk': ['party', 'chill'],
  'boards of canada': ['chill', 'focus'],
  'aphex twin': ['focus'],
  'tycho': ['chill', 'focus'],
  'bonobo': ['chill', 'focus'],
  'nujabes': ['chill', 'focus'],
  'j dilla': ['chill'],
  'clairo': ['chill', 'sad'],
  'beabadoobee': ['chill', 'sad'],
  'phoebe bridgers': ['sad'],
  'bon iver': ['sad', 'chill'],
  'radiohead': ['sad', 'commute'],
  'pink floyd': ['chill', 'focus'],
};

function scoreTrackForMood(t: Track, moodKey: string): number {
  const def = MOOD_DEFS[moodKey];
  if (!def) return 0;
  let score = 0;

  // 1. Explicit mood field (strongest)
  const mood = (t.mood ?? '').toLowerCase();
  if (mood) {
    for (const w of def.moodWords) {
      if (mood.includes(w)) { score += 40; break; }
    }
  }

  // 2. Classifier genre tags
  const profile = getTrackProfile(t);
  const genres = [profile.genre1, profile.genre2].filter(Boolean).map((g) => g.toLowerCase());
  for (const g of genres) {
    if (def.genreTags.includes(g)) { score += 25; break; }
  }
  // Also check the GENRE_MOOD_MAP inverse: does any of this track's genres map to this mood?
  for (const g of genres) {
    const moods = GENRE_MOOD_MAP[g];
    if (moods && moods.includes(moodKey)) { score += 20; break; }
  }

  // 3. Raw genre string keywords
  const rawGenres = [t.genre1, t.genre2, t.genre].filter((g): g is string => Boolean(g)).map((g) => g.toLowerCase());
  for (const g of rawGenres) {
    for (const kw of def.genreKeywords) {
      if (g.includes(kw)) { score += 15; break; }
    }
  }

  // 4. Artist heuristics
  const artist = (t.artist ?? '').toLowerCase();
  for (const [name, moods] of Object.entries(ARTIST_MOOD_MAP)) {
    if (artist.includes(name) && moods.includes(moodKey)) { score += 18; break; }
  }

  // 5. Era heuristics — old acoustic/classical leans calm/sad/focus; recent pop leans party
  const era = profile.era as string;
  if (era && era !== 'unknown') {
    if ((moodKey === 'chill' || moodKey === 'focus' || moodKey === 'sleep') &&
        (era === 'before' || era === '1970s' || era === '1980s') &&
        (genres.includes('classical') || genres.includes('acoustic') || genres.includes('folk'))) {
      score += 8;
    }
    if (moodKey === 'party' && (era === '2010s' || era === '2020s') &&
        (genres.includes('pop') || genres.includes('edm') || genres.includes('electronic'))) {
      score += 8;
    }
  }

  return score;
}

/**
 * Returns up to `limit` tracks best-matched to the given mood, sorted by score.
 * Only tracks with score > 0 are included — no random fallback.
 */
export function getMoodTracks(tracks: Track[], moodKey: string, limit = 50): Track[] {
  const scored = tracks
    .map((t) => ({ t, s: scoreTrackForMood(t, moodKey) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.t);
}

/** Returns the mood score for a single track (for debugging / UI hints). */
export function moodScore(t: Track, moodKey: string): number {
  return scoreTrackForMood(t, moodKey);
}
