import { useEffect } from 'react';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { useUI } from '../store/ui';

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // Ignore if typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const player = usePlayer.getState();
      const ui = useUI.getState();

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (player.queue.length > 0) player.togglePlay();
          break;
        case 'ArrowRight':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            player.next();
          } else {
            e.preventDefault();
            player.seek(Math.min(player.duration, player.currentTime + 10));
          }
          break;
        case 'ArrowLeft':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            player.previous();
          } else {
            e.preventDefault();
            player.seek(Math.max(0, player.currentTime - 10));
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.setVolume(Math.min(1, player.volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.setVolume(Math.max(0, player.volume - 0.05));
          break;
        case 'n':
          player.next();
          break;
        case 'p':
          player.previous();
          break;
        case 's':
          player.toggleShuffle();
          break;
        case 'r':
          player.cycleRepeat();
          break;
        case '/':
          e.preventDefault();
          ui.setTab('search');
          break;
        case 'Escape':
          if (ui.showNowPlaying) ui.closeNowPlaying();
          else if (ui.showQueue) ui.toggleQueue();
          else if (ui.actionSheetTrackId) ui.setActionSheet(null);
          break;
        case 'm':
          if (player.queue.length > 0) {
            ui.openNowPlaying();
          }
          break;
        case 'q':
          if (player.queue.length > 0) {
            ui.toggleQueue();
          }
          break;
        case 'f': {
          const trackId = ui.actionSheetTrackId ?? player.queue[player.index]?.id;
          if (trackId) {
            void useLibrary.getState().toggleFavourite(trackId);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
