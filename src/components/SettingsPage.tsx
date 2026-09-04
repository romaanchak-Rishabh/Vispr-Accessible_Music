import { useEffect, useState, useRef, useCallback } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { ACCENTS, applyAppearance, useSettings } from '../store/settings';
import type { AccentId, ThemeMode } from '../store/settings';
import { exportLibrary, importLibrary, type ImportProgress } from '../lib/backup';
import { ReceiveSheet } from './ReceiveSheet';
import { SpinnerIcon } from './Icons';

function SectionTitle({ children }: { children: string }): JSX.Element {
  return (
    <div style={{ margin: '20px 16px 10px', fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--label-secondary)' }}>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children?: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '11px 16px',
        borderTop: '0.5px solid var(--separator)'
      }}
    >
      <span style={{ fontSize: 15 }}>{label}</span>
      {children}
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      className={`switch${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    />
  );
}

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'Auto' },
  { id: 'light', label: 'Day' },
  { id: 'dark', label: 'Night' }
];

export function SettingsPage(): JSX.Element {
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  const setTheme = useSettings((s) => s.setTheme);
  const setAccent = useSettings((s) => s.setAccent);
  const confirmImport = useSettings((s) => s.confirmImport);
  const setConfirmImport = useSettings((s) => s.setConfirmImport);
  const ytdlpServer = useSettings((s) => s.ytdlpServer);
  const ytdlpToken = useSettings((s) => s.ytdlpToken);
  const youtubeApiKey = useSettings((s) => s.youtubeApiKey);
  const setYtdlpServer = useSettings((s) => s.setYtdlpServer);
  const setYtdlpToken = useSettings((s) => s.setYtdlpToken);
  const setYoutubeApiKey = useSettings((s) => s.setYoutubeApiKey);

  const crossfade = usePlayer((s) => s.crossfade);
  const toggleCrossfade = usePlayer((s) => s.toggleCrossfade);

  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiveFiles, setReceiveFiles] = useState<File[] | null>(null);
  const receiveInputRef = useRef<HTMLInputElement>(null);

  const trackCount = useLibrary((s) => s.tracks.length);
  const albumCount = useLibrary((s) => s.albums.length);
  const artistCount = useLibrary((s) => s.artists.length);
  const totalBytes = useLibrary((s) => s.tracks.reduce((n, t) => n + (t.size || 0), 0));

  const [serverStatus, setServerStatus] = useState<'idle' | 'checking' | 'up' | 'down'>('idle');
  const checkServer = useCallback(async () => {
    setServerStatus('checking');
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(`${ytdlpServer.replace(/\/+$/, '')}/api/ping`, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      setServerStatus(r.ok ? 'up' : 'down');
    } catch {
      setServerStatus('down');
    }
  }, [ytdlpServer]);

  // live-apply appearance whenever these settings change
  useEffect(() => {
    applyAppearance(theme, accent);
  }, [theme, accent]);

  return (
    <div className="fade-page">
      <h1 className="large-title">Settings</h1>
      <SectionTitle>Appearance</SectionTitle>
      <div className="group">
        <Row label="Theme">
          <div style={{ display: 'flex', gap: 6 }}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`pill-btn${theme === t.id ? ' primary' : ''}`}
                style={{ padding: '5px 14px', fontSize: 13 }}
                onClick={() => setTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Accent">
          <div style={{ display: 'flex', gap: 9 }}>
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAccent(a.id as AccentId)}
                aria-label={`${a.label} accent`}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: `linear-gradient(135deg, ${a.color}, ${a.color}cc)`,
                  border: accent === a.id ? '2px solid var(--label)' : '2px solid transparent',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              />
            ))}
          </div>
        </Row>
      </div>

      <SectionTitle>Playback</SectionTitle>
      <div className="group" style={{ marginTop: 0 }}>
        <Row label="Crossfade between songs">
          <Switch on={crossfade} onChange={() => toggleCrossfade()} />
        </Row>
      </div>

      <SectionTitle>Import</SectionTitle>
      <div className="group" style={{ marginTop: 0 }}>
        <Row label="Confirm songs before importing">
          <Switch on={confirmImport} onChange={setConfirmImport} />
        </Row>
        <div style={{ padding: '12px 16px 16px', borderTop: '0.5px solid var(--separator)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            className="search-input"
            style={{ paddingLeft: 12, fontSize: 14 }}
            placeholder="yt-dlp server URL (optional)"
            value={ytdlpServer}
            onChange={(e) => setYtdlpServer(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <input
            className="search-input"
            style={{ paddingLeft: 12, fontSize: 14 }}
            placeholder="yt-dlp shared secret (optional)"
            value={ytdlpToken}
            onChange={(e) => setYtdlpToken(e.target.value)}
            type="password"
            autoCorrect="off"
            autoCapitalize="off"
          />
          <input
            className="search-input"
            style={{ paddingLeft: 12, fontSize: 14 }}
            placeholder="YouTube API key (optional, better metadata)"
            value={youtubeApiKey}
            onChange={(e) => setYoutubeApiKey(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <span style={{ fontSize: 12, color: 'var(--label-secondary)', lineHeight: 1.4 }}>
            Empty server uses this deployment's built-in yt-dlp API. Manual Song mode needs none of these.
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <span style={{ fontSize: 13, color: 'var(--label-secondary)' }}>Server:</span>
            {serverStatus === 'idle' && (
              <span style={{ fontSize: 13, color: 'var(--label-secondary)' }}>Not checked</span>
            )}
            {serverStatus === 'checking' && (
              <span style={{ fontSize: 13, color: 'var(--label-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <SpinnerIcon size={12} /> Checking…
              </span>
            )}
            {serverStatus === 'up' && (
              <span style={{ fontSize: 13, color: '#30d158', fontWeight: 500 }}>● Reachable</span>
            )}
            {serverStatus === 'down' && (
              <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>● Unreachable</span>
            )}
            <button className="pill-btn" style={{ fontSize: 12, padding: '3px 10px', marginLeft: 'auto' }} onClick={() => void checkServer()}>
              Check
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-bg)', padding: '8px 10px', borderRadius: 8, lineHeight: 1.5 }}>
            <strong>Run your own server?</strong> Start the Python backend on a laptop with internet, then expose it with Cloudflare Tunnel:
            <code style={{ display: 'block', marginTop: 4, fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              cloudflared tunnel --url http://localhost:8080
            </code>
            Paste the <code>https://…trycloudflare.com</code> URL above. Works from anywhere.
          </div>
        </div>
      </div>

      <SectionTitle>Library</SectionTitle>
      <div className="group" style={{ marginTop: 0 }}>
        <Row label="Songs">
          <span style={{ fontSize: 15, color: 'var(--label-secondary)' }}>{trackCount}</span>
        </Row>
        <Row label="Albums">
          <span style={{ fontSize: 15, color: 'var(--label-secondary)' }}>{albumCount}</span>
        </Row>
        <Row label="Artists">
          <span style={{ fontSize: 15, color: 'var(--label-secondary)' }}>{artistCount}</span>
        </Row>
        <Row label="Offline storage used">
          <span style={{ fontSize: 15, color: 'var(--label-secondary)' }}>
            {totalBytes > 1024 * 1024 ? `${(totalBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(totalBytes / 1024)} KB`}
          </span>
        </Row>
      </div>

      <SectionTitle>Backup</SectionTitle>
      <div className="group" style={{ marginTop: 0 }}>
        <Row label="Export library">
          <button
            className="pill-btn primary"
            style={{ padding: '5px 14px', fontSize: 13 }}
            onClick={async () => {
              try {
                const blob = await exportLibrary();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vispr-backup-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (e) {
                console.error('Export failed', e);
              }
            }}
          >
            Export
          </button>
        </Row>
        <Row label="Import library">
          <button
            className="pill-btn"
            style={{ padding: '5px 14px', fontSize: 13 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={!!importProgress}
          >
            {importProgress ? `${importProgress.done}/${importProgress.total}` : 'Import'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImportError(null);
              try {
                const result = await importLibrary(file, ytdlpServer, ytdlpToken, setImportProgress);
                setImportProgress(null);
                const parts: string[] = [];
                if (result.imported > 0) parts.push(`${result.imported} downloaded`);
                if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
                if (result.failed > 0) parts.push(`${result.failed} failed`);
                if (result.localOnly > 0) parts.push(`${result.localOnly} local tracks need manual re-import`);
                setImportError(parts.length > 0 ? `Done: ${parts.join(', ')}.` : 'All tracks already in library.');
              } catch (err) {
                setImportProgress(null);
                setImportError('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
              }
              e.target.value = '';
            }}
          />
        </Row>
        {importProgress && (
          <div style={{ padding: '8px 16px', borderTop: '0.5px solid var(--separator)', fontSize: 13, color: 'var(--accent)' }}>
            {importProgress.label}
          </div>
        )}
        {importError && (
          <div style={{ padding: '8px 16px', borderTop: '0.5px solid var(--separator)', fontSize: 13, color: 'var(--label-secondary)' }}>
            {importError}
          </div>
        )}
        <Row label="Receive share">
          <button
            className="pill-btn"
            style={{ padding: '5px 14px', fontSize: 13 }}
            onClick={() => receiveInputRef.current?.click()}
          >
            Open
          </button>
          <input
            ref={receiveInputRef}
            type="file"
            accept=".json,.vispr.json,.vpr,.m4a,.mp3,.mp4,.aac,.ogg,.opus,.flac"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const fileList = e.target.files;
              if (fileList && fileList.length > 0) {
                setReceiveFiles(Array.from(fileList));
              }
              e.target.value = '';
            }}
          />
        </Row>
      </div>

      {receiveFiles && <ReceiveSheet files={receiveFiles} onClose={() => setReceiveFiles(null)} />}

      <SectionTitle>About</SectionTitle>
      <div className="group" style={{ marginTop: 0 }}>
        <Row label="Version">
          <span style={{ fontSize: 15, color: 'var(--label-secondary)' }}>1.0.0</span>
        </Row>
        <div style={{ padding: '10px 16px 14px', borderTop: '0.5px solid var(--separator)', fontSize: 12, color: 'var(--label-secondary)' }}>
          Vispr — your personal offline music library. Install it from your browser menu (&quot;Add to Home Screen&quot;) for the full app experience.
        </div>
      </div>
    </div>
  );
}
