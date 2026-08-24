import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemeMode = 'system' | 'light' | 'dark';

export const ACCENTS = [
  { id: 'red', label: 'Red', color: '#fa233b' },
  { id: 'blue', label: 'Blue', color: '#0a84ff' },
  { id: 'purple', label: 'Purple', color: '#bf5af2' },
  { id: 'pink', label: 'Pink', color: '#ff375f' },
  { id: 'green', label: 'Green', color: '#30d158' },
  { id: 'orange', label: 'Orange', color: '#ff9f0a' }
] as const;

export type AccentId = (typeof ACCENTS)[number]['id'];

interface SettingsState {
  ytdlpServer: string;
  ytdlpToken: string;
  confirmImport: boolean;
  youtubeApiKey: string;
  theme: ThemeMode;
  accent: AccentId;
  setYtdlpServer: (url: string) => void;
  setYtdlpToken: (token: string) => void;
  setConfirmImport: (confirm: boolean) => void;
  setYoutubeApiKey: (key: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setAccent: (accent: AccentId) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ytdlpServer: '',
      ytdlpToken: '',
      confirmImport: true,
      youtubeApiKey: '',
      theme: 'system',
      accent: 'red',
      setYtdlpServer: (ytdlpServer) => set({ ytdlpServer: ytdlpServer.trim().replace(/\/+$/, '') }),
      setYtdlpToken: (ytdlpToken) => set({ ytdlpToken: ytdlpToken.trim() }),
      setConfirmImport: (confirmImport) => set({ confirmImport }),
      setYoutubeApiKey: (youtubeApiKey) => set({ youtubeApiKey: youtubeApiKey.trim() }),
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent })
    }),
    { name: 'app-settings', storage: createJSONStorage(() => localStorage) }
  )
);

/** Apply the persisted appearance settings to the document root. Safe to call on every change. */
export function applyAppearance(theme: ThemeMode, accent: AccentId): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
  if (!accent || accent === 'red') root.removeAttribute('data-accent');
  else root.dataset.accent = accent;
}
