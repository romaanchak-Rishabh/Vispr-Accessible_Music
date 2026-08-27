import type { Track } from '../types';

export type GenreTag =
  | 'bollywood' | 'hindi' | 'punjabi' | 'tamil' | 'telugu' | 'malayalam' | 'kannada' | 'marathi' | 'bengali'
  | 'rock' | 'pop' | 'english' | 'foreign' | 'japanese' | 'korean' | 'spanish'
  | 'classical' | 'devotional' | 'ghazal' | 'folk'
  | 'rap' | 'hip-hop' | 'r&b' | 'soul'
  | 'electronic' | 'edm' | 'lo-fi' | 'ambient'
  | 'jazz' | 'blues' | 'country'
  | 'indie' | 'alternative' | 'metal' | 'punk'
  | 'reggaeton' | 'latin'
  | 'acoustic' | 'sufi'
  | 'unknown';

export type EraTag = '2020s' | '2010s' | '2000s' | '1990s' | '1980s' | '1970s' | 'before' | 'unknown';

export interface SongProfile {
  genre1: GenreTag;
  genre2: GenreTag;
  era: EraTag;
  confidence: number;
}

/* ── keyword dictionaries ───────────────────────────────────────────── */

interface KeywordRule {
  patterns: RegExp[];
  genre: GenreTag;
  weight: number;
}

const GENRE_RULES: KeywordRule[] = [
  // Bollywood / Hindi
  { patterns: [/\bbollywood\b/i, /\bhindi\s*(film|movie|cinema)\b/i, /\bfilm\b.*\bhindi\b/i], genre: 'bollywood', weight: 5 },
  { patterns: [/\bhindi\b/i, /\bshayari\b/i, /\bdosti\b/i, /\bpyaar\b/i, /\bdil\b.*\bdil\b/i, /\btum\s*hi\s*ho\b/i], genre: 'hindi', weight: 3 },
  { patterns: [/\bpunjabi\b/i, /\bpunjabi\b/i, /\bbhangra\b/i, /\bsidhu\b|\bmoose\b|\bkaptaan\b/i], genre: 'punjabi', weight: 4 },
  { patterns: [/\btamil\b/i, /\bkollywood\b/i, /\btollywood\b.*tamil/i], genre: 'tamil', weight: 4 },
  { patterns: [/\btelugu\b/i, /\btollywood\b/i], genre: 'telugu', weight: 4 },
  { patterns: [/\bmalayalam\b/i, /\bmollywood\b/i], genre: 'malayalam', weight: 4 },
  { patterns: [/\bkannada\b/i, /\bsandalwood\b/i], genre: 'kannada', weight: 4 },
  { patterns: [/\bmarathi\b/i], genre: 'marathi', weight: 4 },
  { patterns: [/\bbengali\b/i], genre: 'bengali', weight: 4 },

  // Western
  { patterns: [/\brock\b/i, /\balt\s*rock\b/i, /\bclassic\s*rock\b/i, /\bgrunge\b/i], genre: 'rock', weight: 3 },
  { patterns: [/\bpop\b/i, /\bsynth\s*pop\b/i, /\bpoptastic\b/i], genre: 'pop', weight: 2 },
  { patterns: [/\benglish\b/i, /\buk\b/i, /\bus\b/i], genre: 'english', weight: 1 },
  { patterns: [/\bjapanese\b/i, /\bjpop\b/i, /\banime\b/i, /\b Vocaloid\b/i], genre: 'japanese', weight: 4 },
  { patterns: [/\bkorean\b/i, /\bkpop\b/i, /\b(bts|blackpink|twice|exo|aespa|stray\s*kids)\b/i], genre: 'korean', weight: 4 },
  { patterns: [/\bspanish\b/i, /\breggaeton\b/i, /\burbano\b/i], genre: 'spanish', weight: 3 },
  { patterns: [/\breggaeton\b/i, /\bdembow\b/i], genre: 'reggaeton', weight: 5 },

  // Classical / Traditional
  { patterns: [/\bclassical\b/i, /\braag\b/i, /\braga\b/i, /\bgarana\b/i, /\bkhyal\b/i, /\bdhrupad\b/i, /\bsitar\b/i, /\btabla\b/i], genre: 'classical', weight: 4 },
  { patterns: [/\bdevotional\b/i, /\bbhajan\b/i, /\baarti\b/i, /\bmantra\b/i, /\bpuja\b/i, /\bganesh\b/i, /\bgurubani\b/i, /\bsikh\b/i], genre: 'devotional', weight: 4 },
  { patterns: [/\bghazal\b/i, /\bghazals\b/i], genre: 'ghazal', weight: 5 },
  { patterns: [/\bfolk\b/i, /\blok\b/i, /\bballad\b/i], genre: 'folk', weight: 3 },
  { patterns: [/\bsufi\b/i, /\bqawwali\b/i, /\bmalamal\b/i], genre: 'sufi', weight: 4 },

  // Hip-Hop / Rap
  { patterns: [/\brap\b/i, /\bhip\s*hop\b/i, /\bhiphop\b/i, /\bemcee\b/i], genre: 'rap', weight: 4 },
  { patterns: [/\br&b\b/i, /\brnb\b/i, /\bsoul\b/i, /\bfunk\b/i], genre: 'r&b', weight: 3 },

  // Electronic
  { patterns: [/\belectronic\b/i, /\bedm\b/i, /\btechno\b/i, /\bhouse\b/i, /\btrance\b/i, /\bdubstep\b/i, /\bdnb\b/i], genre: 'electronic', weight: 4 },
  { patterns: [/\blo-fi\b/i, /\blofi\b/i, /\bchillhop\b/i, /\bstudy\b/i], genre: 'lo-fi', weight: 3 },
  { patterns: [/\bambient\b/i, /\bmeditation\b/i, /\brelax\b/i, /\bsleep\b/i], genre: 'ambient', weight: 3 },

  // Other
  { patterns: [/\bjazz\b/i, /\bswing\b/i, /\bimprov\b/i], genre: 'jazz', weight: 4 },
  { patterns: [/\bblues\b/i], genre: 'blues', weight: 4 },
  { patterns: [/\bcountry\b/i, /\bfolk\s*country\b/i], genre: 'country', weight: 4 },
  { patterns: [/\bindie\b/i, /\balternative\b/i, /\balt\b/i], genre: 'indie', weight: 3 },
  { patterns: [/\bmetal\b/i, /\bdeath\s*metal\b/i, /\bmetalcore\b/i], genre: 'metal', weight: 4 },
  { patterns: [/\bpunk\b/i, /\bpop\s*punk\b/i, /\bska\b/i], genre: 'punk', weight: 4 },
  { patterns: [/\blatin\b/i, /\bsalsa\b/i, /\bbachata\b/i, /\bmerengue\b/i], genre: 'latin', weight: 3 },
  { patterns: [/\bacoustic\b/i, /\bunplugged\b/i, /\bcovers?\b/i], genre: 'acoustic', weight: 2 },
];

