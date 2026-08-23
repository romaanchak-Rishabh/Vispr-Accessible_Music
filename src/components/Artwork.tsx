import { MusicNoteIcon } from './Icons';

export function Artwork({
  src,
  className,
  placeholderSize = 24,
  alt = '',
  style
}: {
  src?: string;
  className?: string;
  placeholderSize?: number;
  alt?: string;
  style?: React.CSSProperties;
}) {
  if (src) {
    return (
      <img src={src} className={className} alt={alt} draggable={false} loading="lazy" style={style} />
    );
  }
  return (
    <div className={`art-placeholder ${className ?? ''}`} style={style}>
      <MusicNoteIcon size={placeholderSize} />
    </div>
  );
}
