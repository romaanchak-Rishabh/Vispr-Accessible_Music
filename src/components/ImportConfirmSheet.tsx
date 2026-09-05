import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { YtItem } from '../lib/ytdlp';
import { Artwork } from './Artwork';
import { TagInput } from './TagInput';
import { useLibrary } from '../store/library';
import { GENRE_OPTIONS, YEAR_OPTIONS, yearToEraValue, eraToDisplayValue, formatGenre } from '../lib/tags';
import { fetchGeminiMetadata, mapGeminiGenres, getGeminiApiKey, type GeminiMetadata } from '../lib/geminiMetadata';
import { SONG_TYPE_OPTIONS } from '../types';
import { SparklesIcon } from './Icons';

export interface ImportOverrides {
  title?: string;
  artist?: string;
  artist2?: string;
  album?: string;
  genre1?: string;
  genre2?: string;
  year?: string;
  artwork?: string;
  artists?: string[];
  genres?: string[];
  tags?: string[];
  mood?: string;
  language?: string;
  songType?: string;
}

interface Props {
  items: YtItem[];
  onConfirm: (overrides: Record<string, ImportOverrides>, dontAskAgain: boolean) => void;
  onCancel: () => void;
}

type FieldKey = 'title' | 'artist' | 'artist2' | 'album' | 'genre1' | 'genre2' | 'year' | 'songType';

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
  { key: 'year', label: 'Year', hint: 'Release era of the song.', skipLabel: 'No year' },
  { key: 'songType', label: 'Song Type', hint: 'Mashup, Remix, Lofi, Live, etc.', skipLabel: 'Original' }
];

// Bulk fields for playlist import - applied to all songs at once
const BULK_FIELDS: FieldDef[] = [
  { key: 'album', label: 'Film / Album', hint: 'Same album for all songs (e.g., Aashiqui 2)', skipLabel: 'No album' },
  { key: 'genre1', label: 'Tag 1', hint: 'Primary genre for all songs', skipLabel: 'No Tag 1' },
  { key: 'genre2', label: 'Tag 2', hint: 'Second genre for all songs', skipLabel: 'No Tag 2' },
  { key: 'artist', label: 'Artist 1', hint: 'Main artist for all songs', skipLabel: 'Use channel name' },
];

// Clean title by removing common YouTube suffixes
function cleanTitle(title: string): string {
  return title
    .replace(/\s*\((official\s*)?(lyric|lyrics|audio|audio\s*only|video|official\s*video|music\s*video|full\s*song|song|hd|4k|extended|visualizer|visualiser)\)\s*$/i, '')
    .replace(/\s*-\s*(topic|official|lyrics?)\s*$/i, '')
    .replace(/\s*\[.*?(official|lyrics?|audio|video|hd|4k).*?\]\s*$/i, '')
    .replace(/\s*\{.*?(official|lyrics?|audio|video|hd|4k).*?\}\s*$/i, '')
    .trim();
}

