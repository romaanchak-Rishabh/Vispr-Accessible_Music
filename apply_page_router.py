import re

with open('C:/Users/user/Desktop/opencode/apple-music-clone/src/components/PageRouter.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
old_imports = """import { useEffect, useMemo, useState, useCallback } from 'react';
import type { JSX } from 'react';
import { useLibrary, getFavourites, getMostListened, isAutoPlaylist, AUTO_FAVOURITES_ID, AUTO_MOST_LISTENED_ID } from '../store/library';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import type { Album, Artist } from '../types';
import { formatArtist } from '../types';
import { TrackRow } from './TrackRow';
import { Artwork } from './Artwork';
import { EmptyLibrary, AlbumCard } from './Views';
import { ImportBar } from './ImportBar';
import { ChevronRightIcon, PlusCircleIcon, EllipsisIcon, ShuffleIcon, PlayIcon, SparklesIcon } from './Icons';
import { getRecommendations, getSmartRecommendations, type Recommendation } from '../lib/recommender';
import { getTrackProfile } from '../lib/classifier';
import { formatGenre } from '../lib/tags';"""

new_imports = """import { useEffect, useMemo, useState, useCallback } from 'react';
import type { JSX } from 'react';
import { useLibrary, getFavourites, getMostListened, isAutoPlaylist, AUTO_FAVOURITES_ID, AUTO_MOST_LISTENED_ID } from '../store/library';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import type { Album, Artist, Track } from '../types';
import { formatArtist } from '../types';
import { TrackRow } from './TrackRow';
import { Artwork } from './Artwork';
import { EmptyLibrary, AlbumCard } from './Views';
import { ImportBar } from './ImportBar';
import { ChevronRightIcon, PlusCircleIcon, EllipsisIcon, ShuffleIcon, PlayIcon, SparklesIcon } from './Icons';
import { getRecommendations, getSmartRecommendations, type Recommendation } from '../lib/recommender';
import { getTrackProfile } from '../lib/classifier';
import { formatGenre } from '../lib/tags';"""

content = content.replace(old_imports, new_imports)

# Add MixDetailView component after PlaylistDetailView
old_playlist_end = """    }
  );
}

/* ── For You — NLP recommendations ──────────────────────────────────── */"""

new_content_after_playlist = """  );
}

/* ── Mix Detail View ────────────────────────────────────────────────── */

function MixDetailView({ mix }: { mix: { id: string; title: string; subtitle: string; icon: React.ReactNode; gradient: string; tracks: Track[] } }): JSX.Element | null {
  const playTracks = usePlayer((s) => s.playTracks);

  if (!mix || mix.tracks.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--label-secondary)' }}>Mix not found</div>;
  }

  return (
    <div className="fade-page">
      <DetailHeader
        kicker="Mix"
        title={mix.title}
        subtitle={mix.subtitle}
        artwork={mix.tracks[0]?.artwork}
      >
        <button
          className="pill-btn primary"
          disabled={mix.tracks.length === 0}
          style={mix.tracks.length === 0 ? { opacity: 0.5 } : undefined}
          onClick={() => playTracks(mix.tracks, 0, mix.title)}
        >
          <PlayIcon size={15} /> Play
        </button>
        <button
          className="pill-btn"
          onClick={() => {
            const shuffled = [...mix.tracks].sort(() => Math.random() - 0.5);
            playTracks(shuffled, 0, mix.title + ' — Shuffle');
          }}
        >
          <ShuffleIcon size={15} /> Shuffle
        </button>
      </DetailHeader>
      <div className="group">
        {mix.tracks.map((t) => (
          <TrackRow key={t.id} track={t} />
        ))}
      </div>
    </div>
  );
}

/* ── For You — NLP recommendations ──────────────────────────────────── */"""

content = content.replace(
    '/* ── For You — NLP recommendations ──────────────────────────────────── */',
    new_content_after_playlist
)

# Add case for mix-detail in switch statement
old_switch = """    case 'playlist':
      return <PlaylistDetailView playlistId={page.id} />;
    case 'settings':
      return <SettingsPage />;
  }
}"""

new_switch = """    case 'playlist':
      return <PlaylistDetailView playlistId={page.id} />;
    case 'mix-detail':
      return <MixDetailView mix={page} />;
    case 'settings':
      return <SettingsPage />;
  }
}"""

content = content.replace(old_switch, new_switch)

with open('C:/Users/user/Desktop/opencode/apple-music-clone/src/components/PageRouter.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated PageRouter.tsx")