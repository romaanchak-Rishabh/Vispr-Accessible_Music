import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Track, HistoryEntry } from '../types';
import { useUI } from './ui';

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  queue: Track[];
  originalQueue: Track[];
  index: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  crossfade: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  seekTo: { time: number; nonce: number } | null;
  contextName: string | null;
  recentlyPlayed: HistoryEntry[];
  playCounts: Record<string, number>;

  playTracks: (tracks: Track[], startIndex?: number, contextName?: string) => void;
  playTrackNext: (track: Track) => void;
  playTrackLater: (track: Track) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  next: (auto?: boolean) => void;
  previous: () => void;
  seek: (time: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleCrossfade: () => void;
  removeFromQueue: (queueIndex: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearUpNext: () => void;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      originalQueue: [],
      index: 0,
      isPlaying: false,
      shuffle: false,
      repeat: 'off',
      crossfade: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      seekTo: null,
      contextName: null,
      recentlyPlayed: [],
      playCounts: {},

      playTracks: (tracks, startIndex = 0, contextName = undefined) => {
        if (tracks.length === 0) return;
        const startTrack = tracks[startIndex] ?? tracks[0];
        set({
          queue: [...tracks],
          originalQueue: [...tracks],
          index: Math.max(0, Math.min(startIndex, tracks.length - 1)),
          isPlaying: true,
          currentTime: 0,
          duration: 0,
          contextName: contextName ?? null,
          seekTo: { time: 0, nonce: Date.now() }
        });
        recordPlay(set, get, startTrack);
      },

      playTrackNext: (track) => {
        const { queue, index } = get();
        const filtered = queue.filter((t, i) => !(t.id === track.id && i !== index));
        const insertAt = index + 1;
        filtered.splice(insertAt, 0, track);
        set({ queue: filtered });
      },

      playTrackLater: (track) => {
        const { queue, index } = get();
        const filtered = queue.filter((t, i) => !(t.id === track.id && i !== index));
        filtered.push(track);
        set({ queue: filtered });
      },

      togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying && s.queue.length > 0 })),
      pause: () => set({ isPlaying: false }),
      resume: () => set((s) => ({ isPlaying: s.queue.length > 0 })),

      next: (auto = false) => {
        const { index, queue, repeat } = get();
        if (queue.length === 0) return;
        if (auto && repeat === 'one') {
          set({ currentTime: 0, seekTo: { time: 0, nonce: Date.now() }, isPlaying: true });
          return;
        }
        if (index < queue.length - 1) {
          const nextIndex = index + 1;
          set({ index: nextIndex, currentTime: 0, duration: 0, isPlaying: true, seekTo: { time: 0, nonce: Date.now() } });
          recordPlay(set, get, queue[nextIndex]);
        } else if (repeat === 'all') {
          set({ index: 0, currentTime: 0, duration: 0, isPlaying: true, seekTo: { time: 0, nonce: Date.now() } });
          recordPlay(set, get, queue[0]);
        } else {
          set({ isPlaying: false, currentTime: 0 });
          useUI
            .getState()
            .showToast(
              auto && queue.length > 1
                ? 'Queue finished — enable Repeat to loop it'
                : queue.length === 1
                  ? 'Only song in the queue'
                  : 'End of queue — nothing next'
            );
        }
      },

      previous: () => {
        const { index, queue, currentTime } = get();
        if (queue.length === 0) return;
        if (currentTime > 3 || index === 0) {
          if (index === 0 && currentTime <= 3) {
            useUI.getState().showToast(queue.length === 1 ? 'Only song in the queue' : 'Start of queue — nothing before this');
          }
          set({ currentTime: 0, seekTo: { time: 0, nonce: Date.now() }, isPlaying: true });
          return;
        }
        const prevIndex = index - 1;
        set({ index: prevIndex, currentTime: 0, duration: 0, isPlaying: true, seekTo: { time: 0, nonce: Date.now() } });
        recordPlay(set, get, queue[prevIndex]);
      },

      seek: (time) => set({ currentTime: time, seekTo: { time, nonce: Date.now() } }),

      skipForward: (seconds = 5) => {
        const { currentTime, duration } = get();
        const target = Math.min(currentTime + seconds, duration > 0 ? duration - 0.2 : currentTime + seconds);
        get().seek(target);
      },

      skipBackward: (seconds = 5) => {
        const { currentTime } = get();
        get().seek(Math.max(0, currentTime - seconds));
      },

      setCurrentTime: (t) => set({ currentTime: t }),
      setDuration: (d) => set({ duration: d }),
      setVolume: (v) => set({ volume: v }),

      toggleShuffle: () => {
        const { queue, originalQueue, index, shuffle } = get();
        if (queue.length === 0) return;
        if (!shuffle) {
          const current = queue[index];
          const rest = queue.filter((_, i) => i !== index);
          const shuffled = [current, ...shuffleArray(rest)];
          set({ shuffle: true, queue: shuffled, index: 0, originalQueue: originalQueue.length ? originalQueue : [...queue] });
        } else {
          const currentId = queue[index]?.id;
          const restored = [...originalQueue];
          let newIndex = restored.findIndex((t) => t.id === currentId);
          if (newIndex < 0) newIndex = 0;
          set({ shuffle: false, queue: restored, index: newIndex });
        }
      },

      cycleRepeat: () =>
        set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),

      toggleCrossfade: () => set((s) => ({ crossfade: !s.crossfade })),

      removeFromQueue: (queueIndex) => {
        const { queue, index } = get();
        if (queueIndex <= index || queueIndex >= queue.length) return;
        const newQueue = queue.filter((_, i) => i !== queueIndex);
        set({ queue: newQueue });
      },

      moveInQueue: (from, to) => {
        const { queue, index } = get();
        if (from <= index || to <= index) return;
        const newQueue = [...queue];
        const [moved] = newQueue.splice(from, 1);
        newQueue.splice(to, 0, moved);
        set({ queue: newQueue });
      },

      clearUpNext: () => {
        const { queue, index } = get();
        set({ queue: queue.slice(0, index + 1) });
      }
    }),
    {
      name: 'player-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        queue: s.queue.map(stripArtwork),
        originalQueue: s.originalQueue.map(stripArtwork),
        index: s.index,
        shuffle: s.shuffle,
        repeat: s.repeat,
        crossfade: s.crossfade,
        volume: s.volume,
        contextName: s.contextName,
        recentlyPlayed: s.recentlyPlayed,
        playCounts: s.playCounts
      })
    }
  )
);

type SetFn = (partial: Partial<PlayerState>) => void;

function stripArtwork(t: Track): Track {
  return { ...t, artwork: undefined };
}

function recordPlay(set: SetFn, _get: () => PlayerState, track: Track): void {
  const state = usePlayer.getState();
  // Strip artwork data-URLs from history snapshots to keep localStorage small;
  // UI re-resolves live artwork from the library by track id.
  const snapshot: Track = { ...track, artwork: undefined };
  const entry: HistoryEntry = { track: snapshot, playedAt: Date.now() };
  const recent = [entry, ...state.recentlyPlayed.filter((e) => e.track.id !== track.id)].slice(0, 100);
  const counts = { ...state.playCounts };
  counts[track.id] = (counts[track.id] ?? 0) + 1;
  set({ recentlyPlayed: recent, playCounts: counts });
}