const defaultForKey = (item: YtItem, key: FieldKey): string => {
  switch (key) {
    case 'title':
      return cleanTitle(item.title ?? '');
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
  const [stage, setStage] = useState<'bulk' | 'ask' | 'finish'>(items.length > 1 ? 'bulk' : 'ask');
  const [bulkStage, setBulkStage] = useState<'album' | 'genre1' | 'genre2' | 'artist' | 'done'>('album');
  const [dontAsk, setDontAsk] = useState(false);
  const [lookup, setLookup] = useState<Record<string, 'pending' | 'done' | 'none'>>({});
  const [geminiMeta, setGeminiMeta] = useState<Record<string, GeminiMetadata | null>>({});
  const [geminiLoading, setGeminiLoading] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const geminiApiKey = getGeminiApiKey();

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

  // iTunes/YouTube metadata lookup — disabled in favour of AI (Gemini).
  // Immediately marks all items as 'none' so AI suggestion shows right away.
  useEffect(() => {
    const it = items[songIdx];
    if (!it) return;
    if (lookup[it.id] !== undefined) return;
    setLookup((prev) => ({ ...prev, [it.id]: 'none' }));
  }, [songIdx, items]);

  // AI metadata lookup
  useEffect(() => {
    const it = items[songIdx];
    if (!it || !geminiApiKey) return;
    if (geminiMeta[it.id] !== undefined || geminiLoading[it.id]) return;
    const title = (it.title ?? '')
      .replace(/\s*\((official\s*)?(lyric|lyrics|audio|audio\s*only|video|official\s*video|music\s*video|full\s*song|song|hd|4k|extended)\)\s*$/i, '')
      .replace(/\s*-\s*(topic|official|lyrics?)\s*$/i, '')
      .trim();
    if (!title) return;
    setGeminiLoading((prev) => ({ ...prev, [it.id]: true }));
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    // Hard fallback — ensure loading clears even if abort doesn't propagate
    const fallback = setTimeout(() => {
      if (!cancelled) setGeminiLoading((prev) => ({ ...prev, [it.id]: false }));
    }, 10_000);
    void fetchGeminiMetadata(geminiApiKey, title, it.uploader, undefined, undefined, ctrl.signal)
      .then((meta) => {
        if (cancelled || !meta) return;
        setGeminiMeta((prev) => ({ ...prev, [it.id]: meta }));
      })
      .finally(() => {
        clearTimeout(timer);
        clearTimeout(fallback);
        if (!cancelled) setGeminiLoading((prev) => ({ ...prev, [it.id]: false }));
      });
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(timer);
      clearTimeout(fallback);
    };
  }, [songIdx, items, geminiApiKey]);

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

  const metaState: 'pending' | 'found' | 'none' | 'idle' =
    lookup[item.id] === 'pending' ? 'pending' : lookup[item.id] === 'done' ? 'found' : lookup[item.id] === 'none' ? 'none' : 'idle';
  const metaChip =
    metaState === 'pending' ? (
      <span className="meta-status pending">
        <span className="meta-spinner" /> Scanning metadata…
      </span>
    ) : metaState === 'found' ? (
      <span className="meta-status found">✓ Metadata found &amp; pre-filled</span>
    ) : metaState === 'none' ? (
      <span className="meta-status none">No metadata found — fill in manually</span>
    ) : null;

  const handleValue = (raw: string): void => {
    const stored = showYear ? yearToEraValue(raw) : raw;
    setField(item, field.key, stored);
    if (field.key !== 'title') {
      // picking an option auto-advances; typing stays put
      advance();
    }
  };

  const advance = (): void => {
    if (stage === 'bulk') {
      if (bulkStage === 'album') setBulkStage('genre1');
      else if (bulkStage === 'genre1') setBulkStage('genre2');
      else if (bulkStage === 'genre2') setBulkStage('artist');
      else if (bulkStage === 'artist') {
        setBulkStage('done');
        setStage('ask');
        setFieldIdx(0);
        setSongIdx(0);
      }
      return;
    }
    // Per-song advance
    let nextFieldIdx = fieldIdx + 1;
    if (nextFieldIdx < FIELDS.length) {
      setFieldIdx(nextFieldIdx);
    } else if (songIdx < items.length - 1) {
      setSongIdx(songIdx + 1);
      setFieldIdx(0);
    } else {
      setStage('finish');
    }
  };

  const skipBulk = (): void => {
    // Clear any bulk value for current field and advance
    const key = ['album', 'genre1', 'genre2', 'artist'].find(k => k === bulkStage) as keyof ImportOverrides | undefined;
    if (key) {
      setEdits((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          if (next[id]?.[key]) {
            const { [key]: _, ...rest } = next[id];
            next[id] = rest;
          }
        });
        return next;
      });
    }
    advanceBulk();
  };

  // Bulk stage advance
  const advanceBulk = (): void => {
    if (bulkStage === 'album') setBulkStage('genre1');
    else if (bulkStage === 'genre1') setBulkStage('genre2');
    else if (bulkStage === 'genre2') setBulkStage('artist');
    else if (bulkStage === 'artist') {
      setBulkStage('done');
      setStage('ask');
      setFieldIdx(0);
      setSongIdx(0);
    }
  };

  const skip = (): void => {
    setField(item, field.key, '');
    advance();
  };

  const skipSong = (): void => {
    // Mark current song as completely skipped (no edits)
    setEdits((prev) => {
      const cur = prev[item.id];
      if (cur) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return prev;
    });
    advance();
  };

  const skipAllRemaining = (): void => {
    // Clear edits for all remaining songs including current
    setEdits((prev) => {
      const next = { ...prev };
      items.slice(songIdx).forEach((it) => delete next[it.id]);
      return next;
    });
    setStage('finish');
  };

  const back = (): void => {
    if (stage === 'finish') {
      setStage('ask');
      return;
    }
    if (stage === 'bulk') {
      if (bulkStage === 'album') {
        onCancel();
        return;
      }
      if (bulkStage === 'genre1') setBulkStage('album');
      else if (bulkStage === 'genre2') setBulkStage('genre1');
      else if (bulkStage === 'artist') setBulkStage('genre2');
      return;
    }
    // Per-song back
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
      if (ov.songType?.trim()) {
        const match = SONG_TYPE_OPTIONS.find(o => o.label.toLowerCase() === ov.songType!.trim().toLowerCase());
        clean.songType = match?.value || ov.songType.trim();
      }
      if (ov.mood?.trim()) clean.mood = ov.mood.trim();
      if (ov.language?.trim()) clean.language = ov.language.trim();
      if (ov.artists?.length) clean.artists = ov.artists;
      if (ov.genres?.length) clean.genres = ov.genres;
      if (ov.tags?.length) clean.tags = ov.tags;
      if (Object.keys(clean).length > 0) out[it.id] = clean;
    }
    return out;
  };

  const answeredCount = () => Object.values(edits).filter((e) => e && (e.title?.trim() || e.artist?.trim() || e.artist2?.trim() || e.album?.trim() || e.genre1?.trim() || e.genre2?.trim() || e.year?.trim() || e.songType?.trim())).length;

  const pickArtwork = async (file: File): Promise<void> => {
    const { blobToDataUrl } = await import('../lib/metadata');
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
      case 'songType':
        return SONG_TYPE_OPTIONS.map((o) => o.label);
      default:
        return [];
    }
  };

  const canGoBack = songIdx > 0 || fieldIdx > 0;
  const isLast = fieldIdx === FIELDS.length - 1 && songIdx === items.length - 1;

  return (
    <div className="sheet-overlay" style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingBottom: 20, overflowY: 'auto' }} onClick={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minHeight: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="import-wizard">
          <div className="import-wizard-head">
            <button className="pill-btn" style={{ fontSize: 13, padding: '5px 12px' }} onClick={onCancel}>
              Cancel
            </button>
            <span style={{ fontSize: 16, fontWeight: 600, flex: 1, textAlign: 'center' }}>
              {stage === 'finish' ? 'Finish import' : stage === 'bulk' ? `Apply to all ${items.length} songs` : `Song ${songIdx + 1} of ${items.length}`}
            </span>
            <span style={{ fontSize: 12, color: 'var(--label-secondary)', minWidth: 40, textAlign: 'right' }}>{stepNo}/{totalSteps}</span>
          </div>

          <div style={{ height: 3, background: 'var(--fill-1)', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ height: '100%', background: 'var(--accent)', transition: 'width 180ms ease', width: `${(stepNo / totalSteps) * 100}%` }} />
          </div>

          {stage === 'bulk' ? (
            <div className="import-wizard-body">
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Apply to all {items.length} songs
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                  {BULK_FIELDS.find(f => f.key === bulkStage)?.label ?? ''}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--label-secondary)', marginBottom: 20 }}>
                  {BULK_FIELDS.find(f => f.key === bulkStage)?.hint}
                </p>
              </div>

              <div className={lookup[item.id] === 'pending' ? 'field-loading' : undefined}>
                <TagInput
                  key={bulkStage}
                  value={currentDisplayValue}
                  onChange={handleValue}
                  options={optionsFor(bulkStage as 'album' | 'genre1' | 'genre2' | 'artist')}
                  placeholder={defaultForKey(item, bulkStage as 'album' | 'genre1' | 'genre2' | 'artist') || BULK_FIELDS.find(f => f.key === bulkStage)?.hint}
                />
              </div>

              <button className="pill-btn" onClick={skipBulk} style={{ alignSelf: 'flex-end', fontSize: 13, padding: '5px 12px' }}>
                Skip for all
              </button>
            </div>
          ) : stage === 'ask' ? (
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
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{field.label}?</div>
                <div style={{ fontSize: 12, color: 'var(--label-secondary)', marginBottom: 6 }}>{field.hint}</div>
              </div>

              {metaChip && <div style={{ marginBottom: -4 }}>{metaChip}</div>}

              {geminiLoading[item.id] && (
                <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--label-secondary)' }}>
                  <span className="meta-spinner" /> AI analyzing…
                </div>
              )}

              {!geminiLoading[item.id] && geminiMeta[item.id] && lookup[item.id] !== 'pending' && (
                <GeminiSuggestion
                  meta={geminiMeta[item.id]!}
                  onAccept={() => {
                    const meta = geminiMeta[item.id]!;
                    const { genre1, genre2 } = mapGeminiGenres(meta.genres);
                    const songType = meta.isMashup ? 'mashup' : meta.isRemix ? 'remix' : '';
                    setEdits((prev) => ({
                      ...prev,
                      [item.id]: {
                        ...prev[item.id],
                        artist: meta.artists[0] || prev[item.id]?.artist,
                        artist2: meta.artists[1] || prev[item.id]?.artist2,
                        album: meta.album || prev[item.id]?.album,
                        genre1: genre1 || prev[item.id]?.genre1,
                        genre2: genre2 || prev[item.id]?.genre2,
                        year: meta.year ? String(meta.year) : prev[item.id]?.year,
                        songType: songType || prev[item.id]?.songType,
                        artists: meta.artists,
                        genres: meta.genres,
                        tags: meta.tags,
                        mood: meta.mood ?? undefined,
                        language: meta.language ?? undefined,
                      }
                    }));
                  }}
                />
              )}

              {['album', 'genre1', 'genre2', 'artist'].includes(field.key) && edits[item.id]?.[field.key] && (
                <div style={{ 
                  padding: '6px 10px', 
                  background: 'var(--accent-soft)', 
                  borderRadius: 8, 
                  marginBottom: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--accent)',
                  fontSize: 11,
                  fontWeight: 500
                }}>
                  <SparklesIcon size={12} /> Pre-filled from bulk
                </div>
              )}

              <div>
                {field.key === 'title' ? (
                  <input
                    key={field.key}
                    className="search-input"
                    style={{ paddingLeft: 12, fontSize: 16, padding: '11px 12px 11px 34px' }}
                    placeholder={cleanTitle(item.title ?? '') ?? 'Title'}
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
              </div>

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

          {stage === 'bulk' && (
            <div className="import-wizard-actions">
              <button className="pill-btn" onClick={back} disabled={bulkStage === 'album'} style={{ opacity: bulkStage === 'album' ? 0.4 : 1 }}>
                Back
              </button>
              <button className="pill-btn" onClick={skipBulk}>
                Skip for all
              </button>
              <button className="pill-btn primary" onClick={advanceBulk}>
                {bulkStage === 'artist' ? 'Done' : 'Next'}
              </button>
            </div>
          )}

          {stage === 'ask' && (
            <div className="import-wizard-actions">
              <button className="pill-btn" onClick={back} disabled={!canGoBack} style={{ opacity: canGoBack ? 1 : 0.4 }}>
                Back
              </button>
              {items.length > 1 && (
                <>
                  <button className="pill-btn" onClick={skipSong} style={{ background: 'var(--fill-1)', color: 'var(--label)' }}>
                    Skip this song
                  </button>
                  <button className="pill-btn" onClick={skipAllRemaining} style={{ background: 'var(--fill-1)', color: 'var(--label)' }}>
                    Skip all remaining
                  </button>
                </>
              )}
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

function GeminiSuggestion({ meta, onAccept }: { meta: GeminiMetadata; onAccept: () => void }): JSX.Element {
  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--accent-soft)',
      borderRadius: 10,
      marginBottom: 8,
      border: '1px solid var(--accent)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <SparklesIcon size={14} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>AI found metadata</span>
      </div>

      {meta.artists.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--label-secondary)', marginBottom: 3 }}>Artists</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {meta.artists.map((a, i) => (
              <span key={i} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'var(--surface)', color: 'var(--label)' }}>
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {meta.album && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--label-secondary)', marginBottom: 3 }}>Album</div>
          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'var(--surface)', color: 'var(--label)' }}>
            {meta.album}
          </span>
        </div>
      )}

      {meta.genres.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--label-secondary)', marginBottom: 3 }}>Genres</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {meta.genres.map((g, i) => (
              <span key={i} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'var(--surface)', color: 'var(--label)' }}>
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {meta.year && (
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: 'var(--surface)', color: 'var(--label-secondary)' }}>
            {meta.year}
          </span>
        )}
        {meta.mood && (
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: 'var(--surface)', color: 'var(--label-secondary)' }}>
            {meta.mood}
          </span>
        )}
        {meta.language && (
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: 'var(--surface)', color: 'var(--label-secondary)' }}>
            {meta.language}
          </span>
        )}
        {meta.isMashup && (
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: 'var(--accent)', color: '#fff' }}>
            Mashup
          </span>
        )}
        {meta.isRemix && (
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: 'var(--accent)', color: '#fff' }}>
            Remix
          </span>
        )}
      </div>

      <button className="pill-btn primary" onClick={onAccept} style={{ width: '100%', fontSize: 13, padding: '8px 16px' }}>
        <SparklesIcon size={14} /> Accept & Apply
      </button>
    </div>
  );
}