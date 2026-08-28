import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';

const RAW_URL = 'https://raw.githubusercontent.com/romaanchak-Rishabh/Vispr-Accessible_Music/main/tunnel.txt';
const POLL_MS = 60_000;

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

/**
 * Pull the current tunnel URL from git and apply it to Settings.
 * Only ever overwrites the saved server when it is empty or a trycloudflare
 * host — a custom server the user typed is left untouched.
 */
/** True when the whole app itself is served through a Cloudflare quick tunnel. */
function isTunnelHostedApp(): boolean {
  try {
    return location.hostname.endsWith('.trycloudflare.com');
  } catch {
    return false;
  }
}

export async function syncTunnelUrl(): Promise<void> {
  const { ytdlpServer, setYtdlpServer } = useSettings.getState();
  const cur = (ytdlpServer ?? '').trim().replace(/\/+$/, '');
  const curHost = hostOf(cur);
  const isStaleTunnel = !!curHost && curHost.endsWith('.trycloudflare.com');

  // When the app is hosted on a stable deployment (e.g. Vercel) the extract
  // API is same-origin, so the app must call /api/... directly instead of a
  // churning quick-tunnel URL. Clear any previously-persisted tunnel URL so
  // imports keep working even after the laptop tunnel dies.
  if (!isTunnelHostedApp()) {
    if (isStaleTunnel) {
      setYtdlpServer('');
      useUI.getState().showToast('Using app-hosted API — no tunnel needed');
    }
    return;
  }

  try {
    const latest = await fetchLatestTunnel();
    if (!latest) return;
    if (cur === latest) return;
    const isManaged = cur === '' || isStaleTunnel;
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