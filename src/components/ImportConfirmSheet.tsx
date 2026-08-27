import { useRef, useState } from 'react';
import type { JSX } from 'react';
import type { YtItem } from '../lib/ytdlp';
import { Artwork } from './Artwork';
import { blobToDataUrl } from '../lib/metadata';
import { TagInput } from './TagInput';
import { useLibrary } from '../store/library';
import { GENRE_OPTIONS, YEAR_OPTIONS, yearToEraValue, eraToDisplayValue } from '../lib/tags';

export interface ImportOverrides {
  title?: string;
  artist?: string;
  artist2?: string;
  album?: string;
  genre1?: string;
  genre2?: string;
  year?: string;
  artwork?: string;
}

interface Props {
  items: YtItem[];
  onConfirm: (overrides: Record<string, ImportOverrides>, dontAskAgain: boolean) => void;
  onCancel: () => void;
}

export function ImportConfirmSheet({ items, onConfirm, onCancel }: Props): JSX.Element {
  const [edits, setEdits] = useState<Record<string, ImportOverrides>>({});
  const [dontAsk, setDontAsk] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const libraryTracks = useLibrary((s) => s.tracks);
  const allAlbums = useLibrary((s) => s.albums);

  const artistOptions = [...new Set(libraryTracks.map((t) => t.artist).concat(libraryTracks.map((t) => t.artist2 ?? '')))]
    .filter(Boolean)
    .sort();
  const albumOptions = [...new Set(allAlbums.map((a) => a.title))].sort();

  const getEdit = (item: YtItem): ImportOverrides => edits[item.id] ?? {};

  const setEdit = (id: string, patch: Partial<ImportOverrides>): void => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const pickArtwork = async (id: string, file: File): Promise<void> => {
    const dataUrl = await blobToDataUrl(file, 640);
    if (dataUrl) setEdit(id, { artwork: dataUrl });
  };

  const buildOverrides = (): Record<string, ImportOverrides> => {
    const out: Record<string, ImportOverrides> = {};
    for (const item of items) {
      const e = getEdit(item);
      if (
        e.title?.trim() || e.artist?.trim() || e.artist2?.trim() || e.album?.trim() ||
        e.genre1?.trim() || e.genre2?.trim() || e.year?.trim() || e.artwork
      ) {
        out[item.id] = {
          title: e.title?.trim() || undefined,
          artist: e.artist?.trim() || undefined,
          artist2: e.artist2?.trim() || undefined,
          album: e.album?.trim() || undefined,
          genre1: e.genre1?.trim() || undefined,
          genre2: e.genre2?.trim() || undefined,
          year: e.year?.trim() || undefined,
          artwork: e.artwork
        };
      }
    }
    return out;
  };

  return (
    <div className="sheet-overlay" style={{ alignItems: 'flex-end', justifyContent: 'center' }} onClick={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="action-sheet" style={{ width: 'min(460px, 100%)' }}>
          <div className="action-sheet-head">
            <span style={{ fontSize: 17, fontWeight: 600 }}>
              Confirm Import{items.length > 1 ? ` (${items.length} songs)` : ''}
            </span>
          </div>
          <div style={{ maxHeight: '52vh', overflowY: 'auto', padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {items.map((item) => {
              const e = getEdit(item);
              return (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--fill-secondary)',
                    borderRadius: 12,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      onClick={() => fileRefs.current[item.id]?.click()}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-start' }}
                      aria-label="Change cover art"
                    >
                      <Artwork
                        src={e.artwork ?? item.thumbnail}
                        className="row-artwork"
                        placeholderSize={22}
                        alt=""
                      />
                    </button>
                    <input
                      ref={(el) => {
                        fileRefs.current[item.id] = el;
                      }}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(ev) => {
                        const f = ev.target.files?.[0];
                        if (f) void pickArtwork(item.id, f);
                        ev.target.value = '';
                      }}
                    />
                    <input
                      className="search-input"
                      style={{ paddingLeft: 10, fontSize: 14, flex: 1 }}
                      value={e.title ?? item.title ?? ''}
                      placeholder="Title"
                      onChange={(ev) => setEdit(item.id, { title: ev.target.value })}
                    />
                  </div>

                  <TagInput
                    label="Artist 1"
                    placeholder={item.uploader || 'Search artist…'}
                    value={e.artist ?? item.uploader ?? ''}
                    onChange={(v) => setEdit(item.id, { artist: v })}
                    options={artistOptions}
                  />

                  <TagInput
                    label="Artist 2"
                    placeholder="Featuring / second artist…"
                    value={e.artist2 ?? ''}
                    onChange={(v) => setEdit(item.id, { artist2: v })}
                    options={artistOptions}
                  />

                  <TagInput
                    label="Film / Album"
                    placeholder={item.playlist_title || 'Search album or movie…'}
                    value={e.album ?? item.playlist_title ?? ''}
                    onChange={(v) => setEdit(item.id, { album: v })}
                    options={albumOptions}
                  />

                  <div style={{ display: 'flex', gap: 8 }}>
                    <TagInput
                      label="Tag 1"
                      placeholder="Genre…"
                      value={e.genre1 ?? ''}
                      onChange={(v) => setEdit(item.id, { genre1: v })}
                      options={GENRE_OPTIONS}
                    />
                    <TagInput
                      label="Tag 2"
                      placeholder="Genre…"
                      value={e.genre2 ?? ''}
                      onChange={(v) => setEdit(item.id, { genre2: v })}
                      options={GENRE_OPTIONS}
                    />
                  </div>

                  <TagInput
                    label="Year"
                    placeholder="2024, New, Classic…"
                    value={eraToDisplayValue(e.year ?? '')}
                    onChange={(v) => setEdit(item.id, { year: yearToEraValue(v) })}
                    options={YEAR_OPTIONS}
                  />
                </div>
              );
            })}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 0', fontSize: 13, color: 'var(--label-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
            Don&apos;t ask again — save imports automatically
          </label>
          <div style={{ display: 'flex', gap: 8, padding: 14 }}>
            <button className="pill-btn primary" style={{ flex: 1 }} onClick={() => onConfirm(buildOverrides(), dontAsk)}>
              Save
            </button>
            <button
              className="pill-btn"
              onClick={() => {
                if (dontAsk) setEdits({});
                onConfirm({}, dontAsk);
              }}
            >
              Skip
            </button>
            <button className="pill-btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
