import { useEffect } from 'react';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import type { Track } from '../types';

const FADE_MS = 2000;

/**
 * Dual-element audio engine.
 * - One element is "active" (slot cur); the other is used to pre-start the next
 *   track during a crossfade, so the two overlap smoothly with no silence gap.
 */
export function registerMediaSession(track: Track): void {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.artwork ? [{ src: track.artwork, sizes: '512x512', type: 'image/jpeg' }] : []
    });
  } catch {
    /* ignore */
  }
}

export function useAudioEngine(): void {
  useEffect(() => {
    const els: [HTMLAudioElement, HTMLAudioElement] = [new Audio(), new Audio()];
    els.forEach((a) => {
      a.preload = 'auto';
    });
    const urls: (string | null)[] = [null, null];
    const loadedFor: (string | null)[] = [null, null];
    let cur = 0;
    let lastNonce = -1;
    let lastQueueId: string | null = usePlayer.getState().queue[usePlayer.getState().index]?.id ?? null;
    let lastPlaying = usePlayer.getState().isPlaying;

    // crossfade state
    let fading = false;
    let fadeRaf = 0;
    let fadeTargetId: string | null = null;

    const revokeSlot = (slot: number): void => {
      if (urls[slot]) {
        URL.revokeObjectURL(urls[slot]!);
        urls[slot] = null;
      }
    };

    const applyVol = (v: number): void => {
      els[cur].volume = Math.max(0, Math.min(1, v));
    };

    // keeps the lockscreen/notification scrubber in sync
    const syncPositionState = (): void => {
      const a = els[cur];
      if (!('mediaSession' in navigator) || !a.duration || !isFinite(a.duration)) return;
      try {
        navigator.mediaSession.setPositionState({
          duration: a.duration,
          playbackRate: a.playbackRate,
          position: Math.max(0, Math.min(a.currentTime, a.duration))
        });
      } catch {
        /* unsupported */
      }
    };

    const abortFade = (): void => {
      if (!fading) return;
      cancelAnimationFrame(fadeRaf);
      const other = els[cur === 0 ? 1 : 0];
      other.pause();
      applyVol(usePlayer.getState().volume);
      fading = false;
      fadeTargetId = null;
    };

    const onLoaded = (e: Event): void => {
      if ((e.currentTarget as HTMLAudioElement) !== els[cur]) return;
      usePlayer.getState().setDuration(els[cur].duration || 0);
      syncPositionState();
    };

    const onEnded = (e: Event): void => {
      if ((e.currentTarget as HTMLAudioElement) !== els[cur]) return; // stale fade-out element
      usePlayer.getState().next(true);
    };

    const onTimeUpdate = (e: Event): void => {
      const a = e.currentTarget as HTMLAudioElement;
      if (a !== els[cur]) return;
      const st = usePlayer.getState();
      if (!st.seekTo) st.setCurrentTime(a.currentTime);
      syncPositionState();
      maybeStartFade(a);
    };

    const onError = (e: Event): void => {
      if ((e.currentTarget as HTMLAudioElement) !== els[cur]) return;
      const a = els[cur];
      console.warn('[audio] media error:', a.error?.code, a.error?.message);
      const st = usePlayer.getState();
      if (st.isPlaying) setTimeout(() => st.next(false), 300);
    };

    els.forEach((a) => {
      a.addEventListener('loadedmetadata', onLoaded);
      a.addEventListener('ended', onEnded);
      a.addEventListener('timeupdate', onTimeUpdate);
      a.addEventListener('error', onError);
    });

    const startFade = async (nextTrack: Track): Promise<void> => {
      fading = true;
      fadeTargetId = nextTrack.id;
      const slot = cur === 0 ? 1 : 0;
      const other = els[slot];
      try {
        const file = await useLibrary.getState().resolveFile(nextTrack.id);
        if (!file || !fading) {
          fading = false;
          fadeTargetId = null;
          return;
        }
        revokeSlot(slot);
        urls[slot] = URL.createObjectURL(file);
        other.src = urls[slot]!;
        other.volume = 0;
        loadedFor[slot] = nextTrack.id;
        registerMediaSession(nextTrack);
        other.load();
        await other.play();
      } catch {
        console.warn('[audio] crossfade start failed');
        if (fadeTargetId === nextTrack.id) {
          fading = false;
          fadeTargetId = null;
        }
        return;
      }

      const t0 = performance.now();
      const step = (t: number): void => {
        if (!fading || fadeTargetId !== nextTrack.id) return;
        const k = Math.min(1, (t - t0) / FADE_MS);
        const v = usePlayer.getState().volume;
        other.volume = Math.max(0, Math.min(1, v * k));
        els[cur].volume = Math.max(0, Math.min(1, v * (1 - k)));
        if (k < 1) {
          fadeRaf = requestAnimationFrame(step);
          return;
        }
        // swap roles
        const oldEl = els[cur];
        oldEl.pause();
        loadedFor[cur] = null;
        revokeSlot(cur);
        cur = slot;
        loadedFor[cur] = nextTrack.id;
        lastQueueId = nextTrack.id;
        applyVol(usePlayer.getState().volume);
        fading = false;
        fadeTargetId = null;
        // advance player state without reloading audio (already loaded & playing)
        usePlayer.getState().next(true);
      };
      fadeRaf = requestAnimationFrame(step);
    };

    const maybeStartFade = (a: HTMLAudioElement): void => {
      if (fading) return;
      const st = usePlayer.getState();
      if (!st.crossfade || !st.isPlaying || st.repeat === 'one') return;
      if (!a.duration || !isFinite(a.duration)) return;
      const remaining = a.duration - a.currentTime;
      if (remaining > FADE_MS / 1000 + 0.15 || a.duration < (FADE_MS * 2.5) / 1000) return;
      const hasNext = st.index < st.queue.length - 1 || st.repeat === 'all';
      if (!hasNext) return;
      const nextIndex = st.index < st.queue.length - 1 ? st.index + 1 : 0;
      const nextTrack = st.queue[nextIndex];
      if (!nextTrack) return;
      void startFade(nextTrack);
    };

    const checking = { busy: false, rerun: false };
    const check = async (): Promise<void> => {
      // guard against overlapping runs: timeupdate ticks fire this constantly,
      // and concurrent runs race the file-load for a newly selected track
      if (checking.busy) {
        checking.rerun = true;
        return;
      }
      checking.busy = true;
      try {
        await runCheck();
      } finally {
        checking.busy = false;
        if (checking.rerun) {
          checking.rerun = false;
          void check();
        }
      }
    };

    const runCheck = async (): Promise<void> => {
      const st = usePlayer.getState();

      // any manual intervention during a fade hard-cuts to the new intent
      if (fading && (!st.isPlaying || st.seekTo || (st.queue[st.index]?.id ?? null) !== fadeTargetId)) {
        abortFade();
      }

      // apply pending seek
      if (st.seekTo && st.seekTo.nonce !== lastNonce) {
        lastNonce = st.seekTo.nonce;
        if (isFinite(st.seekTo.time)) els[cur].currentTime = st.seekTo.time;
        usePlayer.setState({ currentTime: st.seekTo?.time ?? st.currentTime, seekTo: null });
        return;
      }

      const track = st.queue[st.index];
      const trackId = track?.id ?? null;

      if (trackId !== loadedFor[cur] && track) {
        const file = await useLibrary.getState().resolveFile(track.id);
        if (file && !fading) {
          revokeSlot(cur);
          urls[cur] = URL.createObjectURL(file);
          els[cur].src = urls[cur]!;
          loadedFor[cur] = trackId;
          registerMediaSession(track);
          els[cur].load();
        } else if (!file) {
          console.warn('[audio] could not resolve file for track:', track.id, track.title);
        }
      }

      const playState = st.isPlaying && !!track;
      if (playState !== lastPlaying || (trackId !== lastQueueId && track)) {
        lastPlaying = playState;
        lastQueueId = trackId;
        if (playState) {
          applyVol(st.volume);
          try {
            await els[cur].play();
          } catch (err) {
            console.warn('[audio] play() rejected:', err);
          }
        } else {
          els[cur].pause();
        }
      }

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = playState ? 'playing' : 'paused';
      }
    };

    void check();

    const unsub = usePlayer.subscribe((state, prev) => {
      if (state.volume !== prev.volume && !fading) applyVol(state.volume);
      // currentTime updates fire many times per second; only re-run the full
      // engine check when something that can change playback actually changed
      const significant =
        state.queue !== prev.queue ||
        state.index !== prev.index ||
        state.isPlaying !== prev.isPlaying ||
        state.seekTo?.nonce !== prev.seekTo?.nonce;
      if (significant) void check();
    });

    // Media session action handlers (lock screen / notification controls)
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      const setHandler = (action: MediaSessionAction, fn: MediaSessionActionHandler): void => {
        try {
          ms.setActionHandler(action, fn);
        } catch {
          /* unsupported action */
        }
      };
      setHandler('play', () => usePlayer.getState().resume());
      setHandler('pause', () => usePlayer.getState().pause());
      setHandler('nexttrack', () => usePlayer.getState().next(false));
      setHandler('previoustrack', () => usePlayer.getState().previous());
      setHandler('seekforward', () => usePlayer.getState().skipForward(5));
      setHandler('seekbackward', () => usePlayer.getState().skipBackward(5));
      setHandler('seekto', (details) => {
        if (details.seekTime != null) usePlayer.getState().seek(details.seekTime);
      });
    }

    return () => {
      unsub();
      abortFade();
      els.forEach((a, i) => {
        a.removeEventListener('loadedmetadata', onLoaded);
        a.removeEventListener('ended', onEnded);
        a.removeEventListener('timeupdate', onTimeUpdate);
        a.removeEventListener('error', onError);
        a.pause();
        a.removeAttribute('src');
        revokeSlot(i);
      });
      loadedFor[0] = null;
      loadedFor[1] = null;
      cur = 0;
    };
  }, []);
}
