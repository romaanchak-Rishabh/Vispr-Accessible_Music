import type { Track, Playlist } from '../types';
import * as db from './db';

export interface BackupData {
  version: 1;
  exportedAt: string;
  tracks: BackupTrack[];
  playlists: Playlist[];
  topExcluded: Record<string, true>;
  playCounts: Record<string, number>;
  settings: {
    theme: string;
    accent: string;
    confirmImport: boolean;
  };
}

export interface BackupTrack {
  id: string;
  title: string;
  artist: string;
  artist2?: string;
  album: string;
  albumArtist?: string;
  genre1?: string;
  genre2?: string;
  year?: number;
  trackNo?: number;
  fileName: string;
  duration?: number;
  favouritedAt?: number;
  sourceType: 'youtube' | 'local';
  youtubeId?: string;
}

function isYouTubeTrack(track: Track): boolean {
  return track.id.startsWith('y-');
}

function extractYoutubeId(trackId: string): string | undefined {
  if (trackId.startsWith('y-')) return trackId.slice(2);
  return undefined;
}

export async function exportLibrary(): Promise<Blob> {
  const tracks = await db.loadTracks();
  const playlists = await db.loadPlaylists();
  const topExcluded = await db.loadTopExcluded();

  let playCounts: Record<string, number> = {};
  let settings = { theme: 'system', accent: 'red', confirmImport: true };
  try {
    const raw = localStorage.getItem('player-state');
    if (raw) {
      const parsed = JSON.parse(raw);
      playCounts = parsed.state?.playCounts ?? {};
    }
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem('app-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      settings = {
        theme: parsed.state?.theme ?? 'system',
        accent: parsed.state?.accent ?? 'red',
        confirmImport: parsed.state?.confirmImport ?? true,
      };
    }
  } catch { /* ignore */ }

  const backupTracks: BackupTrack[] = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    artist2: t.artist2,
    album: t.album,
    albumArtist: t.albumArtist,
    genre1: t.genre1,
    genre2: t.genre2,
    year: t.year,
    trackNo: t.trackNo,
    fileName: t.fileName,
    duration: t.duration,
    favouritedAt: t.favouritedAt,
    sourceType: isYouTubeTrack(t) ? 'youtube' : 'local',
    youtubeId: extractYoutubeId(t.id),
  }));

  const data: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tracks: backupTracks,
    playlists,
    topExcluded,
    playCounts,
    settings,
  };

  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export interface ImportProgress {
  phase: 'reading' | 'downloading' | 'restoring';
  done: number;
  total: number;
  label: string;
}

