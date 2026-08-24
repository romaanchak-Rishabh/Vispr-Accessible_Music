import { useRef, useState } from 'react';
import type { JSX } from 'react';
import type { YtItem } from '../lib/ytdlp';
import { Artwork } from './Artwork';
import { blobToDataUrl } from '../lib/metadata';

export interface ImportOverrides {
  title?: string;
  artist?: string;
  album?: string;
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
      if (e.title?.trim() || e.artist?.trim() || e.album?.trim() || e.artwork) out[item.id] = e;
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
                <div key={item.id} style={{ display: 'flex', gap: 12 }}>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
                    <input
                      className="search-input"
                      style={{ paddingLeft: 10, fontSize: 14 }}
                      value={e.title ?? item.title ?? ''}
                      placeholder="Title"
                      onChange={(ev) => setEdit(item.id, { title: ev.target.value })}
                    />
                    <input
                      className="search-input"
                      style={{ paddingLeft: 10, fontSize: 14 }}
                      value={e.artist ?? item.uploader ?? ''}
                      placeholder="Artist"
                      onChange={(ev) => setEdit(item.id, { artist: ev.target.value })}
                    />
                  </div>
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
