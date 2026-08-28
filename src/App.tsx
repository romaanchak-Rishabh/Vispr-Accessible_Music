import { useEffect } from 'react';
import type { JSX } from 'react';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useMediaQuery } from './hooks/useMediaQuery';
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
import { PullToRefresh } from './components/PullToRefresh';
import { ChevronLeftIcon } from './components/Icons';

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
  }
}

export default function App(): JSX.Element {
  const isDesktop = useMediaQuery('(min-width: 900px)');
  const init = useLibrary((s) => s.init);
  const rescanFolder = useLibrary((s) => s.rescanFolder);
  const pageStack = useUI((s) => s.pageStack);
  const goBack = useUI((s) => s.goBack);
  const showToast = useUI((s) => s.showToast);
  const hasQueue = usePlayer((s) => s.queue.length > 0);
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  void useAudioEngine();

  // apply persisted appearance on startup and on every change
  useEffect(() => {
    applyAppearance(theme, accent);
  }, [theme, accent]);

  // keep the backend server URL in sync with the published (auto-healed) tunnel
  useEffect(() => startTunnelSync(), []);

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

  // Pull-to-refresh: rescan the linked folder when one is connected, otherwise
  // reload the library from local storage (fast, safe, no data loss).
  const handleRefresh = async (): Promise<void> => {
    const didRescan = await rescanFolder();
    if (didRescan) showToast('Library rescanned');
    else {
      await init();
      showToast('Library refreshed');
    }
  };

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
        <Toast />
      </div>
    );
  }

  return (
    <div className="app-mobile">
      <PullToRefresh
        onRefresh={handleRefresh}
        style={{ paddingBottom: hasQueue ? 'calc(150px + env(safe-area-inset-bottom))' : 'calc(80px + env(safe-area-inset-bottom))' }}
      >
        <header className={`navbar ${canGoBack ? '' : 'navbar--large'}`}>
          <div className="navbar-inner">
            {canGoBack && (
              <button className="navbar-btn" onClick={goBack} aria-label="Back">
                <ChevronLeftIcon size={24} />
              </button>
            )}
            <span className="navbar-title">{title}</span>
            {canGoBack && <span style={{ width: 44 }} />}
          </div>
        </header>
        <PageRouter />
      </PullToRefresh>

      <MiniPlayer />
      <TabBar />

      <NowPlayingSheet />
      <QueueSheet />
      <ActionSheet />
      <InstallBanner />
      <Toast />
    </div>
  );
}
