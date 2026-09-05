import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { startTunnelSync } from './lib/tunnelSync';
import { useLibrary } from './store/library';
import { usePlayer } from './store/player';
import { applyAppearance, useSettings } from './store/settings';
import { useUI } from './store/ui';
import type { Track } from './types';
import { TabBar } from './components/TabBar';
import { MiniPlayer } from './components/MiniPlayer';
import { NowPlayingSheet } from './components/NowPlayingSheet';
import { QueueSheet } from './components/QueueSheet';
import { ActionSheet } from './components/ActionSheet';
import { Sidebar } from './components/Sidebar';
import { DesktopPlayerBar } from './components/DesktopPlayerBar';
import { InstallBanner } from './components/InstallBanner';
import { Toast } from './components/Toast';
import { PageRouter } from './components/PageRouter';
import { ReceiveSheet } from './components/ReceiveSheet';
import { DownloadStatusBar } from './components/DownloadStatusBar';
import { BatchBar } from './components/BatchBar';
import { ChevronLeftIcon } from './components/Icons';

function requestNotificationPermission(): void {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function sendServerUpNotification(): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('Server is back online', {
        body: 'Open the app to resume downloading your music.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'server-up',
      });
    } catch {
      /* PWA or secure context required */
    }
  }
}

async function pingServer(server: string): Promise<boolean> {
  if (!server) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${server.replace(/\/+$/, '')}/api/ping`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

function pageTitle(): string {
  const page = useUI.getState().pageStack[useUI.getState().pageStack.length - 1];
  const lib = useLibrary.getState();
  switch (page.type) {
    case 'listen':
      return 'Listen Now';
    case 'forYou':
      return 'For You';
    case 'browse':
      return 'Browse';
    case 'library':
      return 'Library';
    case 'search':
      return 'Search';
    case 'album': {
      const album = lib.albums.find((a) => a.key === page.key);
      return album?.title ?? 'Album';
    }
    case 'artist':
      return page.name;
    case 'playlist': {
      const pl = lib.playlists.find((p) => p.id === page.id);
      return pl?.name ?? 'Playlist';
    }
    case 'settings':
      return 'Settings';
    case 'mix-detail':
      return page.title;
  }
}

export default function App(): JSX.Element {
  const isDesktop = useMediaQuery('(min-width: 900px)');
  const init = useLibrary((s) => s.init);
  const pageStack = useUI((s) => s.pageStack);
  const goBack = useUI((s) => s.goBack);
  const hasQueue = usePlayer((s) => s.queue.length > 0);
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  void useAudioEngine();
  void useKeyboardShortcuts();

  // apply persisted appearance on startup and on every change
  useEffect(() => {
    applyAppearance(theme, accent);
  }, [theme, accent]);

  // keep the backend server URL in sync with the published (auto-healed) tunnel
  useEffect(() => startTunnelSync(), []);

  // Request notification permission on mount + on first click (PWAs need user gesture)
  useEffect(() => {
    requestNotificationPermission();
    const handleClick = (): void => { requestNotificationPermission(); };
    document.addEventListener('click', handleClick, { once: true });
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Periodic server health check — toast + notification on status change (up ↔ down)
  const showToast = useUI((s) => s.showToast);
  const serverRef = useRef<boolean | null>(null); // null = unknown, true = up, false = down
  useEffect(() => {
    let active = true;
    const check = async () => {
      const server = useSettings.getState().ytdlpServer;
      if (!server) { serverRef.current = null; return; }
      const up = await pingServer(server);
      if (!active) return;
      const prev = serverRef.current;
      serverRef.current = up;
      if (prev === null) {
        if (!up) showToast('Server offline');
      } else if (prev !== up) {
        showToast(up ? 'Server is up' : 'Server offline');
        if (up) sendServerUpNotification();
      }
    };
    void check();
    const id = setInterval(check, 10_000);
    return () => { active = false; clearInterval(id); };
  }, [showToast]);

  // Handle share_target (Android/Chrome PWA share target)
  const shareTargetFiles = useUI((s) => s.receiveFiles);
  const setShareTargetFiles = useUI((s) => s.setReceiveFiles);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('share-target') !== null) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Handle file_handlers — .vpr file opened from OS file manager / WhatsApp / etc.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof window !== 'undefined' && 'launchQueue' in window) {
      // launchQueue API: https://developer.chrome.com/docs/web-platform/launch-handler
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lq = (window as any).launchQueue;
      if (lq && typeof lq.setConsumer === 'function') {
        lq.setConsumer(async (params: { files: Array<{ getFile: () => Promise<File> }> }) => {
          if (!params.files || params.files.length === 0) return;
          const files = await Promise.all(params.files.map((entry) => entry.getFile()));
          useUI.getState().setReceiveFiles(files);
        });
      }
    }
  }, []);

  useEffect(() => {
    void init().then(() => {
      // Re-attach live track data (artwork, durations) to the restored player session
      const { byId } = useLibrary.getState();
      const p = usePlayer.getState();
      const fix = (t: Track): Track => byId[t.id] ?? t;
      if (p.queue.length > 0) {
        usePlayer.setState({
          queue: p.queue.map(fix),
          originalQueue: p.originalQueue.map(fix),
          recentlyPlayed: p.recentlyPlayed.map((e) => ({ ...e, track: byId[e.track.id] ?? e.track }))
        });
      }
    });
  }, [init]);

  const title = pageTitle();
  const canGoBack = pageStack.length > 1;

  if (isDesktop) {
    return (
      <div className="app-desktop">
        <Sidebar />
        <div className="desktop-main">
          <DesktopPlayerBar />
          <div className="desktop-scroll">
            {canGoBack && (
              <button
                className="navbar-btn"
                style={{ padding: '10px 0' }}
                onClick={goBack}
                aria-label="Back"
              >
                <ChevronLeftIcon size={22} />
              </button>
            )}
            <div className="desktop-content-max">
              <PageRouter />
            </div>
          </div>
        </div>
        <QueueSheet />
        <ActionSheet />
        <DownloadStatusBar />
        <BatchBar />
        <Toast />
        {shareTargetFiles && <ReceiveSheet files={shareTargetFiles} onClose={() => setShareTargetFiles(null)} />}
      </div>
    );
  }

  return (
    <div className="app-mobile">
      <div className="content-scroll" style={{ paddingBottom: hasQueue ? 150 : 80 }}>
        <header className="navbar">
          <div className="navbar-inner">
            {canGoBack ? (
              <button className="navbar-btn" onClick={goBack} aria-label="Back">
                <ChevronLeftIcon size={24} />
              </button>
            ) : (
              <span style={{ width: 44 }} />
            )}
            <span className="navbar-title">{title}</span>
            <span style={{ width: 44 }} />
          </div>
        </header>
        <PageRouter />
      </div>

      <MiniPlayer />
      <TabBar />

      <NowPlayingSheet />
      <QueueSheet />
      <ActionSheet />
      <DownloadStatusBar />
      <BatchBar />
      <InstallBanner />
      <Toast />
      {shareTargetFiles && <ReceiveSheet files={shareTargetFiles} onClose={() => setShareTargetFiles(null)} />}
    </div>
  );
}
