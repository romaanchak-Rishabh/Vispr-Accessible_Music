import type { JSX } from 'react';
import { useState } from 'react';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import { Artwork } from './Artwork';
import { ImportBar } from './ImportBar';
import { PostImportSheet } from './PostImportSheet';
import { FolderIcon, SpinnerIcon, ChevronRightIcon } from './Icons';
import type { Album } from '../types';

export function ListenNowView(): JSX.Element {
  const status = useLibrary((s) => s.status);
  const scanning = useLibrary((s) => s.scanning);
  const scanProgress = useLibrary((s) => s.scanProgress);
  const recentlyAdded = useLibrary((s) => s.tracks.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 20));
  const albums = useLibrary((s) => s.albums);
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed);
  const playCounts = usePlayer((s) => s.playCounts);

  if (status === 'loading') {
    return (
      <div className="empty-state">
        <SpinnerIcon size={32} />
        <p>Loading your library…</p>
      </div>
    );
  }

  if (status === 'empty' || status === 'needs-permission') {
    return (
      <>
        <h1 className="large-title">Listen Now</h1>
        <EmptyLibrary />
      </>
    );
  }

  const topPlayed = [...Object.entries(playCounts)]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id]) => id);

  const jumpBackIn = albums.slice(0, 12);

  return (
    <div className="fade-page">
      <h1 className="large-title">Listen Now</h1>

      {recentlyPlayed.length > 0 && (
        <>
          <h2 className="section-header" style={{ paddingTop: 4 }}>
            Recently Played
          </h2>
          <div className="hscroll">
            {recentlyPlayed.slice(0, 16).map(({ track }) => (
              <RecentCard key={track.id} trackId={track.id} />
            ))}
          </div>
        </>
      )}

      {topPlayed.length > 0 && (
        <>
          <h2 className="section-header">Top Plays</h2>
          <div className="group">
            {topPlayed.slice(0, 5).map((id, i) => {
              const track = useLibrary.getState().byId[id];
              if (!track) return null;
              return <TopTrackRow key={id} trackId={id} rank={i + 1} />;
            })}
          </div>
        </>
      )}

      {jumpBackIn.length > 0 && (
        <>
          <SectionRow title="Jump Back In" onSeeAll={() => useUI.getState().navigate({ type: 'library', section: 'albums' })} />
          <div className="hscroll">
            {jumpBackIn.map((a) => (
              <AlbumCard key={a.key} album={a} size={150} />
            ))}
          </div>
        </>
      )}

      {recentlyAdded.length > 0 && (
        <>
          <h2 className="section-header">Recently Added</h2>
          <div className="hscroll">
            {recentlyAdded.map((t) => (
              <RecentCard key={t.id} trackId={t.id} />
            ))}
          </div>
        </>
      )}

      {scanning && scanProgress && (
        <p className="scan-progress">
          Importing music… {scanProgress.found > 0 ? `${scanProgress.scanned}/${scanProgress.found}` : 'scanning folder'}
        </p>
      )}
    </div>
  );
}

