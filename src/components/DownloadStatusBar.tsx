import { useEffect, useState } from 'react';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { SpinnerIcon } from './Icons';

export function DownloadStatusBar(): JSX.Element | null {
  const queue = useLibrary((s) => s.downloadQueue);
  const hasQueue = usePlayer((s) => s.queue.length > 0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [failedAt, setFailedAt] = useState<Record<string, number>>({});

  const active = queue.filter((q) => q.status === 'downloading' || q.status === 'pending');
  const failed = queue.filter((q) => q.status === 'failed' && !dismissed.has(q.id));

  // Track when items fail so we can auto-dismiss after 8s
  useEffect(() => {
    for (const q of queue) {
      if (q.status === 'failed' && !failedAt[q.id]) {
        setFailedAt((prev) => ({ ...prev, [q.id]: Date.now() }));
      }
    }
  }, [queue, failedAt]);

  // Auto-dismiss failed items after 8 seconds
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const q of failed) {
      const at = failedAt[q.id];
      if (at) {
        const remaining = 8000 - (Date.now() - at);
        if (remaining <= 0) {
          setDismissed((prev) => new Set(prev).add(q.id));
        } else {
          timers.push(setTimeout(() => setDismissed((prev) => new Set(prev).add(q.id)), remaining));
        }
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [failed, failedAt]);

  if (active.length === 0 && failed.length === 0) return null;

  const current = active.find((q) => q.status === 'downloading');
  const pendingCount = active.filter((q) => q.status === 'pending').length;
  const doneCount = queue.filter((q) => q.status === 'done').length;
  const totalActive = active.length;

  const bottomOffset = hasQueue ? 150 : 70;

  return (
    <div
      className="download-status-bar"
      style={{
        position: 'fixed',
        bottom: `calc(env(safe-area-inset-bottom) + ${bottomOffset}px)`,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: 500,
        zIndex: 110,
        background: 'var(--sheet-bg)',
        backdropFilter: 'blur(24px) saturate(180%)',
        border: '0.5px solid var(--separator)',
        borderRadius: 12,
        padding: '8px 12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {current && <SpinnerIcon size={14} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          {current && (
            <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {current.title}
            </div>
          )}
          {!current && pendingCount > 0 && (
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {pendingCount} pending
            </div>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--label-secondary)', whiteSpace: 'nowrap' }}>
          {totalActive} active{doneCount > 0 ? ` · ${doneCount} done` : ''}
        </span>
      </div>
      {failed.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4 }}>
          {failed.length} failed — {failed.map((f) => f.title).join(', ')}
        </div>
      )}
    </div>
  );
}
