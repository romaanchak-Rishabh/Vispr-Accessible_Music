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
  // Ensure https:// for Cloudflare tunnels and similar
  if (s && !s.startsWith('http://') && !s.startsWith('https://')) {
    s = 'https://' + s;
  }
  return s;
}

export async function resolveViaYtDlp(server: string, token: string, url: string): Promise<YtItem[]> {
  const base = effectiveServerBase(server);
  const resp = await fetchWithTimeout(`${base}/api/resolve`, {
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
    const resp = await fetchWithTimeout(`${base}/api/info`, {
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
  const resp = await fetchWithTimeout(`${base}/api/download`, {
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
