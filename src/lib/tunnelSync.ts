import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';

const RAW_URL = 'https://raw.githubusercontent.com/romaanchak-Rishabh/Vispr-Accessible_Music/main/tunnel.txt';
const POLL_MS = 30_000;
const HEALTH_TIMEOUT = 8_000;

function hostOf(u: string): string | null {
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
}

async function fetchLatestTunnel(): Promise<string> {
  const r = await fetch(RAW_URL, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = (await r.text()).replace(/^\uFEFF/, '');
  const u = text.split(/\r?\n/)[0].trim();
  if (!u) return '';
  const host = hostOf(u);
  if (!host || !host.endsWith('.trycloudflare.com')) return '';
  return u.replace(/\/+$/, '');
}

async function isTunnelAlive(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT);
    const r = await fetch(`${url}/api/ping`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Pull the current tunnel URL from git and apply it to Settings.
 * Also health-checks the current tunnel — if dead, immediately
 * fetches the latest from GitHub and switches.
 */
export async function syncTunnelUrl(): Promise<void> {
  try {
    const { ytdlpServer, setYtdlpServer } = useSettings.getState();
    const cur = (ytdlpServer ?? '').trim().replace(/\/+$/, '');
    const curHost = hostOf(cur);
    const isManaged = !!curHost && curHost.endsWith('.trycloudflare.com');

    // If we have a managed URL, health-check it first
    if (isManaged && cur) {
      const alive = await isTunnelAlive(cur);
      if (alive) return; // current tunnel is fine, no update needed
      // Tunnel is dead — fall through to fetch latest from GitHub
    }

    // Fetch latest from GitHub
    const latest = await fetchLatestTunnel();
    if (!latest) return;
    if (cur === latest) return;
    if (!isManaged) return;

    setYtdlpServer(latest);
    useUI.getState().showToast('Backend tunnel updated automatically');
  } catch {
    /* offline / not published yet — retry on next tick */
  }
}

export function startTunnelSync(): () => void {
  void syncTunnelUrl();
  const id = window.setInterval(() => void syncTunnelUrl(), POLL_MS);
  const onVis = (): void => {
    if (document.visibilityState === 'visible') void syncTunnelUrl();
  };
  document.addEventListener('visibilitychange', onVis);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVis);
  };
}
