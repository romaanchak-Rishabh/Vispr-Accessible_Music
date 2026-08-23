import { get, set, del, keys } from 'idb-keyval';
import type { Track, Playlist } from '../types';

const LIB_KEY = 'library:tracks';
const HANDLES_KEY_PREFIX = 'library:handle:';
const FILES_STORE_PREFIX = 'library:file:';
const PLAYLISTS_KEY = 'library:playlists';

export async function loadTracks(): Promise<Track[]> {
  return (await get<Track[]>(LIB_KEY)) ?? [];
}

export async function saveTracks(tracks: Track[]): Promise<void> {
  await set(LIB_KEY, tracks);
}

export async function saveHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
  await set(HANDLES_KEY_PREFIX + id, handle);
}

export async function loadHandle(id: string): Promise<FileSystemFileHandle | undefined> {
  return get<FileSystemFileHandle>(HANDLES_KEY_PREFIX + id);
}

export async function deleteHandle(id: string): Promise<void> {
  await del(HANDLES_KEY_PREFIX + id);
}

export async function saveFileBlob(id: string, file: File): Promise<void> {
  await set(FILES_STORE_PREFIX + id, file);
}

export async function loadFileBlob(id: string): Promise<File | undefined> {
  return get<File>(FILES_STORE_PREFIX + id);
}

export async function deleteFileBlob(id: string): Promise<void> {
  await del(FILES_STORE_PREFIX + id);
}

export async function removeTrackStorage(id: string): Promise<void> {
  await deleteHandle(id);
  await deleteFileBlob(id);
}

export async function purgeAllLibrary(): Promise<void> {
  const allKeys = await keys();
  await Promise.all(
    allKeys
      .filter((k) => typeof k === 'string' && (k.startsWith(HANDLES_KEY_PREFIX) || k.startsWith(FILES_STORE_PREFIX)))
      .map((k) => del(k))
  );
  await del(LIB_KEY);
}

export async function loadPlaylists(): Promise<Playlist[]> {
  return (await get<Playlist[]>(PLAYLISTS_KEY)) ?? [];
}

export async function savePlaylists(playlists: Playlist[]): Promise<void> {
  await set(PLAYLISTS_KEY, playlists);
}

const DLDIR_KEY = 'settings:download-dir';

export async function saveDownloadDir(handle: FileSystemDirectoryHandle): Promise<void> {
  await set(DLDIR_KEY, handle);
}

export async function loadDownloadDir(): Promise<FileSystemDirectoryHandle | undefined> {
  return get<FileSystemDirectoryHandle>(DLDIR_KEY);
}

export async function clearDownloadDir(): Promise<void> {
  await del(DLDIR_KEY);
}
