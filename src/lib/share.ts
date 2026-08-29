import type { Track } from '../types';

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
}

function isYouTubeTrack(track: Track): boolean {
  return track.id.startsWith('y-');
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
  };
}

export function createSharePayload(tracks: Track[]): SharePayload {
  const ytTracks = tracks.filter(isYouTubeTrack);
  return {
    v: 1,
    type: 'track',
    tracks: ytTracks.map(trackToShareTrack),
  };
}

export function payloadToBlob(payload: SharePayload): Blob {
  const json = JSON.stringify(payload, null, 2);
  return new Blob([json], { type: 'application/json' });
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
  status: 'new' | 'exact' | 'conflict';
}

export function detectConflicts(
  incoming: ShareTrack[],
  existingTracks: Track[]
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

    if (!existing) {
      return { incoming: inc, existing: undefined, status: 'new' as const };
    }

    const same =
      existing.title === inc.title &&
      existing.artist === inc.artist &&
      existing.album === inc.album &&
      (existing.duration ?? 0) === (inc.duration ?? 0);

    if (same) {
      return { incoming: inc, existing, status: 'exact' as const };
    }

    return { incoming: inc, existing, status: 'conflict' as const };
  });
}
