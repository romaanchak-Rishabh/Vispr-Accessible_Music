import type { Track } from '../types';
import * as db from './db';

export interface SharePayload {
  v: 1;
  type: 'track';
  tracks: ShareTrack[];
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
  const ytId = extractYoutubeId(track.id);
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
    youtubeId: ytId,
    artwork: track.artwork,
    fileName: track.fileName,
  };
}

export function createSharePayload(tracks: Track[]): SharePayload {
  return {
    v: 1,
    type: 'track',
    tracks: tracks.map(trackToShareTrack),
  };
}

export function payloadToBlob(payload: SharePayload): Blob {
  const json = JSON.stringify(payload, null, 2);
  return new Blob([json], { type: 'application/json' });
}

export async function shareTracks(tracks: Track[]): Promise<void> {
  const payload = createSharePayload(tracks);
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

  const jsonFile = new File([jsonBlob], 'metadata.vispr.json', { type: 'application/json' });
  const allFiles = [...audioFiles, jsonFile];

  if (navigator.share && navigator.canShare?.({ files: allFiles })) {
    await navigator.share({
      files: allFiles,
      title: tracks.length === 1 ? tracks[0].title : `${tracks.length} songs`,
      text: tracks.length === 1
        ? `${tracks[0].title} — ${tracks[0].artist}`
        : `${tracks.length} songs from Vispr`,
    });
  } else {
    // Fallback: download the JSON (audio can't be transferred this way)
    const url = URL.createObjectURL(jsonBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tracks.length === 1
      ? `${tracks[0].title} — ${tracks[0].artist}.vispr.json`
      : 'vispr-share.vispr.json';
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

  const audioByTitle = new Map<string, File>();
  if (audioFiles) {
    for (const f of audioFiles) {
      const name = f.name.replace(/\.[^.]+$/, '').toLowerCase();
      audioByTitle.set(name, f);
    }
  }

  return incoming.map((inc) => {
    let existing: Track | undefined;

    if (inc.youtubeId) {
      existing = byId.get(`y-${inc.youtubeId}`) ?? byYtId.get(inc.youtubeId);
    } else {
      existing = byId.get(inc.id);
    }

    const audioKey = `${inc.title} — ${inc.artist}`.replace(/[<>:"/\\|?*]/g, '_').toLowerCase();
    const audioFile = audioFiles?.find((f) => {
      const name = f.name.replace(/\.[^.]+$/, '').toLowerCase();
      return name === audioKey || name.includes(inc.title.toLowerCase());
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
