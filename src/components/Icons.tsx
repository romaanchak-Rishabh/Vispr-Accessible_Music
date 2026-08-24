interface IconProps {
  size?: number;
}

const S = ({ size = 24, children, viewBox = '0 0 24 24' }: { size?: number; children: React.ReactNode; viewBox?: string }) => (
  <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg">
    {children}
  </svg>
);

export const ListenIcon = ({ size }: IconProps) => (
  <S size={size}>
    <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12 7a5 5 0 1 0 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <path d="M17.5 2.5 21 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);

export const BrowseIcon = ({ size }: IconProps) => (
  <S size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M7 15V9.5L13 8v6.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="9" cy="15" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="15" cy="14.5" r="1.7" fill="currentColor" stroke="none" />
  </S>
);

export const LibraryIcon = ({ size }: IconProps) => (
  <S size={size}>
    <path d="M4 4v16M9 4v16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="m13.5 5 6.5 1.2-1.2 12.6-5.4-4.4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" transform="rotate(6 16 11)" />
  </S>
);

export const SearchIcon = ({ size }: IconProps) => (
  <S size={size}>
    <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </S>
);

export const PlayIcon = ({ size }: IconProps) => (
  <S size={size} viewBox="0 0 28 28">
    <path d="M8.5 5.6c0-1.2 1.3-1.9 2.3-1.3l12 6.9c1 .6 1 2.1 0 2.7l-12 6.9c-1 .6-2.3-.1-2.3-1.3z" fill="currentColor" />
  </S>
);

export const PauseIcon = ({ size }: IconProps) => (
  <S size={size} viewBox="0 0 28 28">
    <rect x="7" y="4" width="4.6" height="20" rx="1.4" fill="currentColor" />
    <rect x="16.4" y="4" width="4.6" height="20" rx="1.4" fill="currentColor" />
  </S>
);

export const NextIcon = ({ size }: IconProps) => (
  <S size={size} viewBox="0 0 28 28">
    <path d="M5 7.1c0-1 1.1-1.6 2-1.1l9.5 5.9c.8.5.8 1.7 0 2.2L7 20c-.9.5-2-.1-2-1.1z" fill="currentColor" />
    <rect x="19.5" y="6" width="2.8" height="16" rx="1.2" fill="currentColor" />
  </S>
);

export const PrevIcon = ({ size }: IconProps) => (
  <S size={size} viewBox="0 0 28 28">
    <path d="M23 7.1c0-1-1.1-1.6-2-1.1l-9.5 5.9c-.8.5-.8 1.7 0 2.2L21 20c.9.5 2-.1 2-1.1z" fill="currentColor" />
    <rect x="5.7" y="6" width="2.8" height="16" rx="1.2" fill="currentColor" />
  </S>
);

export const ShuffleIcon = ({ size }: IconProps) => (
  <S size={size} viewBox="0 0 28 28">
    <path
      d="M3 8h3.5c2 0 3.2.9 4.4 2.6l4.4 6.8C16.5 19.1 17.7 20 19.7 20H22M3 20h3.5c1.6 0 2.7-.6 3.7-1.9M22 8h-2.3c-1.6 0-2.7.6-3.7 1.9"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path d="m19 4.5 3.5 3.5L19 11.5M19 16.5 22.5 20 19 23.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 -2)" />
  </S>
);

export const RepeatIcon = ({ size }: IconProps) => (
  <S size={size} viewBox="0 0 28 28">
    <path d="M7 7.5h11a4 4 0 0 1 4 4v.5M21 20.5H10a4 4 0 0 1-4-4V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="m9.8 4.7-3 2.8 3 2.8M18.2 17.7l3 2.8-3 2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);

export const RepeatOneIcon = ({ size }: IconProps) => (
  <S size={size} viewBox="0 0 28 28">
    <path d="M7 7.5h11a4 4 0 0 1 4 4v.5M21 20.5H10a4 4 0 0 1-4-4V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="m9.8 4.7-3 2.8 3 2.8M18.2 17.7l3 2.8-3 2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <text x="14" y="16.6" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" stroke="none">
      1
    </text>
  </S>
);

export const Back5Icon = ({ size }: IconProps) => (
  <S size={size} viewBox="0 0 28 28">
    <path d="M12.5 4.5A9.5 9.5 0 1 1 4.6 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M12.8 1.6 9.6 4.7l3.2 3.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    <text x="14" y="18.4" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="currentColor" stroke="none">
      5
    </text>
  </S>
);

export const Forward5Icon = ({ size }: IconProps) => (
  <S size={size} viewBox="0 0 28 28">
    <path d="M15.5 4.5A9.5 9.5 0 1 0 23.4 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="m15.2 1.6 3.2 3.1-3.2 3.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    <text x="14" y="18.4" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="currentColor" stroke="none">
      5
    </text>
  </S>
);

export const EllipsisIcon = ({ size }: IconProps) => (
  <S size={size} viewBox="0 0 24 24">
    <circle cx="5" cy="12" r="1.9" fill="currentColor" />
    <circle cx="12" cy="12" r="1.9" fill="currentColor" />
    <circle cx="19" cy="12" r="1.9" fill="currentColor" />
  </S>
);

export const ChevronLeftIcon = ({ size }: IconProps) => (
  <S size={size}>
    <path d="m14.5 5-6.2 7 6.2 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);

export const ChevronRightIcon = ({ size }: IconProps) => (
  <S size={size}>
    <path d="m9.5 5 6.2 7-6.2 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);

export const QueueIcon = ({ size }: IconProps) => (
  <S size={size}>
    <path d="M4 7h12M4 12h12M4 17h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="18.5" cy="16.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M21 16.5V9l1.8 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </S>
);

export const VolumeHighIcon = ({ size }: IconProps) => (
  <S size={size}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
    <path d="M15 9a4.5 4.5 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </S>
);

export const VolumeLowIcon = ({ size }: IconProps) => (
  <S size={size}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
    <path d="M15 9a4.5 4.5 0 0 1 0 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </S>
);

export const PlusCircleIcon = ({ size }: IconProps) => (
  <S size={size}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </S>
);

export const CheckCircleIcon = ({ size }: IconProps) => (
  <S size={size}>
    <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.25" />
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
    <path d="m8 12.3 2.7 2.7L16 9.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);

export const MusicNoteIcon = ({ size }: IconProps) => (
  <S size={size}>
    <path d="M9 18.5V6.2l10-2.2v12" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <ellipse cx="6.5" cy="18.6" rx="2.6" ry="2.1" fill="currentColor" />
    <ellipse cx="16.5" cy="16.1" rx="2.6" ry="2.1" fill="currentColor" />
  </S>
);

export const FolderIcon = ({ size }: IconProps) => (
  <S size={size}>
    <path d="M3.5 7.5c0-1.1.9-2 2-2h4l2 2.5h7c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </S>
);

export const DownloadIcon = ({ size }: IconProps) => (
  <S size={size}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 7.5v7M8.8 11.4l3.2 3.1 3.2-3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);

export const AirplayIcon = ({ size }: IconProps) => (
  <S size={size}>
    <path d="M5 16.5A2.5 2.5 0 0 1 2.5 14V6A2.5 2.5 0 0 1 5 3.5h14A2.5 2.5 0 0 1 21.5 6v8a2.5 2.5 0 0 1-2.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="m12 14 5 6H7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </S>
);

export const SpinnerIcon = ({ size }: IconProps) => (
  <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

export const SettingsIcon = ({ size }: IconProps) => (
  <S size={size}>
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    <path
      d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2.6-1.5L14.1 2h-4l-.4 2.6a7.6 7.6 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2.6-1.5l2.3 1 2-3.4z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </S>
);
