import { useState } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { isYouTubeUrl, resolveViaYtDlp } from '../lib/ytdlp';
import type { YtItem } from '../lib/ytdlp';
import { FolderIcon, SpinnerIcon, ChevronRightIcon, MusicNoteIcon } from './Icons';
import { ImportConfirmSheet } from './ImportConfirmSheet';
import type { ImportOverrides } from './ImportConfirmSheet';
import { ManualImportSheet } from './ManualImportSheet';
import { PostImportSheet } from './PostImportSheet';

export function ImportBar(): JSX.Element {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [pendingItems, setPendingItems] = useState<YtItem[] | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [postImportIds, setPostImportIds] = useState<string[] | null>(null);

  const importFromUrl = useLibrary((s) => s.importFromUrl);
  const importYouTube = useLibrary((s) => s.importYouTube);
  const rescanFolder = useLibrary((s) => s.rescanFolder);
  const connectFolder = useLibrary((s) => s.connectFolder);
  const hasFolderTracks = useLibrary((s) => s.tracks.some((t) => t.source === 'dir'));

  const ytdlpServer = useSettings((s) => s.ytdlpServer);
  const ytdlpToken = useSettings((s) => s.ytdlpToken);
  const confirmImport = useSettings((s) => s.confirmImport);
  const setYtdlpServer = useSettings((s) => s.setYtdlpServer);
  const setYtdlpToken = useSettings((s) => s.setYtdlpToken);
  const setConfirmImport = useSettings((s) => s.setConfirmImport);
  const isYt = url.trim().length > 0 && isYouTubeUrl(url);

  const downloadDirName = useLibrary((s) => s.downloadDirName);
  const downloadDirNeedsAuth = useLibrary((s) => s.downloadDirNeedsAuth);
  const hasFolderSupport = useLibrary((s) => s.hasFolderSupport);
  const chooseDownloadFolder = useLibrary((s) => s.chooseDownloadFolder);
  const clearDownloadFolder = useLibrary((s) => s.clearDownloadFolder);

  const runAutoImport = async (
    trimmed: string,
    overrides?: Record<string, ImportOverrides>,
    onProgress?: (done: number, total: number, label: string) => void
  ): Promise<string[]> => {
    const res = await importYouTube(trimmed, onProgress, overrides);
    const parts = [`Imported ${res.imported}`];
    if (res.skipped > 0) parts.push(`${res.skipped} already in library`);
    if (res.failed > 0) parts.push(`${res.failed} failed`);
    setStatusText(parts.join(' · ') + (res.imported > 0 ? ' — check Recently Added' : ''));
    setUrl('');
    return res.trackIds;
  };

  const handleImport = async (): Promise<void> => {
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setStatusText(null);
    try {
      if (!isYt) {
        setStatusText('Fetching…');
        const beforeIds = new Set(useLibrary.getState().tracks.map((t) => t.id));
        await importFromUrl(trimmed);
        const afterIds = useLibrary.getState().tracks.map((t) => t.id);
        const newIds = afterIds.filter((id) => !beforeIds.has(id));
        setStatusText('Imported — check Recently Added');
        setUrl('');
        if (newIds.length > 0) {
          setBusy(false);
          setPostImportIds(newIds);
          return;
        }
        return;
      }
      if (mode === 'manual') {
        setBusy(false);
        setManualOpen(true);
        return;
      }
      setStatusText('Resolving…');
      if (confirmImport) {
        // Resolve first so the user can review/edit before anything downloads.
        const items = await resolveViaYtDlp(ytdlpServer, ytdlpToken, trimmed);
        if (items.length === 0) throw new Error('No videos found for that link');
        setBusy(false);
        setPendingItems(items);
        return;
      }
      setStatusText('Downloading…');
      const trackIds = await runAutoImport(trimmed, undefined, (done, total, label) =>
        setStatusText(total > 0 && done < total ? `Downloading ${done + 1}/${total} — ${label}` : label)
      );
      if (trackIds.length > 0) {
        setBusy(false);
        setPostImportIds(trackIds);
        return;
      }
    } catch (e) {
      setStatusText(null);
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmedImport = async (overrides: Record<string, ImportOverrides>, dontAskAgain: boolean): Promise<void> => {
    const trimmed = url.trim();
    setPendingItems(null);
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setStatusText('Downloading…');
    try {
      if (dontAskAgain) setConfirmImport(false);
      const trackIds = await runAutoImport(trimmed, overrides, (done, total, label) =>
        setStatusText(total > 0 && done < total ? `Downloading ${done + 1}/${total} — ${label}` : label)
      );
      // No PostImportSheet here — the user already reviewed & confirmed every
      // song in the wizard, so the "Tag Your Music" form would just repeat it.
      if (trackIds.length > 0) {
        setBusy(false);
        return;
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
          {busy ? <SpinnerIcon size={16} /> : isYt && mode === 'manual' ? <ChevronRightIcon size={15} /> : <MusicNoteIcon size={15} />} Add
        </button>
      </div>

      {isYt && !busy && !pendingItems && !manualOpen && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {(
            [
              ['auto', 'Auto Download'],
              ['manual', 'Manual Song']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={`pill-btn${mode === value ? ' primary' : ''}`}
              style={{ padding: '5px 14px', fontSize: 13 }}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

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
            Leave empty to use this deployment's built-in yt-dlp API — or point to your own server (see README). Manual Song mode needs no server.
          </p>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--accent)', background: 'var(--accent-bg)', padding: '8px 10px', borderRadius: 8, lineHeight: 1.5 }}>
            <strong>Remote access?</strong> Run the Python backend on your laptop, then expose with:
            <code style={{ display: 'block', marginTop: 4, fontSize: 11, fontFamily: 'monospace' }}>
              cloudflared tunnel --url http://localhost:8080
            </code>
            Paste the <code>https://…trycloudflare.com</code> URL above.
          </div>
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

      {pendingItems && (
        <ImportConfirmSheet
          items={pendingItems}
          onConfirm={(overrides, dontAsk) => void handleConfirmedImport(overrides, dontAsk)}
          onCancel={() => setPendingItems(null)}
        />
      )}

      {manualOpen && <ManualImportSheet url={url.trim()} onClose={() => setManualOpen(false)} />}

      {postImportIds && (
        <PostImportSheet trackIds={postImportIds} onClose={() => setPostImportIds(null)} />
      )}
    </div>
  );
}
