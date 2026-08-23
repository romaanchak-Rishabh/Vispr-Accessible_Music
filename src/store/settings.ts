import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SettingsState {
  ytdlpServer: string;
  ytdlpToken: string;
  setYtdlpServer: (url: string) => void;
  setYtdlpToken: (token: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ytdlpServer: '',
      ytdlpToken: '',
      setYtdlpServer: (ytdlpServer) => set({ ytdlpServer: ytdlpServer.trim().replace(/\/+$/, '') }),
      setYtdlpToken: (ytdlpToken) => set({ ytdlpToken: ytdlpToken.trim() })
    }),
    { name: 'app-settings', storage: createJSONStorage(() => localStorage) }
  )
);