export function EmptyLibrary(): JSX.Element {
  const status = useLibrary((s) => s.status);
  const scanning = useLibrary((s) => s.scanning);
  const scanProgress = useLibrary((s) => s.scanProgress);
  const connectFolder = useLibrary((s) => s.connectFolder);
  const addFiles = useLibrary((s) => s.addFiles);
  const [postImportIds, setPostImportIds] = useState<string[] | null>(null);

  const pickFilesAndTag = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus';
    input.onchange = () => {
      if (input.files) {
        void addFiles(Array.from(input.files)).then((ids) => {
          if (ids.length > 0) setPostImportIds(ids);
        });
      }
    };
    input.click();
  };

  if (scanning) {
    return (
      <div className="empty-state">
        <SpinnerIcon size={36} />
        <h2>Importing your music…</h2>
        <p>Keep this page open while your library is scanned.</p>
        {scanProgress && scanProgress.found > 0 && (
          <p style={{ marginTop: 10, fontSize: 14, color: 'var(--label)' }}>
            {scanProgress.scanned}/{scanProgress.found}
            {scanProgress.label ? ` — ${scanProgress.label}` : ''}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="empty-state">
      <span
        className="art-placeholder"
        style={{ width: 84, height: 84, borderRadius: 22 }}
      >
        <FolderIcon size={40} />
      </span>
      <h2>Your music library is empty</h2>
      <p>
        Connect the Music folder on your phone or computer once — it stays connected across sessions. You can also pick
        individual songs or folders manually.
      </p>
      {status === 'needs-permission' ? (
        <>
          <button className="cta-btn" onClick={() => void useLibrary.getState().reconnectFolder()}>
            Reconnect Folder
          </button>
          <button className="cta-btn secondary" onClick={pickFilesAndTag}>
            Choose Files Instead
          </button>
        </>
      ) : (
        <>
          <button className="cta-btn" onClick={() => void connectFolder()}>
            Connect Music Folder
          </button>
          <button className="cta-btn secondary" onClick={pickFilesAndTag}>
            Choose Files Instead
          </button>
        </>
      )}
      <ImportBar />
      {postImportIds && (
        <PostImportSheet trackIds={postImportIds} onClose={() => setPostImportIds(null)} />
      )}
    </div>
  );
}

function RecentCard({ trackId }: { trackId: string }): JSX.Element | null {
  const track = useLibrary((s) => s.byId[trackId]);
  const playTracks = usePlayer((s) => s.playTracks);
  const openNowPlaying = useUI((s) => s.openNowPlaying);
  if (!track) return null;
  return (
    <button
      className="card"
      style={{ width: 110, background: 'none' }}
      onClick={() => {
        playTracks([track], 0);
        openNowPlaying();
      }}
    >
      <Artwork src={track.artwork} className="card-artwork" placeholderSize={28} alt="" style={{ width: 110, height: 110 } as React.CSSProperties} />
      <div className="card-title">{track.title}</div>
      <div className="card-subtitle">{track.artist}</div>
    </button>
  );
}

function TopTrackRow({ trackId, rank }: { trackId: string; rank: number }): JSX.Element | null {
  const track = useLibrary((s) => s.byId[trackId]);
  const counts = usePlayer((s) => s.playCounts[trackId]);
  const playTracks = usePlayer((s) => s.playTracks);
  if (!track) return null;
  return (
    <button
      className="row"
      onClick={() => playTracks([track], 0)}
    >
      <span style={{ width: 24, textAlign: 'center', color: 'var(--accent)', fontWeight: 700, fontSize: 15 }}>{rank}</span>
      <Artwork src={track.artwork} className="row-artwork" placeholderSize={18} alt="" />
      <span className="row-texts">
        <span className="row-title" style={{ display: 'block' }}>
          {track.title}
        </span>
        <span className="row-subtitle" style={{ display: 'block' }}>
          {track.artist}
        </span>
      </span>
      <span className="row-trailing">{counts ?? ''}</span>
    </button>
  );
}

export function AlbumCard({ album, size = 150 }: { album: Album; size?: number }): JSX.Element | null {
  const navigate = useUI((s) => s.navigate);
  return (
    <button className="card" style={{ width: size, background: 'none' }} onClick={() => navigate({ type: 'album', key: album.key })}>
      <Artwork src={album.artwork} className="card-artwork" placeholderSize={30} alt={album.title} style={{ width: size, height: size } as React.CSSProperties} />
      <div className="card-title">{album.title}</div>
      <div className="card-subtitle">{album.artist}</div>
    </button>
  );
}

export function SectionRow({ title, onSeeAll }: { title: string; onSeeAll: () => void }): JSX.Element {
  return (
    <button
      className="section-header"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 'calc(100% - 32px)', margin: '18px 16px 0' }}
      onClick={onSeeAll}
    >
      {title}
      <ChevronRightIcon size={18} />
    </button>
  );
}
