import { useUI } from '../store/ui';
import { ListenIcon, SparklesIcon, BrowseIcon, LibraryIcon, SearchIcon, SettingsIcon } from './Icons';
import type { JSX } from 'react';

const tabs = [
  { id: 'listen', label: 'Listen Now', icon: ListenIcon },
  { id: 'forYou', label: 'For You', icon: SparklesIcon },
  { id: 'browse', label: 'Browse', icon: BrowseIcon },
  { id: 'library', label: 'Library', icon: LibraryIcon },
  { id: 'search', label: 'Search', icon: SearchIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon }
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