export async function importLibrary(
  file: File,
  ytDlpServer: string,
  ytDlpToken: string,
  onProgress?: (p: ImportProgress) => void
): Promise<{ imported: number; skipped: number; failed: number; localOnly: number }> {
  const text = await file.text();
  let data: BackupData;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid backup file');
  }

  if (data.version !== 1) throw new Error('Unsupported backup version');
  if (!data.tracks || !Array.isArray(data.tracks)) throw new Error('Invalid backup format');

  onProgress?.({ phase: 'reading', done: 0, total: data.tracks.length, label: 'Reading backup...' });

  const existingTracks = await db.loadTracks();
  const existingIds = new Set(existingTracks.map((t) => t.id));

  const youtubeTracks = data.tracks.filter((t) => t.sourceType === 'youtube' && t.youtubeId);
  const localTracks = data.tracks.filter((t) => t.sourceType === 'local');

  const hasYouTube = youtubeTracks.length > 0;
  const hasServer = ytDlpServer.trim().length > 0;

  if (hasYouTube && !hasServer) {
    throw new Error('Configure yt-dlp server URL in Import settings before restoring YouTube tracks');
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let localSkipped = 0;

  const { downloadAudioViaYtDlp } = await import('./ytdlp');
  const { blobToDataUrl } = await import('./metadata');

  for (let i = 0; i < youtubeTracks.length; i++) {
    const bt = youtubeTracks[i];
    const label = bt.title || bt.youtubeId || `Track ${i + 1}`;

    if (existingIds.has(bt.id)) {
      skipped++;
      onProgress?.({ phase: 'downloading', done: i + 1, total: youtubeTracks.length, label: `${label} — already in library` });
      continue;
    }

    onProgress?.({ phase: 'downloading', done: i, total: youtubeTracks.length, label: `Downloading: ${label}` });

    const videoUrl = `https://www.youtube.com/watch?v=${bt.youtubeId}`;
    try {
      const dl = await downloadAudioViaYtDlp(ytDlpServer, ytDlpToken, videoUrl);

      let artwork: string | undefined;
      const thumbUrl = `https://img.youtube.com/vi/${bt.youtubeId}/hqdefault.jpg`;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const resp = await fetch(thumbUrl, { mode: 'cors', signal: ctrl.signal });
        clearTimeout(t);
        if (resp.ok) {
          artwork = (await blobToDataUrl(await resp.blob())) ?? undefined;
        }
      } catch { /* thumbnail optional */ }

      const track: Track = {
        id: bt.id,
        title: bt.title,
        artist: bt.artist,
        artist2: bt.artist2,
        album: bt.album,
        albumArtist: bt.albumArtist,
        genre1: bt.genre1,
        genre2: bt.genre2,
        year: bt.year,
        trackNo: bt.trackNo,
        fileName: dl.filename,
        path: dl.filename,
        source: 'file',
        size: dl.blob.size,
        addedAt: Date.now(),
        duration: bt.duration,
        favouritedAt: bt.favouritedAt,
        artwork,
      };

      const blobFile = new File([dl.blob], dl.filename, { type: dl.blob.type || 'audio/mp4' });
      try {
        await db.saveFileBlob(track.id, blobFile);
      } catch {
        console.warn('[backup] blob save skipped for', track.id);
      }
      existingTracks.push(track);
      imported++;
      onProgress?.({ phase: 'downloading', done: i + 1, total: youtubeTracks.length, label });
    } catch {
      failed++;
      onProgress?.({ phase: 'downloading', done: i + 1, total: youtubeTracks.length, label: `Failed: ${label}` });
    }
  }

  onProgress?.({ phase: 'restoring', done: 0, total: 4, label: 'Restoring metadata...' });

  for (const bt of localTracks) {
    if (existingIds.has(bt.id)) {
      skipped++;
      localSkipped++;
      continue;
    }
    const track: Track = {
      id: bt.id,
      title: bt.title,
      artist: bt.artist,
      artist2: bt.artist2,
      album: bt.album,
      albumArtist: bt.albumArtist,
      genre1: bt.genre1,
      genre2: bt.genre2,
      year: bt.year,
      trackNo: bt.trackNo,
      fileName: bt.fileName,
      path: bt.fileName,
      source: 'file',
      size: 0,
      addedAt: Date.now(),
      duration: bt.duration,
      favouritedAt: bt.favouritedAt,
    };
    existingTracks.push(track);
  }

  onProgress?.({ phase: 'restoring', done: 1, total: 4, label: 'Saving tracks...' });
  await db.saveTracks(existingTracks);

  onProgress?.({ phase: 'restoring', done: 2, total: 4, label: 'Restoring playlists...' });
  if (data.playlists?.length) {
    const existingPlaylists = await db.loadPlaylists();
    const existingPlaylistIds = new Set(existingPlaylists.map((p) => p.id));
    const newPlaylists = data.playlists.filter((p) => !existingPlaylistIds.has(p.id));
    await db.savePlaylists([...existingPlaylists, ...newPlaylists]);
  }

  onProgress?.({ phase: 'restoring', done: 3, total: 4, label: 'Restoring play counts...' });
  if (data.topExcluded) {
    await db.saveTopExcluded(data.topExcluded);
  }
  if (data.playCounts) {
    try {
      const raw = localStorage.getItem('player-state');
      const parsed = raw ? JSON.parse(raw) : {};
      const existing = parsed.state?.playCounts ?? {};
      const merged = { ...existing };
      for (const [k, v] of Object.entries(data.playCounts)) {
        merged[k] = Math.max(merged[k] ?? 0, v);
      }
      parsed.state = parsed.state || {};
      parsed.state.playCounts = merged;
      localStorage.setItem('player-state', JSON.stringify(parsed));
    } catch { /* ignore */ }
  }

  onProgress?.({ phase: 'restoring', done: 4, total: 4, label: 'Restoring settings...' });
  if (data.settings) {
    try {
      const raw = localStorage.getItem('app-settings');
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.state = parsed.state || {};
      if (data.settings.theme) parsed.state.theme = data.settings.theme;
      if (data.settings.accent) parsed.state.accent = data.settings.accent;
      if (data.settings.confirmImport !== undefined) parsed.state.confirmImport = data.settings.confirmImport;
      localStorage.setItem('app-settings', JSON.stringify(parsed));
    } catch { /* ignore */ }
  }

  return { imported, skipped, failed, localOnly: localTracks.length - localSkipped };
}
