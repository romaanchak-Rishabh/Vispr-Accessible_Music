import { create } from 'zustand';
import type { Track } from '../types';

export type Page =
  | { type: 'listen' }
  | { type: 'forYou' }
  | { type: 'browse' }
  | { type: 'library'; section?: 'playlists' | 'artists' | 'albums' | 'songs' | 'recent' }
  | { type: 'search' }
  | { type: 'album'; key: string }
  | { type: 'artist'; name: string }
  | { type: 'playlist'; id: string }
  | { type: 'mix-detail'; id: string; title: string; subtitle: string; icon: React.ReactNode; gradient: string; tracks: Track[] }
  | { type: 'settings' };

interface UIState {
  tab: 'listen' | 'forYou' | 'browse' | 'library' | 'search' | 'settings';
  pageStack: Page[];
  showNowPlaying: boolean;
  showQueue: boolean;
  actionSheetTrackId: string | null;
  installBannerDismissed: boolean;
  toast: { msg: string; nonce: number } | null;
  receiveFiles: File[] | null;
  multiSelectIds: string[];
  isMultiSelect: boolean;

  setTab: (tab: UIState['tab']) => void;
  navigate: (page: Page) => void;
  goBack: () => void;
  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  toggleQueue: () => void;
  setActionSheet: (trackId: string | null) => void;
  dismissInstall: () => void;
  showToast: (msg: string) => void;
  setReceiveFiles: (files: File[] | null) => void;
  toggleMultiSelect: (trackId?: string) => void;
  clearMultiSelect: () => void;
}

export const useUI = create<UIState>((set, get) => ({
  tab: 'listen',
  pageStack: [{ type: 'listen' }],
  showNowPlaying: false,
  showQueue: false,
  actionSheetTrackId: null,
  installBannerDismissed: false,
  toast: null,
  receiveFiles: null,
  multiSelectIds: [],
  isMultiSelect: false,

  setTab: (tab) =>
    set({
      tab,
      pageStack: [
        tab === 'listen'
          ? { type: 'listen' }
          : tab === 'forYou'
            ? { type: 'forYou' }
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
      if (top.type === page.type) {
        // For library pages, compare section since they lack key/id/name
        if (top.type === 'library' && page.type === 'library') {
          if (top.section === page.section) return;
        } else {
          const aKey = 'key' in top ? top.key : 'id' in top ? top.id : 'name' in top ? top.name : null;
          const bKey = 'key' in page ? page.key : 'id' in page ? page.id : 'name' in page ? page.name : null;
          if (aKey === bKey) return;
        }
      }
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
    const nonce = Date.now();
    set({ toast: { msg, nonce } });
    window.setTimeout(() => {
      const t = get().toast;
      if (t && t.nonce === nonce) set({ toast: null });
    }, 2200);
  },

  setReceiveFiles: (files) => set({ receiveFiles: files }),

  toggleMultiSelect: (trackId) => {
    const { isMultiSelect, multiSelectIds } = get();
    if (trackId === undefined) {
      // Toggle multi-select mode on/off
      if (isMultiSelect) {
        set({ isMultiSelect: false, multiSelectIds: [] });
      } else {
        set({ isMultiSelect: true });
      }
      return;
    }
    // Toggle a specific track
    const next = multiSelectIds.includes(trackId)
      ? multiSelectIds.filter((id) => id !== trackId)
      : [...multiSelectIds, trackId];
    set({ multiSelectIds: next, isMultiSelect: next.length > 0 || isMultiSelect });
  },

  clearMultiSelect: () => set({ isMultiSelect: false, multiSelectIds: [] }),
}));
