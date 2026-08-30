import { useState, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { Artwork } from './Artwork';
import { parseSharePayload, detectConflicts, type ConflictItem, type SharePayload } from '../lib/share';
import { downloadAudioViaYtDlp } from '../lib/ytdlp';
import { blobToDataUrl } from '../lib/metadata';
import { SpinnerIcon } from './Icons';
import type { Track } from '../types';
import * as db from '../lib/db';

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'audio/mp4';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

interface ReceiveSheetProps {
  files: File[];
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

export function ReceiveSheet({ files, onClose }: ReceiveSheetProps): JSX.Element | null {
  const existingTracks = useLibrary((s) => s.tracks);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const ytdlpServer = useSettings((s) => s.ytdlpServer);
  const ytdlpToken = useSettings((s) => s.ytdlpToken);

  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [phase, setPhase] = useState<'parsing' | 'review' | 'importing' | 'done' | 'error'>('parsing');
  const [errorMsg, setErrorMsg] = useState('');
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, label: '' });
  const [applyAllChoice, setApplyAllChoice] = useState<'mine' | 'incoming' | null>(null);
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [failed, setFailed] = useState(0);

  const parsedRef = useRef(false);

  useEffect(() => {
    if (parsedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const shareFile = files.find((f) => f.name.endsWith('.json') || f.name.endsWith('.vpr') || f.name.endsWith('.vispr.json') || f.name.endsWith('.bin'));

        if (!shareFile) {
          if (!cancelled) {
            setErrorMsg('No shareable files found. Send a JSON file from Vispr.');
            setPhase('error');
          }
          return;
        }

        let p: SharePayload;
        try {
          const text = await shareFile.text();
          p = parseSharePayload(text);
        } catch {
          if (!cancelled) {
            setErrorMsg('This file is not a Vispr share. Make sure the sender shared from Vispr.');
            setPhase('error');
          }
          return;
        }

        if (cancelled) return;

        if (!p.tracks || p.tracks.length === 0) {
          if (!cancelled) {
            setErrorMsg('Share file contains no tracks.');
            setPhase('error');
          }
          return;
        }

        const items = detectConflicts(p.tracks, existingTracks);
        if (!cancelled) {
          parsedRef.current = true;
          setPayload(p);
          setConflicts(items);
          setPhase('review');
        }
      } catch {
        if (!cancelled) {
          setErrorMsg('Something went wrong while reading the share.');
          setPhase('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [files, existingTracks, onClose]);

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

        if (inc.audioData) {
          audioBlob = dataUrlToBlob(inc.audioData);
        } else if (inc.youtubeId && ytdlpServer) {
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

    if (payload && trackIdsForPlaylist.length > 0 && payload.type === 'playlist' && payload.playlistName) {
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
  const withAudio = conflicts.filter((c) => c.incoming.audioData).length;
  const withYt = conflicts.filter((c) => !c.incoming.audioData && c.incoming.youtubeId).length;
  const importableCount = newCount + (applyAllChoice === 'incoming' ? conflictCount : 0);

  return (
    <div className="sheet-overlay" style={{ alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="action-sheet" style={{ width: 'min(420px, 95%)', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {phase === 'parsing' && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <SpinnerIcon size={32} />
            <div style={{ marginTop: 12, fontSize: 15 }}>Reading share file...</div>
          </div>
        )}

        {phase === 'error' && (
          <>
            <div className="action-sheet-head">
              <div style={{ fontSize: 17, fontWeight: 600 }}>Could Not Import</div>
            </div>
            <div style={{ padding: '12px 16px', fontSize: 14, color: 'var(--label-secondary)' }}>{errorMsg}</div>
            <div style={{ padding: '8px 16px 16px' }}>
              <button className="pill-btn primary" style={{ width: '100%' }} onClick={onClose}>OK</button>
            </div>
          </>
        )}

        {phase === 'review' && (
          <>
            <div className="action-sheet-head">
              <div style={{ fontSize: 17, fontWeight: 600 }}>Incoming Share</div>
            </div>
            <div style={{ padding: '8px 16px 12px', fontSize: 13, color: 'var(--label-secondary)' }}>
              {payload ? getShareTypeLabel(payload) : `${conflicts.length} songs`}
              {withAudio > 0 && <> — {withAudio} with audio</>}
              {withYt > 0 && <> — {withYt} from YouTube</>}
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
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {item.incoming.audioData && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'rgba(52,199,89,0.15)', color: '#34c759' }}>
                        Audio
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                      background: item.status === 'exact' ? 'var(--fill-1)' : item.status === 'conflict' ? 'rgba(255,149,0,0.15)' : 'rgba(0,122,255,0.15)',
                      color: item.status === 'exact' ? 'var(--label-secondary)' : item.status === 'conflict' ? '#ff9500' : '#007aff',
                    }}>
                      {item.status === 'exact' ? 'Have it' : item.status === 'conflict' ? 'Differs' : 'New'}
                    </span>
                  </div>
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
              {payload?.type === 'playlist' && <div style={{ marginTop: 8, color: 'var(--accent)' }}>Playlist "{payload.playlistName}" saved</div>}
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
