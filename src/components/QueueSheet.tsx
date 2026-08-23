import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import type { Track } from '../types';
import { Artwork } from './Artwork';

const ROW_H = 56;

export function QueueSheet(): JSX.Element | null {
  const showQueue = useUI((s) => s.showQueue);
  const toggleQueue = useUI((s) => s.toggleQueue);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const contextName = usePlayer((s) => s.contextName);

  if (!showQueue) return null;

  const upNext = queue.slice(index + 1);
  const current = queue[index];

  return (
    <div className="sheet-overlay" onClick={toggleQueue}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <span style={{ width: 60 }} />
          <span className="sheet-title">Playing Next</span>
          <button style={{ width: 60, textAlign: 'right', color: 'var(--accent)', fontSize: 17 }} onClick={toggleQueue}>
            Done
          </button>
        </div>
        <div className="sheet-list">
          {queue.length === 0 && (
            <p style={{ padding: 30, textAlign: 'center', color: 'var(--label-secondary)' }}>Your queue is empty</p>
          )}
          {current && <QueueRow track={current} queueIndex={index} current />}
          {upNext.length > 0 && (
            <div className="section-header" style={{ paddingTop: 14, paddingBottom: 4 }}>
              {contextName ? `Next from ${contextName}` : 'Up Next'}
            </div>
          )}
          {upNext.map((track, i) => (
            <QueueRow key={`${track.id}-${i}`} track={track} queueIndex={index + 1 + i} />
          ))}
          {upNext.length === 0 && current && (
            <p style={{ padding: 24, textAlign: 'center', color: 'var(--label-secondary)', fontSize: 14 }}>
              Nothing else in your queue
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueRow({ track, queueIndex, current = false }: { track: Track; queueIndex: number; current?: boolean }): JSX.Element {
  const playTracks = usePlayer((s) => s.playTracks);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const moveInQueue = usePlayer((s) => s.moveInQueue);
  const setActionSheet = useUI((s) => s.setActionSheet);
  const index = usePlayer((s) => s.index);
  const queueLen = usePlayer((s) => s.queue.length);
  const dragRef = useRef<{ startY: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const handlePlay = (): void => {
    if (current) {
      usePlayer.getState().togglePlay();
    } else {
      playTracks(usePlayer.getState().queue, queueIndex, usePlayer.getState().contextName ?? undefined);
    }
  };

  return (
    <div
      className="queue-row"
      style={
        dragging
          ? { transform: `translateY(${dragOffset}px)`, background: 'var(--bg-elevated)', borderRadius: 8, zIndex: 2 }
          : undefined
      }
    >
      <span
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dragRef.current = { startY: e.clientY };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          setDragOffset(e.clientY - dragRef.current.startY);
        }}
        onPointerUp={(e) => {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          if (dragRef.current) {
            const delta = Math.round((e.clientY - dragRef.current.startY) / ROW_H);
            if (delta !== 0 && !current) {
              const to = Math.max(index + 1, Math.min(queueLen - 1, queueIndex + delta));
              if (to !== queueIndex) moveInQueue(queueIndex, to);
            }
          }
          dragRef.current = null;
          setDragging(false);
          setDragOffset(0);
        }}
        style={{
          touchAction: 'none',
          cursor: 'grab',
          fontSize: 20,
          color: 'var(--label-tertiary)',
          padding: '4px 6px',
          userSelect: 'none'
        }}
      >
        ≡
      </span>
      <button onClick={handlePlay} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <Artwork src={track.artwork} className="row-artwork" placeholderSize={18} alt="" />
        <span className="row-texts">
          <span
            className="row-title"
            style={{ display: 'block', color: current ? 'var(--accent)' : undefined, fontWeight: current ? 600 : 400 }}
          >
            {track.title}
          </span>
          <span className="row-subtitle" style={{ display: 'block' }}>
            {track.artist}
          </span>
        </span>
      </button>
      {!current && queueIndex > index && (
        <button
          className="icon-btn"
          onClick={() => removeFromQueue(queueIndex)}
          aria-label="Remove from queue"
          style={{ color: 'var(--accent)', fontSize: 22, padding: '8px 10px' }}
        >
          ×
        </button>
      )}
      <button className="icon-btn row-btn-dots" onClick={() => setActionSheet(track.id)} aria-label="Options">
        <svg width="18" height="18" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1.9" fill="currentColor" />
          <circle cx="12" cy="12" r="1.9" fill="currentColor" />
          <circle cx="19" cy="12" r="1.9" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
