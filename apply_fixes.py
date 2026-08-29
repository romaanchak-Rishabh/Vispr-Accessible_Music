import re

with open('C:/Users/user/Desktop/opencode/apple-music-clone/src/store/ui.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports and Page type in ui.ts
old_ui_import = "import { create } from 'zustand';"
new_ui_import = "import { create } from 'zustand';\nimport type { Track } from '../types';"

content = content.replace(old_ui_import, new_ui_import)

old_page_type = """export type Page =
  | { type: 'listen' }
  | { type: 'forYou' }
  | { type: 'browse' }
  | { type: 'library'; section?: 'playlists' | 'artists' | 'albums' | 'songs' | 'recent' }
  | { type: 'search' }
  | { type: 'album'; key: string }
  | { type: 'artist'; name: string }
  | { type: 'playlist'; id: string }
  | { type: 'settings' };"""

new_page_type = """export type Page =
  | { type: 'listen' }
  | { type: 'forYou' }
  | { type: 'browse' }
  | { type: 'library'; section?: 'playlists' | 'artists' | 'albums' | 'songs' | 'recent' }
  | { type: 'search' }
  | { type: 'album'; key: string }
  | { type: 'artist'; name: string }
  | { type: 'playlist'; id: string }
  | { type: 'mix-detail'; id: string; title: string; subtitle: string; icon: React.ReactNode; gradient: string; tracks: Track[] }
  | { type: 'settings' };"""

content = content.replace(old_page_type, new_page_type)

with open('C:/Users/user/Desktop/opencode/apple-music-clone/src/store/ui.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated ui.ts")