const KNOWN_ARTISTS: Record<string, GenreTag> = {
  // Bollywood / Hindi
  'arijit singh': 'hindi', 'shreya ghoshal': 'hindi', 'atif aslam': 'hindi',
  'sonu nigam': 'hindi', 'kk': 'hindi', 'udit narayan': 'hindi',
  'alka yagnik': 'hindi', 'lata mangeshkar': 'hindi', 'kishore kumar': 'hindi',
  'rahat fateh ali khan': 'hindi', 'mika singh': 'bollywood', 'sukhwinder singh': 'bollywood',
  ' Vishal-Shekhar': 'bollywood', 'pritam': 'bollywood', 'salim-sulaiman': 'bollywood',
  'armaan malik': 'hindi', 'jubin nautiyal': 'hindi', 'neha kakkar': 'bollywood',
  'badshah': 'punjabi', 'diljit dosanjh': 'punjabi', 'ap dhillon': 'punjabi',
  'karan aujla': 'punjabi', 'amrit maan': 'punjabi', 'guru randhawa': 'punjabi',
  'honey singh': 'punjabi', 'raftaar': 'rap', 'divine': 'rap',
  // Tamil / Telugu
  'a.r. rahman': 'tamil', 'ar rahman': 'tamil', 'ilayaraja': 'tamil',
  'anirudh ravichander': 'tamil', 'yuvan shankar raja': 'tamil',
  'thaman': 'telugu', 'keeravani': 'telugu', 'DSP': 'telugu',
  // Western
  'the beatles': 'rock', 'led zeppelin': 'rock', 'pink floyd': 'rock',
  'queen': 'rock', 'nirvana': 'rock', 'radiohead': 'rock', 'arctic monkeys': 'rock',
  'taylor swift': 'pop', 'ed sheeran': 'pop', 'billie eilish': 'pop',
  'drake': 'rap', 'kendrick lamar': 'rap', 'kanye west': 'rap',
  'bts': 'korean', 'blackpink': 'korean', 'twice': 'korean',
  'daft punk': 'electronic', 'deadmau5': 'electronic', 'calvin harris': 'electronic',
  'bbno$': 'rap', 'post malone': 'rap', 'the weeknd': 'r&b',
  // Classical
  'zakir hussain': 'classical', 'rishikesh 방식': 'classical',
  'ravi shankar': 'classical', 'vilayat khan': 'classical',
};

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function buildSearchText(track: Track): string {
  const parts = [
    track.title,
    track.artist,
    track.artist2 ?? '',
    track.album,
    track.albumArtist ?? '',
    track.genre ?? ''
  ];
  return stripDiacritics(parts.join(' '));
}

/* ── era detection ──────────────────────────────────────────────────── */

