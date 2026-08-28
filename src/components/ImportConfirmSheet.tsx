import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { YtItem } from '../lib/ytdlp';
import { Artwork } from './Artwork';
import { blobToDataUrl } from '../lib/metadata';
import { TagInput } from './TagInput';
import { useLibrary } from '../store/library';
import { GENRE_OPTIONS, YEAR_OPTIONS, yearToEraValue, eraToDisplayValue, formatGenre } from '../lib/tags';
import { lookupMetadata, yearToEra } from '../lib/metadataLookup';

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

type FieldKey = 'title' | 'artist' | 'artist2' | 'album' | 'genre1' | 'genre2' | 'year';

interface FieldDef {
  key: FieldKey;
  label: string;
  hint: string;
  skipLabel: string;
}

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title', hint: 'Use the YouTube title or type your own.', skipLabel: 'Use YouTube title' },
  { key: 'artist', label: 'Artist 1', hint: 'Main artist, vocalist or composer.', skipLabel: 'Use channel name' },
  { key: 'artist2', label: 'Artist 2', hint: 'Featured / second artist, if any.', skipLabel: 'No second artist' },
  { key: 'album', label: 'Film / Album', hint: 'Aashiqui 2, Dil Bechara, …', skipLabel: 'No film / album' },
  { key: 'genre1', label: 'Tag 1', hint: 'Genre, e.g. Bollywood, Rock…', skipLabel: 'No Tag 1' },
  { key: 'genre2', label: 'Tag 2', hint: 'Second genre, e.g. Hindi, Pop…', skipLabel: 'No Tag 2' },
  { key: 'year', label: 'Year', hint: 'Release era of the song.', skipLabel: 'No year' }
];

const defaultForKey = (item: YtItem, key: FieldKey): string => {
  switch (key) {
    case 'title':
      return item.title ?? '';
    case 'artist':
      return item.uploader ?? '';
    case 'artist2':
      return '';
    case 'album':
      return item.playlist_title ?? '';
    default:
      return '';
  }
};

