import { useLibrary } from '../store/library';
import { SpinnerIcon } from './Icons';

export function DownloadStatusBar(): JSX.Element | null {
  const queue = useLibrary((s) => s.downloadQueue);
  const processing = useLibrary((s) => s.queueProcessing);

  const active = queue.filter((q) => q.status === 'downloading' || q.status === 'pending');
  const failed = queue.filter((q) => q.status === 'failed');

  if (active.length === 0 && failed.length === 0) return null;

  const current = active.find((q) => q.status === 'downloading');
  const pendingCount = active.filter((q) => q.status === 'pending').length;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 110,
        background: 'var(--sheet-bg)',
        backdropFilter: 'blur(24px) saturate(180%)',
        borderTop: '0.5px solid var(--separator)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }}
    >
      {processing && <SpinnerIcon size={16} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        {current && (
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Downloading: {current.title}
          </div>
        )}
        {!current && pendingCount > 0 && (
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {pendingCount} pending download{pendingCount > 1 ? 's' : ''}
          </div>
        )}
        {failed.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--accent)' }}>
            {failed.length} failed
          </div>
        )}
      </div>
    </div>
  );
}
