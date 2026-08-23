import { useUI } from '../store/ui';
import { ListenIcon, BrowseIcon, LibraryIcon, SearchIcon } from './Icons';
import type { JSX } from 'react';

const tabs = [
  { id: 'listen', label: 'Listen Now', icon: ListenIcon },
  { id: 'browse', label: 'Browse', icon: BrowseIcon },
  { id: 'library', label: 'Library', icon: LibraryIcon },
  { id: 'search', label: 'Search', icon: SearchIcon }
] as const;

export function TabBar(): JSX.Element {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);

  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <button key={t.id} className={`tab-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
          <t.icon size={26} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
