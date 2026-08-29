import { useState, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { Artwork } from './Artwork';
import { parseSharePayload, detectConflicts, type ConflictItem } from '../lib/share';
import { downloadAudioViaYtDlp } from '../lib/ytdlp';
import { blobToDataUrl } from '../lib/metadata';
import { SpinnerIcon } from './Icons';
import type { Track } from '../types';
import * as db from '../lib/db';

interface ReceiveSheetProps {
  file: File;
  onClose: () => void;
}

export function ReceiveSheet({ file, onClose }: ReceiveSheetProps): JSX.Element | null {
  const existingTracks = useLibrary((s) => s.tracks);
  const ytdlpServer = useLibrary(() => {
    try {
      const raw = localStorage.getItem('app-settings');
      return raw ? JSON.parse(raw).state?.ytdlpServer ?? '' : '';
    } catch { return ''; }
  });
  const ytdlpToken = useLibrary(() => {
    try {
      const raw = localStorage.getItem('app-settings');
      return raw ? JSON.parse(raw).state?.ytdlpToken ?? '' : '';
    } catch { return ''; }
  });

  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [phase, setPhase] = useState<'parsing' | 'review' | 'importing' | 'done'>('parsing');
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, label: '' });
  const [applyAllChoice, setApplyAllChoice] = useState<'mine' | 'incoming' | null>(null);
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [failed, setFailed] = useState(0);
  const abortRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const text = await file.text();
        const payload = parseSharePayload(text);
        if (cancelled) return;
        const items = detectConflicts(payload.tracks, existingTracks);
        setConflicts(items);
        setPhase('review');
      } catch {
        if (!cancelled) onClose();
      }
    })();
    return () => { cancelled = true; };
  }, [file, existingTracks, onClose]);

  const startImport = async (): Promise<void> => {
    setPhase('importing');
    abortRef.current = false;

    const totalNew = conflicts.filter((c) => c.status === 'new').length;
    const totalConflict = conflicts.filter((c) => c.status === 'conflict' && applyAllChoice === null).length;
    const total = totalNew + totalConflict;
    let done = 0;

    for (const item of conflicts) {
      if (abortRef.current) break;

      if (item.status === 'exact') {
        setSkipped((s) => s + 1);
        continue;
      }

      if (item.status === 'conflict' && applyAllChoice === null) {
        continue;
      }

      const keepMine = item.status === 'conflict' && applyAllChoice === 'mine';
      if (keepMine) {
        setSkipped((s) => s + 1);
        done++;
        setImportProgress({ done, total, label: `Skipped: ${item.incoming.title}` });
        continue;
      }

      const inc = item.incoming;
      if (!inc.youtubeId) {
        setSkipped((s) => s + 1);
        done++;
        continue;
      }

      setImportProgress({ done, total, label: `Downloading: ${inc.title}` });

      try {
        const videoUrl = `https://www.youtube.com/watch?v=${inc.youtubeId}`;
        const dl = await downloadAudioViaYtDlp(ytdlpServer, ytdlpToken, videoUrl);

        let artwork: string | undefined;
        if (inc.artwork) {
          artwork = inc.artwork;
        } else {
          const thumbUrl = `https://img.youtube.com/vi/${inc.youtubeId}/hqdefault.jpg`;
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 8000);
            const resp = await fetch(thumbUrl, { mode: 'cors', signal: ctrl.signal });
            clearTimeout(t);
            if (resp.ok) artwork = (await blobToDataUrl(await resp.blob())) ?? undefined;
          } catch { /* optional */ }
        }

        const track: Track = {
          id: `y-${inc.youtubeId}`,
          title: inc.title,
          artist: inc.artist,
          artist2: inc.artist2,
          album: inc.album,
          albumArtist: inc.albumArtist,
          genre1: inc.genre1,
          genre2: inc.genre2,
          year: inc.year,
          trackNo: inc.trackNo,
          fileName: dl.filename,
          path: dl.filename,
          source: 'file',
          size: dl.blob.size,
          addedAt: Date.now(),
          duration: inc.duration,
          artwork,
        };

        const blobFile = new File([dl.blob], dl.filename, { type: dl.blob.type || 'audio/mp4' });
        try { await db.saveFileBlob(track.id, blobFile); } catch { /* skip */ }
        await useLibrary.getState().addTracks([track]);
        setImported((i) => i + 1);
      } catch {
        setFailed((f) => f + 1);
      }

      done++;
      setImportProgress({ done, total, label: `Downloaded: ${inc.title}` });
    }

    setPhase('done');
  };

  const exactCount = conflicts.filter((c) => c.status === 'exact').length;
  const conflictCount = conflicts.filter((c) => c.status === 'conflict').length;
  const newCount = conflicts.filter((c) => c.status === 'new').length;

  return (
    <div className="sheet-overlay" style={{ alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="action-sheet" style={{ width: 'min(420px, 95%)', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {phase === 'parsing' && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <SpinnerIcon size={32} />
            <div style={{ marginTop: 12, fontSize: 15 }}>Reading share file...</div>
          </div>
        )}

        {phase === 'review' && (
          <>
            <div className="action-sheet-head">
              <div style={{ fontSize: 17, fontWeight: 600 }}>Incoming Share</div>
            </div>
            <div style={{ padding: '8px 16px 12px', fontSize: 13, color: 'var(--label-secondary)' }}>
              {conflicts.length} song{conflicts.length !== 1 ? 's' : ''} in share file
              {exactCount > 0 && <>, {exactCount} already in library</>}
              {conflictCount > 0 && <>, {conflictCount} with different metadata</>}
              {newCount > 0 && <>, {newCount} new</>}
            </div>

            <div style={{ maxHeight: 240, overflow: 'auto', padding: '0 8px' }}>
              {conflicts.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', borderTop: '0.5px solid var(--separator)' }}>
                  <Artwork src={item.incoming.artwork} placeholderSize={16} style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0 } as React.CSSProperties} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.incoming.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--label-secondary)' }}>{item.incoming.artist}</div>
                  </div>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                    background: item.status === 'exact' ? 'var(--fill-1)' : item.status === 'conflict' ? 'rgba(255,149,0,0.15)' : 'rgba(52,199,89,0.15)',
                    color: item.status === 'exact' ? 'var(--label-secondary)' : item.status === 'conflict' ? '#ff9500' : '#34c759',
                  }}>
                    {item.status === 'exact' ? 'Have it' : item.status === 'conflict' ? 'Differs' : 'New'}
                  </span>
                </div>
              ))}
            </div>

            {conflictCount > 0 && (
              <div style={{ padding: '10px 16px', borderTop: '0.5px solid var(--separator)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={applyAllChoice === 'mine'} onChange={() => setApplyAllChoice(applyAllChoice === 'mine' ? null : 'mine')} />
                  Keep mine for all conflicts
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 6 }}>
                  <input type="checkbox" checked={applyAllChoice === 'incoming'} onChange={() => setApplyAllChoice(applyAllChoice === 'incoming' ? null : 'incoming')} />
                  Accept incoming for all conflicts
                </label>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, padding: '12px 16px 16px' }}>
              <button className="pill-btn primary" style={{ flex: 1 }} onClick={() => void startImport()} disabled={conflictCount > 0 && applyAllChoice === null}>
                Import {newCount + (applyAllChoice === 'incoming' ? conflictCount : 0)} songs
              </button>
              <button className="pill-btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {phase === 'importing' && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <SpinnerIcon size={32} />
            <div style={{ marginTop: 12, fontSize: 15 }}>{importProgress.label}</div>
            {importProgress.total > 0 && (
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--label-secondary)' }}>
                {importProgress.done} / {importProgress.total}
              </div>
            )}
          </div>
        )}

        {phase === 'done' && (
          <>
            <div className="action-sheet-head">
              <div style={{ fontSize: 17, fontWeight: 600 }}>Import Complete</div>
            </div>
            <div style={{ padding: '12px 16px', fontSize: 14 }}>
              {imported > 0 && <div>{imported} song{imported !== 1 ? 's' : ''} imported</div>}
              {skipped > 0 && <div>{skipped} skipped (already in library)</div>}
              {failed > 0 && <div style={{ color: '#ff3b30' }}>{failed} failed</div>}
            </div>
            <div style={{ padding: '8px 16px 16px' }}>
              <button className="pill-btn primary" style={{ width: '100%' }} onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
