import { useState, useRef, useEffect } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { Artwork } from './Artwork';
import { detectConflicts, type ConflictItem, type SharePayload } from '../lib/share';
import { downloadAudioViaYtDlp } from '../lib/ytdlp';
import { blobToDataUrl } from '../lib/metadata';
import { SpinnerIcon } from './Icons';
import type { Track } from '../types';
import * as db from '../lib/db';

interface ReceiveTextSheetProps {
  payload: SharePayload;
  onClose: () => void;
}

function getShareTypeLabel(payload: SharePayload): string {
  switch (payload.type) {
    case 'playlist': return `Playlist: ${payload.playlistName ?? 'Untitled'}`;
    case 'album': return `Album: ${payload.albumTitle ?? 'Untitled'}`;
    case 'artist': return `Artist: ${payload.artistName ?? 'Untitled'}`;
    case 'mix': return `Mix: ${payload.name ?? 'Untitled'}`;
    default: return `${payload.tracks.length} song${payload.tracks.length !== 1 ? 's' : ''}`;
  }
}

export function ReceiveTextSheet({ payload, onClose }: ReceiveTextSheetProps): JSX.Element {
  const existingTracks = useLibrary((s) => s.tracks);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const ytdlpServer = useSettings((s) => s.ytdlpServer);
  const ytdlpToken = useSettings((s) => s.ytdlpToken);

  const [conflicts] = useState<ConflictItem[]>(() => detectConflicts(payload.tracks, existingTracks));
  const [phase, setPhase] = useState<'review' | 'importing' | 'done'>('review');
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, label: '' });
  const [applyAllChoice, setApplyAllChoice] = useState<'mine' | 'incoming' | null>(null);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [failed, setFailed] = useState(0);

  const toggleSkip = (trackId: string): void => {
    setSkippedIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  };

  const startImport = async (): Promise<void> => {
    setPhase('importing');

    let backendAlive = false;
    if (ytdlpServer) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(`${ytdlpServer.replace(/\/+$/, '')}/api/ping`, { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(t);
        backendAlive = r.ok;
      } catch { /* dead */ }
    }

    const totalToImport = conflicts.length;
    let done = 0;
    const trackIdsForPlaylist: string[] = [];

    for (const item of conflicts) {
      if (!mountedRef.current) return;

      if (item.status === 'exact') {
        setSkipped((s) => s + 1);
        trackIdsForPlaylist.push(item.existing!.id);
        done++;
        setImportProgress({ done, total: totalToImport, label: `Skipped: ${item.incoming.title} (already in library)` });
        continue;
      }

      if (skippedIds.has(item.incoming.id)) {
        setSkipped((s) => s + 1);
        done++;
        setImportProgress({ done, total: totalToImport, label: `Skipped: ${item.incoming.title} (you chose to skip)` });
        continue;
      }

      if (item.status === 'conflict' && applyAllChoice !== 'incoming') {
        setSkipped((s) => s + 1);
        trackIdsForPlaylist.push(item.existing!.id);
        done++;
        setImportProgress({ done, total: totalToImport, label: `Skipped: ${item.incoming.title} (kept yours)` });
        continue;
      }

      const inc = item.incoming;
      setImportProgress({ done, total: totalToImport, label: `Importing: ${inc.title}` });

      try {
        let audioBlob: Blob | undefined;
        let filename = inc.fileName ?? `${inc.title} — ${inc.artist}.m4a`;

        if (inc.youtubeId && ytdlpServer) {
          if (!backendAlive) {
            setFailed((f) => f + 1);
            done++;
            setImportProgress({ done, total: totalToImport, label: `Skipped: ${inc.title} (backend offline)` });
            continue;
          }
          const videoUrl = `https://www.youtube.com/watch?v=${inc.youtubeId}`;
          const dl = await downloadAudioViaYtDlp(ytdlpServer, ytdlpToken, videoUrl);
          audioBlob = dl.blob;
          filename = dl.filename;
        }

        if (!audioBlob) {
          setFailed((f) => f + 1);
          done++;
          setImportProgress({ done, total: totalToImport, label: `Failed: ${inc.title} (no audio source)` });
          continue;
        }

        let artwork = inc.artwork;
        if (!artwork && inc.youtubeId) {
          const thumbUrl = `https://img.youtube.com/vi/${inc.youtubeId}/hqdefault.jpg`;
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 8000);
            const resp = await fetch(thumbUrl, { mode: 'cors', signal: ctrl.signal });
            clearTimeout(t);
            if (resp.ok) artwork = (await blobToDataUrl(await resp.blob())) ?? undefined;
          } catch { /* thumbnail optional */ }
        }

        const trackId = inc.youtubeId ? `y-${inc.youtubeId}` : inc.id;
        const track: Track = {
          id: trackId,
          title: inc.title,
          artist: inc.artist,
          artist2: inc.artist2,
          album: inc.album,
          albumArtist: inc.albumArtist,
          genre1: inc.genre1,
          genre2: inc.genre2,
          year: inc.year,
          trackNo: inc.trackNo,
          fileName: filename,
          path: filename,
          source: 'file',
          size: audioBlob.size,
          addedAt: Date.now(),
          duration: inc.duration,
          artwork,
        };

        const blobFile = new File([audioBlob], filename, { type: audioBlob.type || 'audio/mp4' });
        try { await db.saveFileBlob(trackId, blobFile); } catch { /* skip */ }
        await useLibrary.getState().addTracks([track]);
        trackIdsForPlaylist.push(trackId);
        if (mountedRef.current) setImported((i) => i + 1);
      } catch {
        if (mountedRef.current) setFailed((f) => f + 1);
      }

      done++;
    }

    if (!mountedRef.current) return;

    if (trackIdsForPlaylist.length > 0 && payload.type === 'playlist' && payload.playlistName) {
      const currentPlaylists = useLibrary.getState().playlists;
      const existing = currentPlaylists.find((p) => p.name === payload.playlistName);
      if (existing) {
        const newIds = trackIdsForPlaylist.filter((id) => !existing.trackIds.includes(id));
        if (newIds.length > 0) addToPlaylist(existing.id, newIds);
      } else {
        const id = createPlaylist(payload.playlistName);
        addToPlaylist(id, trackIdsForPlaylist);
      }
    }

    setPhase('done');
  };

  const exactCount = conflicts.filter((c) => c.status === 'exact').length;
  const conflictCount = conflicts.filter((c) => c.status === 'conflict').length;
  const newCount = conflicts.filter((c) => c.status === 'new').length;
  const importableCount = conflicts.filter((c) => {
    if (c.status === 'exact') return false;
    if (c.status === 'conflict' && applyAllChoice !== 'incoming') return false;
    if (skippedIds.has(c.incoming.id)) return false;
    return true;
  }).length;

  return (
    <div className="sheet-overlay" style={{ alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="action-sheet" style={{ width: 'min(420px, 95%)', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {phase === 'review' && (
          <>
            <div className="action-sheet-head">
              <div style={{ fontSize: 17, fontWeight: 600 }}>Incoming Share</div>
            </div>
            <div style={{ padding: '8px 16px 12px', fontSize: 13, color: 'var(--label-secondary)' }}>
              {getShareTypeLabel(payload)}
              {exactCount > 0 && <> — {exactCount} already in library</>}
              {conflictCount > 0 && <>, {conflictCount} with different metadata</>}
              {newCount > 0 && <>, {newCount} new</>}
            </div>

            <div style={{ maxHeight: 240, overflow: 'auto', padding: '0 8px' }}>
              {conflicts.map((item, i) => {
                const isSkipped = skippedIds.has(item.incoming.id);
                return (
                  <div
                    key={i}
                    onClick={() => item.status !== 'exact' && toggleSkip(item.incoming.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', borderTop: '0.5px solid var(--separator)', cursor: item.status !== 'exact' ? 'pointer' : 'default', opacity: isSkipped ? 0.4 : 1, background: isSkipped ? 'var(--fill-1)' : undefined, borderRadius: 6 }}
                  >
                    <Artwork src={item.incoming.artwork} placeholderSize={16} style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0 } as React.CSSProperties} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isSkipped ? 'line-through' : undefined }}>{item.incoming.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--label-secondary)' }}>{item.incoming.artist}</div>
                    </div>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                      background: isSkipped ? 'rgba(255,59,48,0.15)' : item.status === 'exact' ? 'var(--fill-1)' : item.status === 'conflict' ? 'rgba(255,149,0,0.15)' : 'rgba(0,122,255,0.15)',
                      color: isSkipped ? '#ff3b30' : item.status === 'exact' ? 'var(--label-secondary)' : item.status === 'conflict' ? '#ff9500' : '#007aff',
                    }}>
                      {isSkipped ? 'Skip' : item.status === 'exact' ? 'Have it' : item.status === 'conflict' ? 'Differs' : 'New'}
                    </span>
                  </div>
                );
              })}
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

            <div style={{ padding: '0 16px 8px', fontSize: 12, color: 'var(--label-secondary)' }}>
              Requires a yt-dlp server in Settings to download audio.
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '8px 16px 16px' }}>
              <button className="pill-btn primary" style={{ flex: 1 }} onClick={() => void startImport()} disabled={importableCount === 0 || (conflictCount > 0 && applyAllChoice === null)}>
                Import {importableCount} song{importableCount !== 1 ? 's' : ''}
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
              {failed > 0 && <div style={{ color: '#ff3b30' }}>{failed} failed — {ytdlpServer ? 'backend offline, try again when server is running' : 'no yt-dlp server configured'}</div>}
              {payload.type === 'playlist' && <div style={{ marginTop: 8, color: 'var(--accent)' }}>Playlist "{payload.playlistName}" saved</div>}
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