export function ImportConfirmSheet({ items, onConfirm, onCancel }: Props): JSX.Element | null {
  const [edits, setEdits] = useState<Record<string, ImportOverrides>>({});
  const [songIdx, setSongIdx] = useState(0);
  const [fieldIdx, setFieldIdx] = useState(0);
  const [stage, setStage] = useState<'ask' | 'finish'>('ask');
  const [dontAsk, setDontAsk] = useState(false);
  const [lookup, setLookup] = useState<Record<string, 'pending' | 'done' | 'none'>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const libraryTracks = useLibrary((s) => s.tracks);
  const allAlbums = useLibrary((s) => s.albums);

  if (items.length === 0) return null;

  const artistOptions = [...new Set(libraryTracks.map((t) => t.artist).concat(libraryTracks.map((t) => t.artist2 ?? '')))]
    .filter(Boolean)
    .sort();
  const albumOptions = [...new Set(allAlbums.map((a) => a.title).concat(items.map((i) => i.playlist_title ?? '')))].filter(Boolean).sort();

  const item = items[songIdx];
  const field = FIELDS[fieldIdx];
  const showYear = field.key === 'year';

  // Auto-prefill artist/album/year/genre from a free music API (no key needed).
  // Only fills fields the user hasn't set yet; never overwrites their answers.
  useEffect(() => {
    const it = items[songIdx];
    if (!it) return;
    if (lookup[it.id] === 'done' || lookup[it.id] === 'none') return;
    const title = (it.title ?? '')
      .replace(/\s*\((official\s*)?(lyric|lyrics|audio|audio\s*only|video|official\s*video|music\s*video|full\s*song|song|hd|4k|extended)\)\s*$/i, '')
      .replace(/\s*-\s*(topic|official|lyrics?)\s*$/i, '')
      .trim();
    if (!title) {
      setLookup((prev) => ({ ...prev, [it.id]: 'none' }));
      return;
    }
    setLookup((prev) => ({ ...prev, [it.id]: 'pending' }));
    let cancelled = false;
    let applied = false;
    void lookupMetadata(title, it.uploader)
      .then((res) => {
        if (cancelled || !res) return;
        const era = yearToEra(res.year);
        if (res.artist || res.album || res.genre || era) applied = true;
        setEdits((prev) => {
          const cur = prev[it.id] ?? {};
          const next: ImportOverrides = { ...cur };
          if (!next.artist && res.artist) next.artist = res.artist;
          if (!next.album && res.album) next.album = res.album;
          if (!next.genre1 && res.genre) next.genre1 = res.genre;
          if (!next.year && era && !cur.year) next.year = era;
          return { ...prev, [it.id]: next };
        });
      })
      .finally(() => {
        if (!cancelled) setLookup((prev) => ({ ...prev, [it.id]: applied ? 'done' : 'none' }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songIdx, items]);

  const getValue = (it: YtItem, key: FieldKey): string => {
    const ov = edits[it.id];
    const v = ov?.[key];
    if (v != null && v !== '') return v;
    return defaultForKey(it, key);
  };

  const setField = (it: YtItem, key: FieldKey, val: string): void => {
    const trimmed = val.trim();
    setEdits((prev) => {
      const cur = prev[it.id] ?? {};
      const next: ImportOverrides = { ...cur };
      if (trimmed) next[key] = trimmed;
      else delete next[key];
      return { ...prev, [it.id]: next };
    });
  };

  const currentValue = getValue(item, field.key);
  const currentDisplayValue = showYear
    ? eraToDisplayValue(currentValue)
    : field.key.startsWith('genre')
      ? formatGenre(currentValue)
      : currentValue;

  const handleValue = (raw: string): void => {
    const stored = showYear ? yearToEraValue(raw) : raw;
    setField(item, field.key, stored);
    if (field.key !== 'title') {
      // picking an option auto-advances; typing stays put
      advance();
    }
  };

  const advance = (): void => {
    if (fieldIdx < FIELDS.length - 1) {
      setFieldIdx(fieldIdx + 1);
    } else if (songIdx < items.length - 1) {
      setSongIdx(songIdx + 1);
      setFieldIdx(0);
    } else {
      setStage('finish');
    }
  };

  const skip = (): void => {
    setField(item, field.key, '');
    advance();
  };

  const back = (): void => {
    if (stage === 'finish') {
      setStage('ask');
      return;
    }
    if (fieldIdx > 0) {
      setFieldIdx(fieldIdx - 1);
    } else if (songIdx > 0) {
      setSongIdx(songIdx - 1);
      setFieldIdx(FIELDS.length - 1);
    }
  };

  const buildOverrides = (): Record<string, ImportOverrides> => {
    const out: Record<string, ImportOverrides> = {};
    for (const it of items) {
      const ov = edits[it.id];
      if (!ov) continue;
      const clean: ImportOverrides = {};
      if (ov.title?.trim()) clean.title = ov.title.trim();
      if (ov.artist?.trim()) clean.artist = ov.artist.trim();
      if (ov.artist2?.trim()) clean.artist2 = ov.artist2.trim();
      if (ov.album?.trim()) clean.album = ov.album.trim();
      if (ov.genre1?.trim()) clean.genre1 = ov.genre1.trim();
      if (ov.genre2?.trim()) clean.genre2 = ov.genre2.trim();
      if (ov.year?.trim()) clean.year = ov.year.trim();
      if (ov.artwork) clean.artwork = ov.artwork;
      if (Object.keys(clean).length > 0) out[it.id] = clean;
    }
    return out;
  };

  const answeredCount = () => Object.values(edits).filter((e) => e && (e.title?.trim() || e.artist?.trim() || e.artist2?.trim() || e.album?.trim() || e.genre1?.trim() || e.genre2?.trim() || e.year?.trim())).length;

  const pickArtwork = async (file: File): Promise<void> => {
    const dataUrl = await blobToDataUrl(file, 640);
    if (dataUrl) {
      setEdits((prev) => ({ ...prev, [item.id]: { ...prev[item.id], artwork: dataUrl } }));
    }
  };

  const totalSteps = items.length * FIELDS.length;
  const stepNo = stage === 'finish' ? totalSteps : songIdx * FIELDS.length + fieldIdx + 1;

  const optionsFor = (key: FieldKey): readonly string[] => {
    switch (key) {
      case 'artist':
      case 'artist2':
        return artistOptions;
      case 'album':
        return albumOptions;
      case 'genre1':
      case 'genre2':
        return GENRE_OPTIONS;
      case 'year':
        return YEAR_OPTIONS;
      default:
        return [];
    }
  };

  const canGoBack = songIdx > 0 || fieldIdx > 0;
  const isLast = fieldIdx === FIELDS.length - 1 && songIdx === items.length - 1;

  return (
    <div className="sheet-overlay" style={{ alignItems: 'flex-start', justifyContent: 'center', paddingTop: 24, paddingBottom: 20, overflowY: 'auto' }} onClick={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minHeight: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="import-wizard">
          <div className="import-wizard-head">
            <button className="pill-btn" style={{ fontSize: 13, padding: '5px 12px' }} onClick={onCancel}>
              Cancel
            </button>
            <span style={{ fontSize: 16, fontWeight: 600, flex: 1, textAlign: 'center' }}>
              {stage === 'finish' ? 'Finish import' : `Song ${songIdx + 1} of ${items.length}`}
            </span>
            <span style={{ fontSize: 12, color: 'var(--label-secondary)', minWidth: 40, textAlign: 'right' }}>{stepNo}/{totalSteps}</span>
          </div>

          <div style={{ height: 3, background: 'var(--fill-1)', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ height: '100%', background: 'var(--accent)', transition: 'width 180ms ease', width: `${(stepNo / totalSteps) * 100}%` }} />
          </div>

          {stage === 'ask' ? (
            <div className="import-wizard-body">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
                  aria-label="Change cover art"
                >
                  <Artwork src={edits[item.id]?.artwork ?? item.thumbnail} className="row-artwork" placeholderSize={26} alt="" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    if (f) void pickArtwork(f);
                    ev.target.value = '';
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getValue(item, 'title')}</div>
                  <div style={{ fontSize: 12, color: 'var(--label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.uploader ?? ''}
                    {lookup[item.id] === 'pending' && <span style={{ color: 'var(--accent)' }}> · looking up metadata…</span>}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{field.label}?</div>
                <div style={{ fontSize: 12, color: 'var(--label-secondary)', marginBottom: 6 }}>{field.hint}</div>
              </div>

              {field.key === 'title' ? (
                <input
                  key={field.key}
                  className="search-input"
                  style={{ paddingLeft: 12, fontSize: 16, padding: '11px 12px 11px 34px' }}
                  placeholder={item.title ?? 'Title'}
                  value={currentValue}
                  onChange={(e) => setField(item, 'title', e.target.value)}
                />
              ) : (
                <TagInput
                  key={field.key}
                  value={currentDisplayValue}
                  onChange={handleValue}
                  options={optionsFor(field.key)}
                  placeholder={defaultForKey(item, field.key) || field.hint}
                />
              )}

              <button className="pill-btn" onClick={() => setStage('finish')} style={{ alignSelf: 'flex-end', fontSize: 13, padding: '5px 12px' }}>
                Skip All
              </button>
            </div>
          ) : (
            <div style={{ padding: '16px 16px 6px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', minHeight: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Apply this review?</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--label-secondary)', lineHeight: 1.5 }}>
                {answeredCount()} of {items.length} song{items.length > 1 ? 's' : ''} have your answers. Choose how to finish the import.
              </p>
              <button className="pill-btn primary" onClick={() => onConfirm(buildOverrides(), dontAsk)}>
                Apply answers so far
              </button>
              <button className="pill-btn" onClick={() => onConfirm({}, dontAsk)}>
                Use defaults for everything
              </button>
              <button className="pill-btn" onClick={() => setStage('ask')}>
                Keep editing
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--label-secondary)', cursor: 'pointer', marginTop: 4 }}>
                <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
                Don&apos;t ask again — save imports automatically
              </label>
            </div>
          )}

          {stage === 'ask' && (
            <div className="import-wizard-actions">
              <button className="pill-btn" onClick={back} disabled={!canGoBack} style={{ opacity: canGoBack ? 1 : 0.4 }}>
                Back
              </button>
              <button className="pill-btn" onClick={skip}>
                Skip
              </button>
              <button className="pill-btn primary" onClick={advance}>
                {isLast ? 'Finish' : 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}