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
export async function syncTunnelUrl(): Promise<void> {
  try {
    const latest = await fetchLatestTunnel();
    if (!latest) return;
    const { ytdlpServer, setYtdlpServer } = useSettings.getState();
    const cur = (ytdlpServer ?? '').trim().replace(/\/+$/, '');
    if (cur === latest) return;
    const curHost = hostOf(cur);
    const isManaged = cur === '' || (!!curHost && curHost.endsWith('.trycloudflare.com'));
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