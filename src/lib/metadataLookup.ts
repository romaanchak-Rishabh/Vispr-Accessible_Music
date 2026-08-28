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

function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>, fallback: T): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fn(ctrl.signal).catch(() => fallback).finally(() => clearTimeout(timer));
}

async function searchItunes(title: string, artistHint?: string): Promise<MetadataResult | null> {
  const withHint = artistHint ? `${title} ${artistHint}` : '';
  const queries = withHint ? [withHint, title] : [title];
  // A single song may live in different stores' catalogues, so try a couple.
  // The caller applies an overall timeout bound, so this stays fast.
  const countries = ['IN', 'US'];
  const cands: Array<{ s: number; m: MetadataResult }> = [];
  for (const country of countries) {
    for (const q of queries) {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&country=${country}&limit=8`;
      // Short timeout — iTunes is fast and reliable; if a query stalls, move on
      // immediately rather than making the import feel stuck.
      const r = await withTimeout(3500, (signal) => fetch(url, { headers: { Accept: 'application/json' }, signal }), null);
      if (!r || !r.ok) continue;
      let data: {
        results?: Array<{
          trackName: string;
          artistName: string;
          collectionName?: string;
          releaseDate?: string;
          primaryGenreName?: string;
          artworkUrl100?: string;
        }>;
      } | null = null;
      try {
        data = (await r.json()) as {
          results?: Array<{
            trackName: string;
            artistName: string;
            collectionName?: string;
            releaseDate?: string;
            primaryGenreName?: string;
            artworkUrl100?: string;
          }>;
        };
      } catch {
        continue;
      }
      const res = data?.results ?? [];
      if (res.length === 0) continue;
      const tokens = norm(q).split(' ').filter((t) => t.length > 2);
      for (const t of res) {
        if (!t.trackName) continue;
        const s = score(tokens, t.trackName);
        if (s < 0.15) continue;
        cands.push({
          s,
          m: {
            artist: t.artistName,
            album: t.collectionName && t.collectionName !== t.trackName ? t.collectionName : undefined,
            year: t.releaseDate ? new Date(t.releaseDate).getFullYear() : undefined,
            genre: mapGenre(t.primaryGenreName ?? '') || undefined,
            artwork: t.artworkUrl100 ? t.artworkUrl100.replace('100x100', '600x600') : undefined
          }
        });
      }
    }
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.s - a.s);
  return cands[0].m;
}

/**
 * Best-effort metadata lookup for an imported song (no API keys required).
 *
 * Uses the iTunes Search API only. It is fast, CORS-friendly from the browser,
 * and returns rich fields (artist, album, year, genre, artwork) — everything
 * the import wizard needs. (MusicBrainz was dropped: it requires a special
 * User-Agent, is heavily rate-limited, and frequently hangs/timeouts, which
 * made the import feel stuck.)
 *
 * The whole lookup is bounded by a hard ~4.5s timeout so it never blocks the
 * user even if the network is slow or offline.
 */
export async function lookupMetadata(title: string, artistHint?: string): Promise<MetadataResult | null> {
  try {
    return await Promise.race([
      searchItunes(title, artistHint),
      new Promise<null>((res) => setTimeout(() => res(null), 4500))
    ]);
  } catch {
    return null;
  }
}
