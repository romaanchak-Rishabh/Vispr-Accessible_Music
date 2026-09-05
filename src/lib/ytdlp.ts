// ── In-memory search cache (avoids repeated API calls) ────────

interface SearchCacheEntry { query: string; results: YtSearchResult[]; ts: number }
const SEARCH_CACHE_TTL = 1000 * 60 * 30; // 30 min
const searchCache: SearchCacheEntry[] = [];

function getCachedSearchSync(query: string): YtSearchResult[] | null {
  const q = query.toLowerCase().trim();
  const entry = searchCache.find((c) => c.query === q);
  if (entry && Date.now() - entry.ts < SEARCH_CACHE_TTL) return entry.results;
  return null;
}

export function cacheSearchResults(query: string, results: YtSearchResult[]): void {
  const q = query.toLowerCase().trim();
  const idx = searchCache.findIndex((c) => c.query === q);
  const entry: SearchCacheEntry = { query: q, results, ts: Date.now() };
  if (idx >= 0) searchCache[idx] = entry;
  else searchCache.push(entry);
}

export interface YtItem {
  id: string;
  title?: string;
  webpage_url?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  playlist_title?: string;
}

export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

function authHeaders(token: string): HeadersInit {
  return token ? { 'X-Auth-Token': token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export function effectiveServerBase(server: string): string {
  let s = server.trim().replace(/\/+$/, '');
  if (s && !s.startsWith('http://') && !s.startsWith('https://')) {
    s = 'https://' + s;
  }
  return s;
}

// ---------------------------------------------------------------------------
// v2 endpoints — try these first, fall back to v1
// ---------------------------------------------------------------------------

async function tryV2Resolve(base: string, token: string, url: string): Promise<YtItem[] | null> {
  try {
    const endpoint = base ? `${base}/api/resolve_v2` : '/api/resolve_v2';
    const resp = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ url })
    }, 30_000);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { items?: YtItem[] };
    return data.items ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API — v2 first, v1 fallback
// ---------------------------------------------------------------------------

export async function resolveViaYtDlp(server: string, token: string, url: string): Promise<YtItem[]> {
  const base = effectiveServerBase(server);

  // Try v2 first
  const v2 = await tryV2Resolve(base, token, url);
  if (v2 !== null) return v2;

  // Fallback to v1
  const endpoint = base ? `${base}/api/resolve` : '/api/resolve';
  const resp = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ url })
  }, 30_000);
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      msg = ((await resp.json()) as { error?: string }).error ?? msg;
    } catch {
      /* keep default */
    }
    throw new Error(`Resolve failed: ${msg}`);
  }
  const data = (await resp.json()) as { items?: YtItem[] };
  return data.items ?? [];
}

export interface YtInfo {
  description?: string;
  tags?: string[];
  year?: number;
  artist?: string;
  title?: string;
}

/** Full (non-flat) extraction of a single video so we can read its description/tags/year. */
export async function fetchYtInfo(server: string, token: string, url: string): Promise<YtInfo | null> {
  const base = effectiveServerBase(server);
  try {
    const endpoint = base ? `${base}/api/info` : '/api/info';
    const resp = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ url })
    }, 25_000);
    if (!resp.ok) return null;
    return (await resp.json()) as YtInfo;
  } catch {
    return null;
  }
}

export async function downloadAudioViaYtDlp(
  server: string,
  token: string,
  videoUrl: string
): Promise<{ blob: Blob; ext: string; filename: string }> {
  const base = effectiveServerBase(server);

  // Download via yt-dlp only (v1 endpoint) — saves API tokens
  const endpoint = base ? `${base}/api/download` : '/api/download';
  const resp = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ url: videoUrl })
  }, 180_000);
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      msg = ((await resp.json()) as { error?: string }).error ?? msg;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  const blob = await resp.blob();
  const disposition = resp.headers.get('Content-Disposition') ?? '';
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  let filename = utf8Match ? decodeURIComponent(utf8Match[1]) : disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'song.m4a';
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'm4a';
  if (!/^[a-z0-9._ -]+$/i.test(filename)) filename = 'song.' + ext;
  return { blob, ext, filename };
}

// ---------------------------------------------------------------------------
// YouTube search (via server-side v2 endpoint)
// ---------------------------------------------------------------------------

export interface YtSearchResult {
  id: string;
  title: string;
  url: string;
  uploader: string;
  duration: number;
  thumbnail: string;
}

export async function searchYouTube(
  _server: string,
  token: string,
  query: string,
  limit: number = 10
): Promise<YtSearchResult[]> {
  // Check in-memory cache first (avoids API call)
  const cached = getCachedSearchSync(query);
  if (cached) return cached.slice(0, limit);

  // Search always uses same-origin Vercel API (RapidAPI), not the tunnel
  const url = '/api/search_v2';
  try {
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ query, limit })
    }, 15_000);
    if (!resp.ok) { console.warn(`[search] ${resp.status} from ${url}`); return []; }
    const data = (await resp.json()) as { results?: YtSearchResult[] };
    const results = data.results ?? [];
    if (results.length > 0) cacheSearchResults(query, results);
    return results;
  } catch (e) {
    console.warn('[search] failed:', e);
    return [];
  }
}
