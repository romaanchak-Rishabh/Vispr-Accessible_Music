import { create } from 'zustand';
import type { Track, Album, Artist, Playlist } from '../types';
import * as db from '../lib/db';
import { pickDirectory, ensurePermission, scanMusicDirectory, supportsDirectoryPicker, type DirHandle } from '../lib/fsAccess';
import { useSettings } from './settings';
import { eraToYear } from '../lib/tags';
import type { YtItem } from '../lib/ytdlp';
import {
  type QueuedImport,
  loadQueue,
  addToQueue,
  removeFromQueue,
  updateQueueItem,
} from '../lib/downloadQueue';

const fileCache = new Map<string, File>();
const handleCache = new Map<string, FileSystemFileHandle>();
const FILE_CACHE_MAX = 60;
let downloadDirHandle: FileSystemDirectoryHandle | null = null;

function cacheFile(id: string, file: File): void {
  if (fileCache.has(id)) { fileCache.delete(id); }
  else if (fileCache.size >= FILE_CACHE_MAX) {
    // Evict oldest entry
    const oldest = fileCache.keys().next().value;
    if (oldest) fileCache.delete(oldest);
  }
  fileCache.set(id, file);
}

function browserDownload(filename: string, blob: Blob): void {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function saveCopyToDownloadFolder(filename: string, blob: Blob): Promise<boolean> {
  if (!downloadDirHandle) return false;
  try {
    const ok = await ensurePermission(downloadDirHandle as unknown as DirHandle, false, 'readwrite');
    if (!ok) {
      console.warn('[library] download folder write skipped: permission not granted');
      useLibrary.setState({ downloadDirNeedsAuth: true });
      browserDownload(filename, blob);
      return false;
    }
    const fh = await downloadDirHandle.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return true;
  } catch (err) {
    console.warn('[library] download folder write failed:', err);
    useLibrary.setState({ downloadDirNeedsAuth: true });
    /* folder write failed — fall back to a normal browser download */
    browserDownload(filename, blob);
    return false;
  }
}

function buildAlbums(tracks: Track[]): Album[] {
  const map = new Map<string, Track[]>();
  for (const t of tracks) {
    const key = `${t.album}|||${t.albumArtist ?? t.artist}`.toLowerCase();
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  const albums: Album[] = [];
  for (const [key, list] of map) {
    list.sort((a, b) => (a.trackNo ?? 9999) - (b.trackNo ?? 9999));
    const artwork = list.find((t) => t.artwork)?.artwork;
    albums.push({
      key,
      title: list[0].album,
      artist: list[0].albumArtist || list[0].artist,
      year: list.find((t) => t.year)?.year,
      artwork,
      trackIds: list.map((t) => t.id)
    });
  }
  albums.sort((a, b) => a.title.localeCompare(b.title));
  return albums;
}

function buildArtists(tracks: Track[], albums: Album[]): Artist[] {
  const map = new Map<string, Artist>();
  for (const t of tracks) {
    let artist = map.get(t.artist);
    if (!artist) {
      artist = { name: t.artist, albumKeys: [], trackIds: [] };
      map.set(t.artist, artist);
    }
    const albumKey = `${t.album}|||${t.albumArtist ?? t.artist}`.toLowerCase();
    if (!artist.albumKeys.includes(albumKey)) artist.albumKeys.push(albumKey);
    artist.trackIds.push(t.id);
    if (!artist.artwork) {
      const album = albums.find((a) => a.key === albumKey);
      if (album?.artwork) artist.artwork = album.artwork;
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type LibraryStatus = 'loading' | 'empty' | 'ready' | 'needs-permission';

interface LibraryState {
  tracks: Track[];
  byId: Record<string, Track>;
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
  status: LibraryStatus;
  scanning: boolean;
  scanProgress: { scanned: number; found: number; label?: string } | null;
  lastScanCount: number | null;
  hasFolderSupport: boolean;
  downloadDirName: string | null;
  downloadDirNeedsAuth: boolean;
  topExcluded: Record<string, true>;
  downloadQueue: QueuedImport[];
  queueProcessing: boolean;
  chooseDownloadFolder: () => Promise<boolean>;
  clearDownloadFolder: () => Promise<void>;
  init: () => Promise<void>;
  connectFolder: () => Promise<boolean>;
  reconnectFolder: () => Promise<boolean>;
  rescanFolder: () => Promise<boolean>;
  importFromUrl: (url: string) => Promise<void>;
  importYouTube: (
    url: string,
    onProgress?: (done: number, total: number, label: string) => void,
    overrides?: Record<string, {
      title?: string;
      artist?: string;
      artist2?: string;
      album?: string;
      genre1?: string;
      genre2?: string;
      year?: string;
      artwork?: string;
    }>
  ) => Promise<{ imported: number; skipped: number; failed: number; trackIds: string[] }>;
  updateTrackMeta: (
    trackId: string,
    patch: {
      title?: string;
      artist?: string;
      artist2?: string;
      album?: string;
      artwork?: string;
      genre1?: string;
      genre2?: string;
      year?: number;
    }
  ) => Promise<void>;
  addFileWithMeta: (
    file: File,
    meta: { title: string; artist: string; album?: string; artwork?: string }
  ) => Promise<Track>;
  toggleFavourite: (trackId: string) => Promise<void>;
  removeFromMostListened: (trackId: string) => Promise<void>;
  addFiles: (files: File[]) => Promise<string[]>;
  createPlaylist: (name: string) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  renameAlbum: (oldAlbum: string, newAlbum: string) => void;
  reorderPlaylist: (playlistId: string, fromIndex: number, toIndex: number) => void;
  sortPlaylistByDate: (playlistId: string) => void;
  reorderAlbum: (albumName: string, fromIndex: number, toIndex: number) => void;
  sortAlbumByDate: (albumName: string) => void;
  addToPlaylist: (playlistId: string, trackIds: string[]) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  removeTrackFromLibrary: (trackId: string) => Promise<void>;
  resolveFile: (trackId: string) => Promise<File | null>;
  addTracks: (tracks: Track[]) => Promise<void>;
  queueYouTubeImport: (item: Omit<QueuedImport, 'queuedAt' | 'status'>) => Promise<void>;
  processDownloadQueue: () => Promise<void>;
  removeFromDownloadQueue: (id: string) => Promise<void>;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  tracks: [],
  byId: {},
  albums: [],
  artists: [],
  playlists: [],
  status: 'loading',
  scanning: false,
  scanProgress: null,
  lastScanCount: null,
  hasFolderSupport: supportsDirectoryPicker(),
  downloadDirName: null,
  downloadDirNeedsAuth: false,
  topExcluded: {},
  downloadQueue: [],
  queueProcessing: false,

  chooseDownloadFolder: async () => {
    const dir = await pickDirectory('readwrite');
    if (!dir) return false;
    const ok = await ensurePermission(dir, true, 'readwrite');
    if (!ok) return false;
    downloadDirHandle = dir as unknown as FileSystemDirectoryHandle;
    await db.saveDownloadDir(downloadDirHandle);
    set({ downloadDirName: dir.name, downloadDirNeedsAuth: false });
    return true;
  },

  clearDownloadFolder: async () => {
    downloadDirHandle = null;
    await db.clearDownloadDir();
    set({ downloadDirName: null });
  },

  init: async () => {
    try {
      const [tracks, playlists, topExcluded, downloadQueue] = await Promise.all([
        db.loadTracks(),
        db.loadPlaylists(),
        db.loadTopExcluded(),
        loadQueue(),
      ]);
      set({ playlists, topExcluded, downloadQueue });
      const savedDir = await db.loadDownloadDir();
      if (savedDir) {
        downloadDirHandle = savedDir;
        const writable = await ensurePermission(savedDir as unknown as DirHandle, false, 'readwrite');
        set({ downloadDirName: savedDir.name, downloadDirNeedsAuth: !writable });
      }
      if (tracks.length === 0) {
        set({ status: 'empty', tracks: [], byId: {}, albums: [], artists: [] });
        return;
      }
      const byId: Record<string, Track> = {};
      for (const t of tracks) byId[t.id] = t;
      const albums = buildAlbums(tracks);
      const artists = buildArtists(tracks, albums);
      set({ tracks, byId, albums, artists, status: 'ready' });

      // Preload handles/blobs lazily on demand instead of upfront.
      const anyDirSource = tracks.some((t) => t.source === 'dir');
      if (anyDirSource && !handleCache.size) {
        set({ status: 'ready' });
        // Try to verify permission quietly using the first dir handle we can load.
        const firstDirTrack = tracks.find((t) => t.source === 'dir');
        if (firstDirTrack) {
          const h = await db.loadHandle(firstDirTrack.id);
          if (h) {
            handleCache.set(firstDirTrack.id, h);
            const dh = h as unknown as DirHandle;
            const ok = await ensurePermission(dh, false);
            if (!ok) set({ status: 'needs-permission' });
          } else {
            set({ status: 'needs-permission' });
          }
        }
      }
    } catch {
      set({ status: 'empty' });
    }
  },

  connectFolder: async () => {
    const dir = await pickDirectory();
    if (!dir) return false;
    const ok = await ensurePermission(dir, true);
    if (!ok) return false;
    await runScan(set, get, dir);
    return true;
  },

  reconnectFolder: async () => {
    const tracks = get().tracks;
    const firstDirTrack = tracks.find((t) => t.source === 'dir');
    if (!firstDirTrack) return false;
    let h = handleCache.get(firstDirTrack.id);
    if (!h) {
      const loaded = await db.loadHandle(firstDirTrack.id);
      if (!loaded) return false;
      h = loaded;
      handleCache.set(firstDirTrack.id, loaded);
    }
    const ok = await ensurePermission(h as unknown as DirHandle, true);
    if (!ok) return false;
    set({ status: 'ready' });
    return true;
  },

  rescanFolder: async () => {
    const firstDirTrack = get().tracks.find((t) => t.source === 'dir');
    if (!firstDirTrack) return false;
    let h = handleCache.get(firstDirTrack.id);
    if (!h) {
      const loaded = await db.loadHandle(firstDirTrack.id);
      if (!loaded) return false;
      h = loaded;
      handleCache.set(firstDirTrack.id, loaded);
    }
    const ok = await ensurePermission(h as unknown as DirHandle, true);
    if (!ok) return false;
    await runScan(set, get, h as unknown as DirHandle);
    return true;
  },

  importFromUrl: async (url) => {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) throw new Error(`Download failed (HTTP ${resp.status})`);
    const blob = await resp.blob();
    let name = decodeURIComponent((url.split('?')[0].split('#')[0].split('/').pop() ?? '').trim()) || 'download';
    if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
      const ct = blob.type.split('/')[1]?.split(';')[0];
      name += ct && /^(mpeg|mp3)$/.test(ct) ? '.mp3' : ct ? `.${ct.replace('x-', '')}` : '.mp3';
    }
    const file = new File([blob], name, { type: blob.type || 'audio/mpeg', lastModified: Date.now() });
    await saveCopyToDownloadFolder(name, blob);
    await get().addFiles([file]);
  },

  addFiles: async (files) => {
    const audioFiles = files.filter(
      (f) => /\.(mp3|m4a|mp4|aac|flac|wav|ogg|oga|opus|webm)$/i.test(f.name) || f.type.startsWith('audio/')
    );
    if (audioFiles.length === 0) return [];
    set({ scanning: true, scanProgress: { scanned: 0, found: audioFiles.length } });

    const newTracks: Track[] = [];
    let done = 0;
    let next = 0;
    const { extractMetadata, blobToDataUrl } = await import('../lib/metadata');

    const worker = async (): Promise<void> => {
      while (next < audioFiles.length) {
        const file = audioFiles[next++];
        try {
          const tags = await extractMetadata(file, file.name);
          let artwork: string | undefined;
          if (tags.pictureBlob) artwork = (await blobToDataUrl(tags.pictureBlob)) ?? undefined;
          const track: Track = {
            id: `f-${file.name}-${file.size}-${file.lastModified}`,
            title: tags.title ?? file.name,
            artist: tags.artist ?? 'Unknown Artist',
            album: tags.album ?? 'Unknown Album',
            albumArtist: tags.albumArtist,
            genre: tags.genre,
            year: tags.year,
            trackNo: tags.trackNo,
            fileName: file.name,
            path: file.name,
            source: 'file',
            size: file.size,
            addedAt: Date.now(),
            duration: tags.duration,
            artwork
          };
          newTracks.push(track);
          cacheFile(track.id, file);
          await db.saveFileBlob(track.id, file);
        } catch {
          /* skip unreadable */
        }
        done++;
        set({ scanProgress: { scanned: done, found: audioFiles.length } });
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, audioFiles.length) }, worker));

    await finalizeImport(set, get, newTracks);
    return newTracks.map((t) => t.id);
  },

  addFileWithMeta: async (file, meta) => {
    const track: Track = {
      id: `f-${file.name}-${file.size}-${Date.now()}`,
      title: meta.title.trim() || file.name,
      artist: meta.artist.trim() || 'Unknown Artist',
      album: meta.album?.trim() || 'Unknown Album',
      fileName: file.name,
      path: file.name,
      source: 'file',
      size: file.size,
      addedAt: Date.now(),
      artwork: meta.artwork
    };
    cacheFile(track.id, file);
    await db.saveFileBlob(track.id, file);
    await saveCopyToDownloadFolder(file.name, file);
    await finalizeImport(set, get, [track]);
    return track;
  },

  importYouTube: async (url, onProgress, overrides) => {
    const { ytdlpServer, ytdlpToken } = useSettings.getState();
    // Empty server = use this deployment's own /api functions (same origin).
    const { resolveViaYtDlp, downloadAudioViaYtDlp } = await import('../lib/ytdlp');
    const { blobToDataUrl } = await import('../lib/metadata');

    set({ scanning: true, scanProgress: { scanned: 0, found: 0 } });
    let items: YtItem[];
    try {
      items = await resolveViaYtDlp(ytdlpServer, ytdlpToken, url);
    } catch (err) {
      set({ scanning: false, scanProgress: null });
      throw err;
    }
    if (items.length === 0) {
      set({ scanning: false, scanProgress: null });
      throw new Error('No videos found for that link');
    }
    set({ scanning: true, scanProgress: { scanned: 0, found: items.length, label: items[0]?.title ?? undefined } });

    const newTracks: Track[] = [];
    let done = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (const item of items) {
        // Dedup: if this exact video is already in the library, don't download again
        if (get().byId[`y-${item.id}`]) {
          done++;
          skipped++;
          const label = `${item.title ?? item.id} — already in library`;
          set({ scanProgress: { scanned: done, found: items.length, label } });
          onProgress?.(done, items.length, label);
          continue;
        }
        onProgress?.(done, items.length, item.title ?? item.id);
        const videoUrl = item.webpage_url ?? `https://www.youtube.com/watch?v=${item.id}`;
        try {
          const dl = await downloadAudioViaYtDlp(ytdlpServer, ytdlpToken, videoUrl);
          let artwork: string | undefined;
          if (item.thumbnail) {
            try {
              const ctrl = new AbortController();
              const t = setTimeout(() => ctrl.abort(), 8000);
              const thumbResp = await fetch(item.thumbnail, { mode: 'cors', signal: ctrl.signal });
              clearTimeout(t);
              if (thumbResp.ok) artwork = (await blobToDataUrl(await thumbResp.blob())) ?? undefined;
            } catch {
              /* thumbnail optional */
            }
            // Fall back to remote URL so <img> can still display it
            if (!artwork) artwork = item.thumbnail;
          }
          const existing = get().byId[`y-${item.id}`];
          const ov = overrides?.[item.id];
          const genre1 = ov?.genre1?.trim() || undefined;
          const genre2 = ov?.genre2?.trim() || undefined;
          const yearRaw = ov?.year?.trim();
          const year = eraToYear(yearRaw);
          const track: Track = {
            id: `y-${item.id}`,
            title: ov?.title?.trim() || item.title || dl.filename,
            artist: ov?.artist?.trim() || item.uploader || 'Unknown Artist',
            artist2: ov?.artist2?.trim() || undefined,
            album: ov?.album?.trim() || item.playlist_title || 'YouTube',
            genre1,
            genre2,
            year,
            fileName: dl.filename,
            path: dl.filename,
            source: 'file',
            size: dl.blob.size,
            addedAt: Date.now(),
            duration: item.duration,
            artwork: ov?.artwork ?? artwork ?? (existing && !artwork ? existing.artwork : undefined)
          };
          fileCache.set(track.id, new File([dl.blob], dl.filename, { type: dl.blob.type || 'audio/mp4' }));
          try {
            await db.saveFileBlob(track.id, fileCache.get(track.id)!);
          } catch {
            // IndexedDB may reject large blobs on mobile — still keep the track in the library.
            console.warn('[library] blob save skipped for', track.id);
          }
          try {
            await saveCopyToDownloadFolder(dl.filename, dl.blob);
          } catch {
            /* download-folder copy optional */
          }
          newTracks.push(track);
          done++;
          set({ scanProgress: { scanned: done, found: items.length, label: item.title ?? item.id } });
          onProgress?.(done, items.length, item.title ?? item.id);
        } catch (err) {
          done++;
          failed++;
          set({ scanProgress: { scanned: done, found: items.length, label: `failed: ${item.title ?? item.id}` } });
          onProgress?.(done, items.length, `failed: ${item.title ?? item.id}`);
        }
      }
    } finally {
      // Always persist whatever imported so scanning can't get stuck and
      // partially-imported songs survive a restart.
      await finalizeImport(set, get, newTracks);
    }

    if (newTracks.length === 0 && failed > 0) {
      throw new Error(
        items.length === 1
          ? 'Download failed — the yt-dlp server could not fetch that video'
          : `All ${items.length} downloads failed — check the yt-dlp server`
      );
    }

    return { imported: newTracks.length, skipped, failed, trackIds: newTracks.map((t) => t.id) };
  },

  updateTrackMeta: async (trackId, patch) => {
    const tracks = get().tracks.map((t) =>
      t.id === trackId
        ? {
            ...t,
            ...(patch.title?.trim() ? { title: patch.title.trim() } : {}),
            ...(patch.artist?.trim() ? { artist: patch.artist.trim() } : {}),
            ...(patch.artist2 !== undefined ? { artist2: patch.artist2?.trim() || undefined } : {}),
            ...(patch.album?.trim() ? { album: patch.album.trim() } : {}),
            ...(patch.artwork !== undefined ? { artwork: patch.artwork || undefined } : {}),
            ...(patch.genre1 !== undefined ? { genre1: patch.genre1 || undefined } : {}),
            ...(patch.genre2 !== undefined ? { genre2: patch.genre2 || undefined } : {}),
            ...(patch.year !== undefined ? { year: patch.year || undefined } : {})
          }
        : t
    );
    const byId: Record<string, Track> = {};
    for (const t of tracks) byId[t.id] = t;
    const albums = buildAlbums(tracks);
    const artists = buildArtists(tracks, albums);
    await db.saveTracks(tracks);
    set({ tracks, byId, albums, artists });
  },

  toggleFavourite: async (trackId) => {
    const tracks = get().tracks.map((t) =>
      t.id === trackId ? { ...t, favouritedAt: t.favouritedAt ? undefined : Date.now() } : t
    );
    const byId: Record<string, Track> = {};
    for (const t of tracks) byId[t.id] = t;
    await db.saveTracks(tracks);
    set({ tracks, byId });
  },

  removeFromMostListened: async (trackId) => {
    const topExcluded = { ...get().topExcluded, [trackId]: true as const };
    await db.saveTopExcluded(topExcluded);
    set({ topExcluded });
  },

  createPlaylist: (name) => {
    const id = `pl-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const playlists = [...get().playlists, { id, name, createdAt: Date.now(), trackIds: [] as string[] }];
    set({ playlists });
    void db.savePlaylists(playlists);
    return id;
  },
  deletePlaylist: (id) => {
    const playlists = get().playlists.filter((p) => p.id !== id);
    set({ playlists });
    void db.savePlaylists(playlists);
  },
  renamePlaylist: (id, name) => {
    const playlists = get().playlists.map((p) => (p.id === id ? { ...p, name } : p));
    set({ playlists });
    void db.savePlaylists(playlists);
  },
  renameAlbum: (oldAlbum, newAlbum) => {
    const trimmed = newAlbum.trim();
    if (!trimmed) return;
    const tracks = get().tracks.map((t) =>
      t.album === oldAlbum ? { ...t, album: trimmed } : t
    );
    const byId: Record<string, Track> = {};
    for (const t of tracks) byId[t.id] = t;
    const albums = buildAlbums(tracks);
    const artists = buildArtists(tracks, albums);
    void db.saveTracks(tracks);
    set({ tracks, byId, albums, artists });
  },
  reorderPlaylist: (playlistId, fromIndex, toIndex) => {
    const playlists = get().playlists.map((p) => {
      if (p.id !== playlistId) return p;
      const ids = [...p.trackIds];
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      return { ...p, trackIds: ids };
    });
    set({ playlists });
    void db.savePlaylists(playlists);
  },
  sortPlaylistByDate: (playlistId) => {
    const tracks = get().tracks;
    const playlists = get().playlists.map((p) => {
      if (p.id !== playlistId) return p;
      const sorted = [...p.trackIds].sort((a, b) => {
        const ta = tracks.find((t) => t.id === a);
        const tb = tracks.find((t) => t.id === b);
        return (ta?.addedAt ?? 0) - (tb?.addedAt ?? 0);
      });
      return { ...p, trackIds: sorted };
    });
    set({ playlists });
    void db.savePlaylists(playlists);
  },
  reorderAlbum: (albumName, fromIndex, toIndex) => {
    const tracks = get().tracks.map((t) => t);
    const albumTracks = tracks.filter((t) => t.album === albumName);
    if (albumTracks.length === 0) return;
    const [moved] = albumTracks.splice(fromIndex, 1);
    albumTracks.splice(toIndex, 0, moved);
    albumTracks.forEach((t, i) => { t.trackNo = i + 1; });
    const byId: Record<string, Track> = {};
    for (const t of tracks) byId[t.id] = t;
    const albums = buildAlbums(tracks);
    const artists = buildArtists(tracks, albums);
    void db.saveTracks(tracks);
    set({ tracks, byId, albums, artists });
  },
  sortAlbumByDate: (albumName) => {
    const tracks = get().tracks.map((t) => t);
    const albumTracks = tracks.filter((t) => t.album === albumName);
    if (albumTracks.length === 0) return;
    albumTracks.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
    albumTracks.forEach((t, i) => { t.trackNo = i + 1; });
    const byId: Record<string, Track> = {};
    for (const t of tracks) byId[t.id] = t;
    const albums = buildAlbums(tracks);
    const artists = buildArtists(tracks, albums);
    void db.saveTracks(tracks);
    set({ tracks, byId, albums, artists });
  },
  addToPlaylist: (playlistId, trackIds) => {
    const playlists = get().playlists.map((p) =>
      p.id === playlistId ? { ...p, trackIds: [...p.trackIds, ...trackIds.filter((id) => !p.trackIds.includes(id))] } : p
    );
    set({ playlists });
    void db.savePlaylists(playlists);
  },
  removeFromPlaylist: (playlistId, trackId) => {
    const playlists = get().playlists.map((p) => (p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((t) => t !== trackId) } : p));
    set({ playlists });
    void db.savePlaylists(playlists);
  },

  removeTrackFromLibrary: async (trackId) => {
    const merged = get().tracks.filter((t) => t.id !== trackId);
    const byId: Record<string, Track> = {};
    for (const t of merged) byId[t.id] = t;
    const albums = buildAlbums(merged);
    const artists = buildArtists(merged, albums);
    await db.saveTracks(merged);
    await db.removeTrackStorage(trackId);
    fileCache.delete(trackId);
    handleCache.delete(trackId);
    set({ tracks: merged, byId, albums, artists });
    if (merged.length === 0) set({ status: 'empty' });
  },

  resolveFile: async (trackId) => {
    const cached = fileCache.get(trackId);
    if (cached) return cached;
    const track = get().byId[trackId];
    if (!track) return null;
    if (track.source === 'file') {
      const blob = await db.loadFileBlob(trackId);
      if (blob) {
        fileCache.set(trackId, blob);
        return blob;
      }
      return null;
    }
    let handle = handleCache.get(trackId);
    if (!handle) {
      handle = (await db.loadHandle(trackId)) ?? undefined;
      if (handle) handleCache.set(trackId, handle);
    }
    if (!handle) return null;
    try {
      const file = await handle.getFile();
      fileCache.set(trackId, file);
      return file;
    } catch {
      return null;
    }
  },

  addTracks: async (newTracks) => {
    await finalizeImport(set, get, newTracks);
  },

  queueYouTubeImport: async (item) => {
    const queue = await addToQueue(item);
    set({ downloadQueue: queue });
  },

  removeFromDownloadQueue: async (id) => {
    const queue = await removeFromQueue(id);
    set({ downloadQueue: queue });
  },

  processDownloadQueue: async () => {
    const state = get();
    if (state.queueProcessing) return;
    const queue = state.downloadQueue.filter((q) => q.status === 'pending');
    if (queue.length === 0) return;

    set({ queueProcessing: true });
    const { ytdlpServer, ytdlpToken } = useSettings.getState();
    const { downloadAudioViaYtDlp } = await import('../lib/ytdlp');
    const { blobToDataUrl } = await import('../lib/metadata');

    for (const item of queue) {
      try {
        await updateQueueItem(item.id, { status: 'downloading' });
        set({ downloadQueue: await loadQueue() });

        const dl = await downloadAudioViaYtDlp(ytdlpServer, ytdlpToken, item.url);

        let artwork: string | undefined;
        if (item.thumbnail) {
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 8000);
            const thumbResp = await fetch(item.thumbnail, { mode: 'cors', signal: ctrl.signal });
            clearTimeout(t);
            if (thumbResp.ok) artwork = (await blobToDataUrl(await thumbResp.blob())) ?? undefined;
          } catch { /* thumbnail optional */ }
          if (!artwork) artwork = item.thumbnail;
        }

        const track: Track = {
          id: `y-${item.id}`,
          title: item.title,
          artist: item.artist || 'Unknown Artist',
          album: item.album?.trim() || 'YouTube',
          fileName: dl.filename,
          path: dl.filename,
          source: 'file',
          size: dl.blob.size,
          addedAt: Date.now(),
          duration: item.duration,
          artwork,
        };

        fileCache.set(track.id, new File([dl.blob], dl.filename, { type: dl.blob.type || 'audio/mp4' }));
        try {
          await db.saveFileBlob(track.id, fileCache.get(track.id)!);
        } catch { /* quota exceeded — keep in memory */ }

        await finalizeImport(set, get, [track]);
        await updateQueueItem(item.id, { status: 'done' });
      } catch (err) {
        await updateQueueItem(item.id, { status: 'failed', error: String(err) });
      }
      set({ downloadQueue: await loadQueue() });
    }

    set({ queueProcessing: false });
  },
}));

async function finalizeImport(
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
  newTracks: Track[]
): Promise<void> {
  const existing = get().tracks.filter((t) => !newTracks.some((n) => n.id === t.id));
  const merged = [...existing, ...newTracks];
  const byId: Record<string, Track> = {};
  for (const t of merged) byId[t.id] = t;
  const albums = buildAlbums(merged);
  const artists = buildArtists(merged, albums);
  await db.saveTracks(merged);
  set({
    tracks: merged,
    byId,
    albums,
    artists,
    status: 'ready',
    scanning: false,
    scanProgress: null,
    lastScanCount: newTracks.length
  });
}

async function runScan(
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
  dir: DirHandle
): Promise<void> {
  set({ scanning: true, scanProgress: { scanned: 0, found: 0 } });
  const existingIds = new Set(get().tracks.map((t) => t.id));
  let lastSet = 0;
  const result = await scanMusicDirectory(dir, (scanned, found) => {
    const now = Date.now();
    if (now - lastSet > 120) {
      lastSet = now;
      set({ scanProgress: { scanned, found } });
    }
  }, existingIds);

  const existing = get().tracks;
  const mergedMap = new Map(existing.map((t) => [t.id, t]));
  for (const t of result.tracks) mergedMap.set(t.id, t);
  const merged = [...mergedMap.values()];
  const byId: Record<string, Track> = {};
  for (const t of merged) byId[t.id] = t;
  const albums = buildAlbums(merged);
  const artists = buildArtists(merged, albums);
  await db.saveTracks(merged);
  set({
    tracks: merged,
    byId,
    albums,
    artists,
    status: 'ready',
    scanning: false,
    scanProgress: null,
    lastScanCount: result.tracks.length
  });
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ---------- Smart lists ---------- */

export const AUTO_FAVOURITES_ID = 'auto-favourites';
export const AUTO_MOST_LISTENED_ID = 'auto-most-listened';

export const AUTO_PLAYLISTS = [
  { id: AUTO_FAVOURITES_ID, name: 'Favourites' },
  { id: AUTO_MOST_LISTENED_ID, name: 'Most Listened' }
] as const;

export function isAutoPlaylist(id: string): boolean {
  return id === AUTO_FAVOURITES_ID || id === AUTO_MOST_LISTENED_ID;
}

export function getFavourites(tracks: Track[]): Track[] {
  return tracks
    .filter((t) => !!t.favouritedAt)
    .sort((a, b) => (b.favouritedAt ?? 0) - (a.favouritedAt ?? 0));
}

export function getMostListened(tracks: Track[], playCounts: Record<string, number>, topExcluded: Record<string, true>): Track[] {
  return tracks
    .filter((t) => !topExcluded[t.id] && (playCounts[t.id] ?? 0) > 0)
    .sort((a, b) => (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0));
}