function inferEra(track: Track, searchText: string): EraTag {
  // If explicit year tag exists, use it
  if (track.year && track.year > 1950) {
    if (track.year >= 2020) return '2020s';
    if (track.year >= 2010) return '2010s';
    if (track.year >= 2000) return '2000s';
    if (track.year >= 1990) return '1990s';
    if (track.year >= 1980) return '1980s';
    if (track.year >= 1970) return '1970s';
    return 'before';
  }

  // Heuristic: look for year patterns in title/album
  const yearMatch = searchText.match(/\b(19[7-9]\d|20[0-2]\d)\b/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (y >= 2020) return '2020s';
    if (y >= 2010) return '2010s';
    if (y >= 2000) return '2000s';
    if (y >= 1990) return '1990s';
    if (y >= 1980) return '1980s';
    return '1970s';
  }

  // Heuristic: look for decade words
  if (/\b20s\b|\btwenties\b|\bcovid\b|\blockdown\b|\bpandemic\b/i.test(searchText)) return '2020s';
  if (/\b10s\b|\btennies\b|\b201\d\b/i.test(searchText)) return '2010s';
  if (/\b00s\b|\bnaughties\b|\b200\d\b/i.test(searchText)) return '2000s';
  if (/\b90s\b|\bnineties\b|\bninety\b/i.test(searchText)) return '1990s';
  if (/\b80s\b|\beighties\b|\beighty\b/i.test(searchText)) return '1980s';
  if (/\b70s\b|\bseventies\b|\bseventy\b/i.test(searchText)) return '1970s';

  return 'unknown';
}

/* ── main classifier ────────────────────────────────────────────────── */

const VALID_GENRES = new Set<GenreTag>([
  'bollywood', 'hindi', 'punjabi', 'tamil', 'telugu', 'malayalam', 'kannada', 'marathi', 'bengali',
  'rock', 'pop', 'english', 'foreign', 'japanese', 'korean', 'spanish',
  'classical', 'devotional', 'ghazal', 'folk',
  'rap', 'hip-hop', 'r&b', 'soul',
  'electronic', 'edm', 'lo-fi', 'ambient',
  'jazz', 'blues', 'country',
  'indie', 'alternative', 'metal', 'punk',
  'reggaeton', 'latin',
  'acoustic', 'sufi',
  'unknown'
]);

function validateGenreTag(raw: string): GenreTag {
  const lower = raw.trim().toLowerCase();
  if (VALID_GENRES.has(lower as GenreTag)) return lower as GenreTag;
  // Fuzzy: check if it contains any valid genre
  for (const g of VALID_GENRES) {
    if (lower.includes(g) || g.includes(lower)) return g;
  }
  return 'unknown';
}

export function classifyTrack(track: Track): SongProfile {
  // Manual overrides take priority
  if (track.genre1) {
    return {
      genre1: validateGenreTag(track.genre1),
      genre2: track.genre2 ? validateGenreTag(track.genre2) : 'unknown',
      era: inferEra(track, buildSearchText(track)),
      confidence: 1
    };
  }

  const searchText = buildSearchText(track);
  const genreHits = new Map<GenreTag, number>();

  // 1. Keyword rules on combined text
  for (const rule of GENRE_RULES) {
    for (const pat of rule.patterns) {
      if (pat.test(searchText)) {
        genreHits.set(rule.genre, (genreHits.get(rule.genre) ?? 0) + rule.weight);
        break; // one match per rule is enough
      }
    }
  }

  // 2. Known artist override (high confidence)
  const artistLower = stripDiacritics(track.artist);
  const artistGenre = KNOWN_ARTISTS[artistLower];
  if (artistGenre) {
    genreHits.set(artistGenre, (genreHits.get(artistGenre) ?? 0) + 8);
  }

  // 3. Explicit genre tag from file metadata
  if (track.genre) {
    const g = track.genre.toLowerCase();
    for (const rule of GENRE_RULES) {
      if (rule.patterns.some((p) => p.test(g))) {
        genreHits.set(rule.genre, (genreHits.get(rule.genre) ?? 0) + 6);
        break;
      }
    }
  }

  // 4. Determine genre1 (highest) and genre2 (second highest)
  const sorted = [...genreHits.entries()].sort((a, b) => b[1] - a[1]);
  let genre1: GenreTag = 'unknown';
  let genre2: GenreTag = 'unknown';
  let confidence = 0;

  if (sorted.length >= 1) {
    genre1 = sorted[0][0];
    confidence = Math.min(sorted[0][1] / 12, 1);
  }
  if (sorted.length >= 2) {
    genre2 = sorted[1][0];
  }

  const era = inferEra(track, searchText);

  return { genre1, genre2, era, confidence };
}

/* ── batch classify (memoized) ──────────────────────────────────────── */

const profileCache = new Map<string, SongProfile>();

export function getTrackProfile(track: Track): SongProfile {
  const cached = profileCache.get(track.id);
  if (cached) return cached;
  const profile = classifyTrack(track);
  profileCache.set(track.id, profile);
  return profile;
}

export function clearProfileCache(): void {
  profileCache.clear();
}
