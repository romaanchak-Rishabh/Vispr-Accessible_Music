import type { Track } from '../types';
import * as db from './db';

export type ShareType = 'track' | 'playlist' | 'album' | 'artist' | 'mix';

export interface SharePayload {
  v: 1;
  type: ShareType;
  name?: string;
  tracks: ShareTrack[];
  playlistName?: string;
  albumTitle?: string;
  artistName?: string;
}

export interface ShareTrack {
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
  duration?: number;
  youtubeId?: string;
  artwork?: string;
  fileName?: string;
}

function extractYoutubeId(trackId: string): string | undefined {
  if (trackId.startsWith('y-')) return trackId.slice(2);
  return undefined;
}

function trackToShareTrack(track: Track): ShareTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    artist2: track.artist2,
    album: track.album,
    albumArtist: track.albumArtist,
    genre1: track.genre1,
    genre2: track.genre2,
    year: track.year,
    trackNo: track.trackNo,
    duration: track.duration,
    youtubeId: extractYoutubeId(track.id),
    artwork: track.artwork,
    fileName: track.fileName,
  };
}

export function createSharePayload(
  tracks: Track[],
  type: ShareType = 'track',
  meta?: { name?: string; playlistName?: string; albumTitle?: string; artistName?: string }
): SharePayload {
  return {
    v: 1,
    type,
    name: meta?.name,
    tracks: tracks.map(trackToShareTrack),
    playlistName: meta?.playlistName,
    albumTitle: meta?.albumTitle,
    artistName: meta?.artistName,
  };
}

export function payloadToBlob(payload: SharePayload): Blob {
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

function getShareTitle(payload: SharePayload): string {
  switch (payload.type) {
    case 'playlist': return payload.playlistName ?? 'Playlist';
    case 'album': return payload.albumTitle ?? 'Album';
    case 'artist': return payload.artistName ?? 'Artist';
    case 'mix': return payload.name ?? 'Mix';
    case 'track': return payload.tracks.length === 1 ? payload.tracks[0].title : `${payload.tracks.length} songs`;
    default: return 'Vispr Share';
  }
}

function getShareText(payload: SharePayload): string {
  switch (payload.type) {
    case 'playlist': return `${payload.playlistName ?? 'Playlist'} — ${payload.tracks.length} songs`;
    case 'album': return `${payload.albumTitle ?? 'Album'} — ${payload.tracks.length} songs`;
    case 'artist': return `${payload.artistName ?? 'Artist'} — ${payload.tracks.length} songs`;
    case 'mix': return `${payload.name ?? 'Mix'} — ${payload.tracks.length} songs`;
    case 'track': return payload.tracks.length === 1
      ? `${payload.tracks[0].title} — ${payload.tracks[0].artist}`
      : `${payload.tracks.length} songs from Vispr`;
    default: return 'Vispr Share';
  }
}

function getFileName(payload: SharePayload): string {
  const name = getShareTitle(payload).replace(/[<>:"/\\|?*]/g, '_');
  return `${name}.vispr.json`;
}

export async function shareTracks(tracks: Track[]): Promise<void> {
  const payload = createSharePayload(tracks, 'track');
  await sharePayload(payload, tracks);
}

export async function sharePlaylist(name: string, tracks: Track[]): Promise<void> {
  const payload = createSharePayload(tracks, 'playlist', { playlistName: name });
  await sharePayload(payload, tracks);
}

export async function shareAlbum(title: string, tracks: Track[]): Promise<void> {
  const payload = createSharePayload(tracks, 'album', { albumTitle: title });
  await sharePayload(payload, tracks);
}

export async function shareArtist(name: string, tracks: Track[]): Promise<void> {
  const payload = createSharePayload(tracks, 'artist', { artistName: name });
  await sharePayload(payload, tracks);
}

export async function shareMix(name: string, tracks: Track[]): Promise<void> {
  const payload = createSharePayload(tracks, 'mix', { name });
  await sharePayload(payload, tracks);
}

async function sharePayload(payload: SharePayload, tracks: Track[]): Promise<void> {
  const jsonBlob = payloadToBlob(payload);

  const audioFiles: File[] = [];
  for (const track of tracks) {
    const blob = await db.loadFileBlob(track.id);
    if (blob) {
      const ext = track.fileName?.split('.').pop() ?? 'm4a';
      const safeName = `${track.title} — ${track.artist}.${ext}`.replace(/[<>:"/\\|?*]/g, '_');
      audioFiles.push(new File([blob], safeName, { type: blob.type || 'audio/mp4' }));
    }
  }

  const jsonFile = new File([jsonBlob], getFileName(payload), { type: 'application/json' });
  const allFiles = [...audioFiles, jsonFile];

  if (navigator.share && navigator.canShare?.({ files: allFiles })) {
    await navigator.share({
      files: allFiles,
      title: getShareTitle(payload),
      text: getShareText(payload),
    });
  } else {
    const url = URL.createObjectURL(jsonBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getFileName(payload);
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function parseSharePayload(text: string): SharePayload {
  const data = JSON.parse(text);
  if (data.v !== 1 || !data.tracks || !Array.isArray(data.tracks)) {
    throw new Error('Invalid share file');
  }
  return data as SharePayload;
}

export interface ConflictItem {
  incoming: ShareTrack;
  existing?: Track;
  audioFile?: File;
  status: 'new' | 'exact' | 'conflict';
}

export function detectConflicts(
  incoming: ShareTrack[],
  existingTracks: Track[],
  audioFiles?: File[]
): ConflictItem[] {
  const byId = new Map(existingTracks.map((t) => [t.id, t]));
  const byYtId = new Map(
    existingTracks.filter((t) => t.id.startsWith('y-')).map((t) => [t.id.slice(2), t])
  );

  return incoming.map((inc) => {
    let existing: Track | undefined;

    if (inc.youtubeId) {
      existing = byId.get(`y-${inc.youtubeId}`) ?? byYtId.get(inc.youtubeId);
    } else {
      existing = byId.get(inc.id);
    }

    const audioFile = audioFiles?.find((f) => {
      const name = f.name.replace(/\.[^.]+$/, '').toLowerCase();
      const key = `${inc.title} — ${inc.artist}`.replace(/[<>:"/\\|?*]/g, '_').toLowerCase();
      return name === key || name.includes(inc.title.toLowerCase());
    });

    if (!existing) {
      return { incoming: inc, existing: undefined, audioFile, status: 'new' as const };
    }

    const same =
      existing.title === inc.title &&
      existing.artist === inc.artist &&
      existing.album === inc.album &&
      (existing.duration ?? 0) === (inc.duration ?? 0);

    if (same) {
      return { incoming: inc, existing, audioFile, status: 'exact' as const };
    }

    return { incoming: inc, existing, audioFile, status: 'conflict' as const };
  });
}
