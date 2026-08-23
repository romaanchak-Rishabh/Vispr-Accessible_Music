import { useState } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { isYouTubeUrl } from '../lib/ytdlp';
import { FolderIcon, SpinnerIcon, ChevronRightIcon, MusicNoteIcon } from './Icons';

export function ImportBar(): JSX.Element {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importFromUrl = useLibrary((s) => s.importFromUrl);
  const importYouTube = useLibrary((s) => s.importYouTube);
  const rescanFolder = useLibrary((s) => s.rescanFolder);
  const connectFolder = useLibrary((s) => s.connectFolder);
  const hasFolderTracks = useLibrary((s) => s.tracks.some((t) => t.source === 'dir'));

  const ytdlpServer = useSettings((s) => s.ytdlpServer);
  const ytdlpToken = useSettings((s) => s.ytdlpToken);
  const setYtdlpServer = useSettings((s) => s.setYtdlpServer);
  const setYtdlpToken = useSettings((s) => s.setYtdlpToken);
  const isYt = url.trim().length > 0 && isYouTubeUrl(url);

  const downloadDirName = useLibrary((s) => s.downloadDirName);
  const downloadDirNeedsAuth = useLibrary((s) => s.downloadDirNeedsAuth);
  const hasFolderSupport = useLibrary((s) => s.hasFolderSupport);
  const chooseDownloadFolder = useLibrary((s) => s.chooseDownloadFolder);
  const clearDownloadFolder = useLibrary((s) => s.clearDownloadFolder);

  const handleImport = async (): Promise<void> => {
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setStatusText(isYt ? 'Resolving…' : null);
    try {
      if (isYt) {
        const res = await importYouTube(trimmed, (done, total, label) =>
          setStatusText(total > 0 && done < total ? `Downloading ${done + 1}/${total} — ${label}` : label)
        );
        const parts = [`Imported ${res.imported}`];
        if (res.skipped > 0) parts.push(`${res.skipped} already in library`);
        if (res.failed > 0) parts.push(`${res.failed} failed`);
        setStatusText(parts.join(' · ') + (res.imported > 0 ? ' — check Recently Added' : ''));
        setUrl('');
      } else {
        await importFromUrl(trimmed);
        setStatusText('Imported — check Recently Added');
        setUrl('');
      }
    } catch (e) {
      setStatusText(null);
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '0 16px 14px' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="search-input"
          style={{ paddingLeft: 12 }}
          placeholder="Audio file link or YouTube video/playlist URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleImport();
          }}
          autoCorrect="off"
          autoCapitalize="off"
        />
        <button className="pill-btn primary" style={{ flexShrink: 0 }} onClick={() => void handleImport()} disabled={busy}>
          {busy ? <SpinnerIcon size={16} /> : isYt ? <MusicNoteIcon size={15} /> : <ChevronRightIcon size={15} />} Add
        </button>
      </div>

      {(isYt || (ytdlpServer.length > 0 && url.trim() === '')) && (
        <div style={{ marginTop: 10 }}>
          <input
            className="search-input"
            placeholder="yt-dlp server URL (e.g. https://my-ytdlp.fly.dev)"
            value={ytdlpServer}
            onChange={(e) => setYtdlpServer(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
            style={{ fontSize: 14 }}
          />
          <input
            className="search-input"
            placeholder="Shared secret (optional)"
            value={ytdlpToken}
            onChange={(e) => setYtdlpToken(e.target.value)}
            type="password"
            autoCorrect="off"
            autoCapitalize="off"
            style={{ fontSize: 14, marginTop: 6 }}
          />
          <p style={{ marginTop: 6, fontSize: 12, color: 'var(--label-secondary)' }}>
            Leave empty to use this deployment's built-in yt-dlp API — or point to your own server (see README).
          </p>
        </div>
      )}

      {hasFolderSupport && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--label-secondary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {downloadDirName ? (
            <>
              <span>
                Downloads saved to folder: <b style={{ color: 'var(--label)' }}>{downloadDirName}</b>
              </span>
              <button className="pill-btn" style={{ padding: '5px 14px', fontSize: 13 }} onClick={() => void chooseDownloadFolder()}>
                Change
              </button>
              <button
                className="pill-btn"
                style={{ padding: '5px 14px', fontSize: 13 }}
                onClick={() => void clearDownloadFolder()}
              >
                Stop saving copies
              </button>
              {downloadDirNeedsAuth && (
                <span style={{ color: 'var(--accent)', width: '100%' }}>
                  Folder access needs to be re-granted — new downloads won't be saved there until you reconnect it.
                  <button
                    className="pill-btn"
                    style={{ padding: '5px 14px', fontSize: 13, marginLeft: 8 }}
                    onClick={() => void chooseDownloadFolder()}
                  >
                    Reconnect Folder
                  </button>
                </span>
              )}
            </>
          ) : (
            <button className="pill-btn" onClick={() => void chooseDownloadFolder()}>
              <FolderIcon size={16} /> Save downloads to a folder (optional)
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        {hasFolderTracks ? (
          <>
            <button className="pill-btn" onClick={() => void rescanFolder()}>
              Rescan Folder
            </button>
            <button className="pill-btn" onClick={() => void connectFolder()}>
              Change Folder
            </button>
          </>
        ) : (
          <button className="pill-btn" onClick={() => void connectFolder()}>
            <FolderIcon size={16} /> Connect Music Folder
          </button>
        )}
      </div>

      {statusText && !busy && (
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--label-secondary)' }}>{statusText}</p>
      )}
      {busy && statusText && (
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--label-secondary)' }}>{statusText}</p>
      )}
      {error && <p style={{ marginTop: 8, fontSize: 13, color: 'var(--accent)' }}>{error}</p>}
    </div>
  );
}
