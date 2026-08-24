import { create } from 'zustand';

export type Page =
  | { type: 'listen' }
  | { type: 'browse' }
  | { type: 'library'; section?: 'playlists' | 'artists' | 'albums' | 'songs' | 'recent' }
  | { type: 'search' }
  | { type: 'album'; key: string }
  | { type: 'artist'; name: string }
  | { type: 'playlist'; id: string }
  | { type: 'settings' };

interface UIState {
  tab: 'listen' | 'browse' | 'library' | 'search' | 'settings';
  pageStack: Page[];
  showNowPlaying: boolean;
  showQueue: boolean;
  actionSheetTrackId: string | null;
  installBannerDismissed: boolean;
  toast: { msg: string; nonce: number } | null;

  setTab: (tab: UIState['tab']) => void;
  navigate: (page: Page) => void;
  goBack: () => void;
  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  toggleQueue: () => void;
  setActionSheet: (trackId: string | null) => void;
  dismissInstall: () => void;
  showToast: (msg: string) => void;
}

export const useUI = create<UIState>((set, get) => ({
  tab: 'listen',
  pageStack: [{ type: 'listen' }],
  showNowPlaying: false,
  showQueue: false,
  actionSheetTrackId: null,
  installBannerDismissed: false,
  toast: null,

  setTab: (tab) =>
    set({
      tab,
      pageStack: [
        tab === 'listen'
          ? { type: 'listen' }
          : tab === 'browse'
            ? { type: 'browse' }
            : tab === 'library'
              ? { type: 'library' }
              : tab === 'settings'
                ? { type: 'settings' }
                : { type: 'search' }
      ]
    }),

  navigate: (page) => {
    const stack = get().pageStack;
    if (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (JSON.stringify(top) === JSON.stringify(page)) return;
    }
    set({ pageStack: [...stack, page] });
    window.scrollTo(0, 0);
  },

  goBack: () => {
    const stack = get().pageStack;
    if (stack.length > 1) set({ pageStack: stack.slice(0, -1) });
  },

  openNowPlaying: () => set({ showNowPlaying: true }),
  closeNowPlaying: () => set({ showNowPlaying: false }),
  toggleQueue: () => set((s) => ({ showQueue: !s.showQueue })),
  setActionSheet: (trackId) => set({ actionSheetTrackId: trackId }),
  dismissInstall: () => set({ installBannerDismissed: true }),

  showToast: (msg) => {
    set({ toast: { msg, nonce: Date.now() } });
    window.setTimeout(() => {
      const t = get().toast;
      if (t && t.msg === msg) set({ toast: null });
    }, 2200);
  }
}));
