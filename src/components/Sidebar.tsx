import type { JSX } from 'react';
import { useUI, type Page } from '../store/ui';
import { useLibrary } from '../store/library';
import { AUTO_PLAYLISTS } from '../store/library';
import { ListenIcon, SparklesIcon, BrowseIcon, LibraryIcon, SearchIcon, MusicNoteIcon, PlusCircleIcon, SettingsIcon } from './Icons';

export function Sidebar(): JSX.Element {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const navigate = useUI((s) => s.navigate);
  const pageStack = useUI((s) => s.pageStack);
  const page = pageStack[pageStack.length - 1];
  const playlists = useLibrary((s) => s.playlists);
  const status = useLibrary((s) => s.status);

  const isPage = (p: Page): boolean => JSON.stringify(page) === JSON.stringify(p);

  return (
    <aside className="sidebar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 10px' }}>
        <img src="/favicon.svg" alt="" style={{ width: 30, height: 30, borderRadius: 7 }} draggable={false} />
        <span style={{ fontWeight: 700, fontSize: 16 }}>Vispr</span>
      </div>

      <button className={`sidebar-item ${tab === 'listen' ? 'active' : ''}`} onClick={() => setTab('listen')}>
        <ListenIcon size={20} /> Listen Now
      </button>
      <button className={`sidebar-item ${tab === 'forYou' ? 'active' : ''}`} onClick={() => setTab('forYou')}>
        <SparklesIcon size={20} /> For You
      </button>
      <button className={`sidebar-item ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>
        <BrowseIcon size={20} /> Browse
      </button>
      <button className={`sidebar-item ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>
        <SearchIcon size={20} /> Search
      </button>

      <div className="sidebar-section-label">Library</div>
      <button
        className={`sidebar-item ${isPage({ type: 'library', section: 'songs' }) || (tab === 'library' && !isPage({ type: 'library' })) ? 'active' : ''}`}
        onClick={() => setTab('library')}
      >
        <LibraryIcon size={20} /> Songs
      </button>
      <button
        className={`sidebar-item ${isPage({ type: 'library', section: 'albums' }) ? 'active' : ''}`}
        onClick={() => {
          setTab('library');
          navigate({ type: 'library', section: 'albums' });
        }}
      >
        <MusicNoteIcon size={18} /> Albums
      </button>
      <button
        className={`sidebar-item ${isPage({ type: 'library', section: 'artists' }) ? 'active' : ''}`}
        onClick={() => {
          setTab('library');
          navigate({ type: 'library', section: 'artists' });
        }}
      >
        <MusicNoteIcon size={18} /> Artists
      </button>
      <button
        className={`sidebar-item ${isPage({ type: 'library', section: 'recent' }) ? 'active' : ''}`}
        onClick={() => {
          setTab('library');
          navigate({ type: 'library', section: 'recent' });
        }}
      >
        <MusicNoteIcon size={18} /> Recently Added
      </button>

      <div className="sidebar-section-label">Playlists</div>
      {AUTO_PLAYLISTS.map((pl) => (
        <button
          key={pl.id}
          className={`sidebar-item ${isPage({ type: 'playlist', id: pl.id }) ? 'active' : ''}`}
          onClick={() => navigate({ type: 'playlist', id: pl.id })}
        >
          <MusicNoteIcon size={16} /> {pl.name}
        </button>
      ))}
      {playlists.map((p) => (
        <button
          key={p.id}
          className={`sidebar-item ${isPage({ type: 'playlist', id: p.id }) ? 'active' : ''}`}
          onClick={() => navigate({ type: 'playlist', id: p.id })}
        >
          <MusicNoteIcon size={16} /> {p.name}
        </button>
      ))}
      <button
        className="sidebar-item"
        disabled={status !== 'ready'}
        onClick={() => {
          setTab('library');
          navigate({ type: 'library', section: 'playlists' });
        }}
      >
        <PlusCircleIcon size={18} /> New Playlist
      </button>

      <button
        className={`sidebar-item ${isPage({ type: 'settings' }) ? 'active' : ''}`}
        onClick={() => setTab('settings')}
      >
        <SettingsIcon size={20} /> Settings
      </button>

      <div style={{ marginTop: 'auto', padding: 12 }}>
        {status === 'empty' && (
          <button className="cta-btn" style={{ width: '100%', margin: 0 }} onClick={() => void useLibrary.getState().connectFolder()}>
            Connect Music Folder
          </button>
        )}
      </div>
    </aside>
  );
}
