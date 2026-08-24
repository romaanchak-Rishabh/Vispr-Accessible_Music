import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SettingsState {
  ytdlpServer: string;
  ytdlpToken: string;
  confirmImport: boolean;
  setYtdlpServer: (url: string) => void;
  setYtdlpToken: (token: string) => void;
  setConfirmImport: (confirm: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ytdlpServer: '',
      ytdlpToken: '',
      confirmImport: true,
      setYtdlpServer: (ytdlpServer) => set({ ytdlpServer: ytdlpServer.trim().replace(/\/+$/, '') }),
      setYtdlpToken: (ytdlpToken) => set({ ytdlpToken: ytdlpToken.trim() }),
      setConfirmImport: (confirmImport) => set({ confirmImport })
    }),
    { name: 'app-settings', storage: createJSONStorage(() => localStorage) }
  )
);
