import { useLibrary } from '../store/library';
import { SpinnerIcon } from './Icons';

export function DownloadStatusBar(): JSX.Element | null {
  const queue = useLibrary((s) => s.downloadQueue);

  const active = queue.filter((q) => q.status === 'downloading' || q.status === 'pending');
  const failed = queue.filter((q) => q.status === 'failed');

  if (active.length === 0 && failed.length === 0) return null;

  const current = active.find((q) => q.status === 'downloading');
  const pendingCount = active.filter((q) => q.status === 'pending').length;

  return (
    <div
      className="download-status-bar"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom) + 130px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: 500,
        zIndex: 110,
        background: 'var(--sheet-bg)',
        backdropFilter: 'blur(24px) saturate(180%)',
        border: '0.5px solid var(--separator)',
        borderRadius: 12,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
      }}
    >
      {current && <SpinnerIcon size={16} />}
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
