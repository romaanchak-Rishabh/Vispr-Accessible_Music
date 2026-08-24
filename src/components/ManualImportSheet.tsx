import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { fetchExternalMetadata } from '../lib/metadataApi';
import { blobToDataUrl } from '../lib/metadata';
import { Artwork } from './Artwork';
import { SpinnerIcon } from './Icons';

interface Props {
  url: string;
  onClose: () => void;
}

export function ManualImportSheet({ url, onClose }: Props): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [thumb, setThumb] = useState<string | undefined>(undefined);
  const [customArt, setCustomArt] = useState<string | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useUI((s) => s.showToast);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { youtubeApiKey } = useSettings.getState();
      const meta = await fetchExternalMetadata(url, youtubeApiKey);
      if (cancelled) return;
      if (!meta?.title && !meta?.artist) {
        setError('Could not fetch metadata for that link — you can still fill it in manually.');
      }
      setTitle(meta?.title ?? '');
      setArtist(meta?.artist ?? '');
      setThumb(meta?.thumbnail);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const pickArtwork = async (f: File): Promise<void> => {
    const dataUrl = await blobToDataUrl(f, 640);
    if (dataUrl) setCustomArt(dataUrl);
  };

  const resolveArtwork = async (): Promise<string | undefined> => {
    if (customArt) return customArt;
    if (!thumb) return undefined;
    try {
      const resp = await fetch(thumb, { mode: 'cors' });
      if (resp.ok) return (await blobToDataUrl(await resp.blob())) ?? thumb;
    } catch {
      /* fall through to remote URL */
    }
    return thumb;
  };

  const save = async (): Promise<void> => {
    if (!file || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const artwork = await resolveArtwork();
      await useLibrary.getState().addFileWithMeta(file, {
        title,
        artist: artist.trim() || 'Unknown Artist',
        album: 'YouTube',
        artwork
      });
      showToast(`Imported “${title.trim()}”`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-overlay" style={{ alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="action-sheet" style={{ width: 'min(460px, 100%)' }}>
          <div className="action-sheet-head">
            <span style={{ fontSize: 17, fontWeight: 600 }}>Manual Import</span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 24px', color: 'var(--label-secondary)' }}>
              <SpinnerIcon size={18} /> Fetching song info…
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 14px 14px' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
                  aria-label="Change cover art"
                >
                  <Artwork src={customArt ?? thumb} className="row-artwork" placeholderSize={22} alt="" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void pickArtwork(f);
                    e.target.value = '';
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
                  <input
                    className="search-input"
                    style={{ paddingLeft: 10, fontSize: 14 }}
                    placeholder="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <input
                    className="search-input"
                    style={{ paddingLeft: 10, fontSize: 14 }}
                    placeholder="Artist"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                  />
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--label-secondary)', margin: 0 }}>
                Download the audio yourself (yt2mp3 site, screen recorder…), then attach the file here — info above is applied automatically.
              </p>

              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.mp4,.aac,.flac,.wav,.ogg,.opus,.webm"
                style={{ display: 'none' }}
                id="manual-import-audio"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
              <button className="pill-btn" onClick={() => document.getElementById('manual-import-audio')?.click()}>
                {file ? `📎 ${file.name} (${Math.round(file.size / 1024)} KB)` : 'Choose Song File…'}
              </button>

              {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--accent)' }}>{error}</p>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="pill-btn primary"
                  style={{ flex: 1 }}
                  disabled={!file || !title.trim() || saving}
                  onClick={() => void save()}
                >
                  {saving ? <SpinnerIcon size={16} /> : 'Import'}
                </button>
                <button className="pill-btn" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
