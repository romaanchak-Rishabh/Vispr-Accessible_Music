import { useMemo } from 'react';
import { useLibrary } from '../store/library';
import { Artwork } from './Artwork';

export function PlaylistArtwork({ trackIds, size = 40, style }: { trackIds: string[]; size?: number; style?: React.CSSProperties }): JSX.Element {
  const byId = useLibrary((s) => s.byId);

  const artworks = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of trackIds) {
      const t = byId[id];
      if (t?.artwork && !seen.has(t.artwork)) {
        seen.add(t.artwork);
        result.push(t.artwork);
        if (result.length >= 4) break;
      }
    }
    return result;
  }, [trackIds, byId]);

  if (artworks.length === 0) {
    return <Artwork className="row-artwork" placeholderSize={20} style={style} />;
  }

  if (artworks.length === 1) {
    return <Artwork src={artworks[0]} className="row-artwork" placeholderSize={20} style={style} />;
  }

  // 2x2 collage
  const gap = 2;
  const half = (size - gap) / 2;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap,
        flexShrink: 0,
        background: 'var(--fill-secondary)',
        ...style
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: half,
            height: half,
            overflow: 'hidden',
            background: 'var(--fill-secondary)'
          }}
        >
          {artworks[i] ? (
            <img
              src={artworks[i]}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--label-tertiary)', fontSize: 10 }}>
              ♪
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
