import { isAudioFile } from '../types';
import type { Track } from '../types';
import { extractMetadata, blobToDataUrl } from './metadata';
import { saveHandle } from './db';

export function supportsDirectoryPicker(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

type PermissionState = 'granted' | 'denied' | 'prompt';

export interface DirHandle extends FileSystemDirectoryHandle {
  requestPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  queryPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export async function pickDirectory(mode: 'read' | 'readwrite' = 'read'): Promise<DirHandle | null> {
  const picker = (window as unknown as { showDirectoryPicker?: (opts?: unknown) => Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker;
  if (!picker) return null;
  try {
    const handle = await picker({ id: 'music-library', mode });
    return handle as DirHandle;
  } catch {
    return null;
  }
}

export async function ensurePermission(
  handle: DirHandle,
  interactive: boolean,
  mode: 'read' | 'readwrite' = 'read'
): Promise<boolean> {
  try {
    if (handle.queryPermission) {
      const state = await handle.queryPermission({ mode });
      if (state === 'granted') return true;
      if (!interactive || !handle.requestPermission) return false;
      const req = await handle.requestPermission({ mode });
      return req === 'granted';
    }
    return true;
  } catch {
    return false;
  }
}

async function* walk(dir: FileSystemDirectoryHandle, prefix: string): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }> {
  // @ts-expect-error async iterator exists on directory handles in supporting browsers
  for await (const entry of dir.values()) {
    if (entry.kind === 'file') {
      yield { path: prefix ? `${prefix}/${entry.name}` : entry.name, handle: entry as FileSystemFileHandle };
    } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
      yield* walk(entry as FileSystemDirectoryHandle, prefix ? `${prefix}/${entry.name}` : entry.name);
    }
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

let idCounter = 0;

export interface ScanResult {
  tracks: Track[];
  dirHandle: FileSystemDirectoryHandle;
  scanned: number;
}

export async function scanMusicDirectory(
  dirHandle: DirHandle,
  onProgress: (scanned: number, matched: number, currentFile: string) => void,
  existingIds: Set<string> = new Set()
): Promise<ScanResult> {
  const audioFiles: { path: string; handle: FileSystemFileHandle }[] = [];
  for await (const entry of walk(dirHandle, '')) {
    if (isAudioFile(entry.path)) audioFiles.push(entry);
  }

  const tracks: Track[] = [];
  let scanned = 0;

  await mapLimit(audioFiles, 6, async (entry) => {
    scanned++;
    try {
      const file = await entry.handle.getFile();
      if (existingIds.has(`d-${entry.path}-${file.size}`)) {
        onProgress(scanned, tracks.length, entry.path);
        return;
      }
      const tags = await extractMetadata(file, entry.path);
      let artwork: string | undefined;
      if (tags.pictureBlob) artwork = (await blobToDataUrl(tags.pictureBlob)) ?? undefined;
      const track: Track = {
        id: `d-${entry.path}-${file.size}`,
        title: tags.title ?? file.name,
        artist: tags.artist ?? 'Unknown Artist',
        album: tags.album ?? 'Unknown Album',
        albumArtist: tags.albumArtist,
        genre: tags.genre,
        year: tags.year,
        trackNo: tags.trackNo,
        fileName: file.name,
        path: entry.path,
        source: 'dir',
        size: file.size,
        addedAt: Date.now(),
        artwork
      };
      tracks.push(track);
      await saveHandle(track.id, entry.handle);
    } catch {
      /* skip unreadable files */
    }
    onProgress(scanned, tracks.length, entry.path);
  });

  tracks.sort((a, b) => a.path.localeCompare(b.path));
  void idCounter;
  return { tracks, dirHandle, scanned };
}
