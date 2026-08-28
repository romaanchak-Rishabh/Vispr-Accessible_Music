export interface YtItem {
  id: string;
  title?: string;
  webpage_url?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  playlist_title?: string;
}

import { useSettings } from '../store/settings';
import { fetchLatestTunnel } from './tunnelSync';

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

/**
 * Runs fn() with the current ytdlpServer. If it throws a network-level failure
 * (the tunnel went stale / died), refresh the tunnel URL from git and retry
 * once. This closes the gap between a quick-tunnel restart and the next 60s poll.
 */
async function withTunnelRetry<T>(fn: (server: string, token: string) => Promise<T>): Promise<T> {
  const { ytdlpServer, ytdlpToken, setYtdlpServer } = useSettings.getState();
  let server = ytdlpServer ?? '';
  const token = ytdlpToken ?? '';
  try {
    return await fn(server, token);
  } catch (err) {
    const netErr =
      err instanceof TypeError ||
      ((err as { message?: string })?.message ?? '').includes('Failed to fetch') ||
      ((err as { message?: string })?.message ?? '').includes('NetworkError');
    if (!netErr) throw err;
    try {
      const latest = await fetchLatestTunnel();
      if (latest && latest !== effectiveServer(server)) {
        setYtdlpServer(latest);
        server = latest;
        return await fn(server, token);
      }
    } catch {
      /* tunnel refresh failed — surface original error */
    }
    throw err;
  }
}

function effectiveServer(s: string): string {
  return s.trim().replace(/\/+$/, '');
}

export function effectiveServerBase(server: string): string {
  let s = server.trim().replace(/\/+$/, '');
  // Ensure https:// for Cloudflare tunnels and similar
  if (s && !s.startsWith('http://') && !s.startsWith('https://')) {
    s = 'https://' + s;
  }
  return s;
}

export async function resolveViaYtDlp(_server: string, _token: string, url: string): Promise<YtItem[]> {
  return withTunnelRetry(async (srv, tok) => {
    const base = effectiveServerBase(srv);
    const resp = await fetchWithTimeout(`${base}/api/resolve`, {
      method: 'POST',
      headers: authHeaders(tok),
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
  });
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
