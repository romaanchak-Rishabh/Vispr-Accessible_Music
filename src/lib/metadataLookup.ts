export interface MetadataResult {
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  artwork?: string;
}

const GENRE_MAP: Record<string, string> = {
  'film music': 'bollywood',
  'indian pop': 'hindi',
  'hindi pop': 'hindi',
  'tamil pop': 'tamil',
  'telugu pop': 'telugu',
  'punjabi pop': 'punjabi',
  'kannada pop': 'kannada',
  'malayalam pop': 'malayalam',
  'marathi pop': 'marathi',
  'bengali pop': 'bengali',
  'korean pop': 'korean',
  'japanese pop': 'japanese',
  'garage rock': 'rock',
  'indie rock': 'rock',
  'soft rock': 'rock'
};

export function mapGenre(raw: string): string {
  if (!raw) return '';
  const key = raw.toLowerCase();
  const mapped = GENRE_MAP[key];
  if (mapped) return mapped;
  const norm = key.replace(/[^a-z]/g, '-');
  if (/(bollywood|hindustani|film)/.test(norm)) return 'bollywood';
  if (/(punjabi|bhangra)/.test(norm)) return 'punjabi';
  if (/^tamil/.test(norm)) return 'tamil';
  if (/^telugu/.test(norm)) return 'telugu';
  if (/^kannada/.test(norm)) return 'kannada';
  if (/^malayalam/.test(norm)) return 'malayalam';
  if (/^marathi/.test(norm)) return 'marathi';
  if (/^bengali/.test(norm)) return 'bengali';
  if (/^(devotional|bhajan|spiritual)/.test(norm)) return 'devotional';
  if (/(ghazal|sufi|qawwali)/.test(norm)) return norm.includes('sufi') ? 'sufi' : 'ghazal';
  if (/classical/.test(norm)) return 'classical';
  if (/(reggae|dancehall)/.test(norm)) return 'reggaeton';
  if (/(hip|rap)/.test(norm)) return 'hip-hop';
  if (/(rhythm|r-amp-b|r-and-b|r-b|soul)/.test(norm)) return 'r&b';
  if (/(electronic|edm|house|dance|techno|trance|dubstep)/.test(norm)) return 'electronic';
  if (/^(ambient|lo-fi|lofi|chill|lounge)/.test(norm) || /lo-fi|lofi/.test(norm)) return 'lo-fi';
  if (/metal/.test(norm)) return 'metal';
  if (/(punk|grunge|emo)/.test(norm)) return 'punk';
  if (/(alternative|indie|indian alternative)/.test(norm)) return 'indie';
  if (/(country|folk|acoustic|singer-songwriter)/.test(norm)) return 'acoustic';
  if (/(jazz|blues|swing)/.test(norm)) return norm.includes('blues') ? 'blues' : 'jazz';
  if (/^korean/.test(norm)) return 'korean';
  if (/^japanese/.test(norm)) return 'japanese';
  if (/(spanish|latin|reggaeton)/.test(norm)) return 'latin';
  if (/^foreign|^instrumental|^soundtrack/.test(norm)) return 'foreign';
  if (/^pop/.test(norm) || /^rock/.test(norm)) return key;
  return key;
}

export function yearToEra(year: number | undefined): string | undefined {
  if (year == null || Number.isNaN(year)) return undefined;
  if (year >= 2020) return '2020s';
  if (year >= 2010) return '2010s';
  if (year >= 2000) return '2000s';
  if (year >= 1990) return '1990s';
  if (year >= 1980) return '1980s';
  if (year >= 1900) return '1970s';
  return undefined;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(tokens: string[], candidate: string): number {
  const c = norm(candidate).split(' ');
  if (c.length === 0) return 0;
  const hit = tokens.filter((t) => t.length > 2 && c.includes(t)).length;
  return hit / Math.max(1, c.length);
}

async function searchItunes(title: string, artistHint?: string, country = 'IN'): Promise<MetadataResult | null> {
  const queries = [artistHint ? `${title} ${artistHint}` : title, title];
  for (const q of queries) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&country=${country}&limit=8`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) continue;
    const data: {
      results?: Array<{
        trackName: string;
        artistName: string;
        collectionName?: string;
        releaseDate?: string;
        primaryGenreName?: string;
        artworkUrl100?: string;
      }>;
    } = await r.json();
    const res = data?.results ?? [];
    if (res.length === 0) continue;
    const tokens = norm(q).split(' ').filter((t) => t.length > 2);
    let best: { s: number; m: MetadataResult } | null = null;
    for (const t of res) {
      if (!t.trackName) continue;
      const s = score(tokens, t.trackName);
      if (s < 0.25) continue;
      const m: MetadataResult = {
        artist: t.artistName,
        album: t.collectionName && t.collectionName !== t.trackName ? t.collectionName : undefined,
        year: t.releaseDate ? new Date(t.releaseDate).getFullYear() : undefined,
        genre: mapGenre(t.primaryGenreName ?? '') || undefined,
        artwork: t.artworkUrl100 ? t.artworkUrl100.replace('100x100', '600x600') : undefined
      };
      if (!best || s > best.s) best = { s, m };
    }
    if (best) return best.m;
  }
  return null;
}

let lastBrainzCall = 0;
async function throttleBrainz(): Promise<void> {
  const elapsed = Date.now() - lastBrainzCall;
  if (elapsed < 1100) await new Promise((res) => setTimeout(res, 1100 - elapsed));
  lastBrainzCall = Date.now();
}

async function searchMusicBrainz(title: string, artistHint?: string): Promise<MetadataResult | null> {
  await throttleBrainz();
  const cleanTitle = title.replace(/[()]/g, '').trim();
  const query = artistHint
    ? `recording:"${encodeURIComponent(cleanTitle)}" AND artist:"${encodeURIComponent(artistHint)}"`
    : `recording:"${encodeURIComponent(cleanTitle)}"`;
  const url = `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json&limit=3`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) return null;
  const data = (await r.json()) as {
    recordings?: Array<{
      title: string;
      'artist-credit'?: Array<{ name?: string }>;
      releases?: Array<{ title?: string; date?: string }>;
    }>;
  };
  const rec = data?.recordings?.[0];
  if (!rec || !rec.title) return null;
  const rel = rec.releases?.[0];
  return {
    artist: rec['artist-credit']?.[0]?.name ?? artistHint,
    album: rel?.title ?? undefined,
    year: rel?.date ? Number.parseInt(rel.date.slice(0, 4), 10) || undefined : undefined
  };
}

/**
 * Best-effort metadata lookup for an imported song (no API keys required).
 * iTunes Search first (rich fields, CORS-friendly), MusicBrainz as fallback.
 */
export async function lookupMetadata(title: string, artistHint?: string): Promise<MetadataResult | null> {
  try {
    const it = await searchItunes(title, artistHint);
    if (it) return it;
  } catch {
    /* fall through to MusicBrainz */
  }
  try {
    return await searchMusicBrainz(title, artistHint);
  } catch {
    return null;
  }
}
