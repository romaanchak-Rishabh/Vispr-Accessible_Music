import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import { computeWrappedStats, formatMinutes, formatMinutesLong, type WrappedStats } from '../lib/wrapped';
import { Artwork } from './Artwork';
import { ShareIcon, PlayIcon } from './Icons';

/* ── Animated counter hook ─────────────────────────────────────────── */
function useCountUp(target: number, duration = 1200, start = true): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number): void => {
      const k = Math.min(1, (t - t0) / duration);
      const ease = 1 - Math.pow(1 - k, 3);
      setValue(Math.round(target * ease));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

/* ── Card gradient themes ──────────────────────────────────────────── */
const CARD_THEMES = [
  { bg: 'linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #24243e 100%)', accent: '#a78bfa', text: '#ffffff' },
  { bg: 'linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', accent: '#38bdf8', text: '#ffffff' },
  { bg: 'linear-gradient(160deg, #2d1b69 0%, #11998e 100%)', accent: '#34d399', text: '#ffffff' },
  { bg: 'linear-gradient(160deg, #fc466b 0%, #3f5efb 100%)', accent: '#fbbf24', text: '#ffffff' },
  { bg: 'linear-gradient(160deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)', accent: '#fb7185', text: '#ffffff' },
  { bg: 'linear-gradient(160deg, #1e3c72 0%, #2a5298 100%)', accent: '#a3e635', text: '#ffffff' },
  { bg: 'linear-gradient(160deg, #41295a 0%, #2f0743 100%)', accent: '#f472b6', text: '#ffffff' },
  { bg: 'linear-gradient(160deg, #000428 0%, #004e92 100%)', accent: '#22d3ee', text: '#ffffff' },
  { bg: 'linear-gradient(160deg, #141e30 0%, #243b55 100%)', accent: '#facc15', text: '#ffffff' },
  { bg: 'linear-gradient(160deg, #232526 0%, #414345 100%)', accent: '#fb923c', text: '#ffffff' },
  { bg: 'linear-gradient(160deg, #1f1c2c 0%, #928dab 100%)', accent: '#818cf8', text: '#ffffff' },
  { bg: 'linear-gradient(160deg, #0c0c1d 0%, #1e0a3c 40%, #3d1d6e 100%)', accent: '#e879f9', text: '#ffffff' },
];

/* ── Progress bar ──────────────────────────────────────────────────── */
function StoryProgress({ total, current }: { total: number; current: number }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '10px 14px 0' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            background: i < current ? '#ffffff' : 'rgba(255,255,255,0.25)',
            transition: 'background 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

/* ── Big animated number ───────────────────────────────────────────── */
function BigNumber({ value, suffix, label, accent }: { value: number; suffix?: string; label: string; accent: string }): JSX.Element {
  const animated = useCountUp(value, 1400);
  return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{
        fontSize: 'clamp(48px, 12vw, 80px)',
        fontWeight: 800,
        color: accent,
        letterSpacing: '-2px',
        lineHeight: 1,
        textShadow: `0 0 40px ${accent}44`,
      }}>
        {animated.toLocaleString()}{suffix}
      </div>
      <div style={{
        fontSize: 'clamp(14px, 3.5vw, 18px)',
        color: 'rgba(255,255,255,0.7)',
        marginTop: 10,
        fontWeight: 500,
        letterSpacing: '0.5px',
      }}>
        {label}
      </div>
    </div>
  );
}

/* ── Top list card ─────────────────────────────────────────────────── */
function TopListCard<T>({ items, title, subtitle, accent, renderItem, theme }: {
  items: T[];
  title: string;
  subtitle?: string;
  accent: string;
  renderItem: (item: T, index: number) => JSX.Element;
  theme: typeof CARD_THEMES[0];
}): JSX.Element {
  return (
    <div style={{ padding: '0 24px', width: '100%' }}>
      <div style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 700, color: theme.text, marginBottom: 4 }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
          {subtitle}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 14px',
              borderRadius: 14,
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.08)',
              animation: `wrappedSlideUp 0.5s ease ${i * 0.08}s both`,
            }}
          >
            <span style={{
              fontSize: 22,
              fontWeight: 800,
              color: accent,
              width: 32,
              textAlign: 'center',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {i + 1}
            </span>
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Genre bar ─────────────────────────────────────────────────────── */
function GenreBars({ genres, accent }: { genres: { genre: string; plays: number }[]; accent: string }): JSX.Element {
  const max = genres[0]?.plays ?? 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {genres.slice(0, 6).map((g, i) => (
        <div key={g.genre}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{g.genre}</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{g.plays} plays</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(g.plays / max) * 100}%`,
              borderRadius: 4,
              background: `linear-gradient(90deg, ${accent}, ${accent}88)`,
              animation: `wrappedBarGrow 0.8s ease ${i * 0.1}s both`,
              transformOrigin: 'left',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Share card generator ──────────────────────────────────────────── */
function generateShareCard(stats: WrappedStats): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, 1920);
  grad.addColorStop(0, '#0f0c29');
  grad.addColorStop(0.5, '#302b63');
  grad.addColorStop(1, '#24243e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1920);

  // Decorative circles
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#a78bfa';
  ctx.beginPath();
  ctx.arc(800, 200, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(200, 1700, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Header
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '600 36px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MY MUSIC YEAR', 540, 140);

  // Year
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 120px -apple-system, sans-serif';
  ctx.fillText(new Date().getFullYear().toString(), 540, 280);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(140, 340);
  ctx.lineTo(940, 340);
  ctx.stroke();

  // Total minutes
  ctx.fillStyle = '#a78bfa';
  ctx.font = '800 90px -apple-system, sans-serif';
  ctx.fillText(formatMinutes(stats.totalMinutes), 540, 480);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '500 32px -apple-system, sans-serif';
  ctx.fillText('total minutes listened', 540, 530);

  // Top artist
  if (stats.favouriteArtist) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '600 28px -apple-system, sans-serif';
    ctx.fillText('TOP ARTIST', 540, 660);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 56px -apple-system, sans-serif';
    ctx.fillText(stats.favouriteArtist, 540, 730);
  }

  // Top song
  if (stats.favouriteSong) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '600 28px -apple-system, sans-serif';
    ctx.fillText('TOP SONG', 540, 860);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 42px -apple-system, sans-serif';
    ctx.fillText(stats.favouriteSong.title, 540, 920);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '400 30px -apple-system, sans-serif';
    ctx.fillText(stats.favouriteSong.artist, 540, 965);
  }

  // Personality
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '600 28px -apple-system, sans-serif';
  ctx.fillText('YOUR LISTENER CLUB', 540, 1100);
  ctx.fillStyle = stats.personality.color;
  ctx.font = '800 52px -apple-system, sans-serif';
  ctx.fillText(`${stats.personality.emoji} ${stats.personality.name}`, 540, 1170);

  // Top genres
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '600 28px -apple-system, sans-serif';
  ctx.fillText('TOP GENRES', 540, 1320);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 36px -apple-system, sans-serif';
  const genreStr = stats.topGenres.slice(0, 3).map((g) => g.genre).join(' · ');
  ctx.fillText(genreStr, 540, 1375);

  // Stats row
  const statsRow = [
    { label: 'Plays', value: stats.totalPlays.toLocaleString() },
    { label: 'Songs', value: stats.uniqueTracksPlayed.toLocaleString() },
    { label: 'Artists', value: stats.uniqueArtistsPlayed.toLocaleString() },
  ];
  statsRow.forEach((s, i) => {
    const x = 240 + i * 300;
    ctx.fillStyle = '#a78bfa';
    ctx.font = '800 48px -apple-system, sans-serif';
    ctx.fillText(s.value, x, 1580);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '500 26px -apple-system, sans-serif';
    ctx.fillText(s.label, x, 1625);
  });

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '500 26px -apple-system, sans-serif';
  ctx.fillText('made with Vispr', 540, 1820);

  return canvas.toDataURL('image/png');
}

/* ── Main WrappedView ──────────────────────────────────────────────── */
export function WrappedView(): JSX.Element {
  const tracks = useLibrary((s) => s.tracks);
  const playCounts = usePlayer((s) => s.playCounts);
  const listenTime = usePlayer((s) => s.listenTime);
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed);
  const firstPlayedAt = usePlayer((s) => s.firstPlayedAt);
  const goBack = useUI((s) => s.goBack);
  const playTracks = usePlayer((s) => s.playTracks);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const playlists = useLibrary((s) => s.playlists);
  const [step, setStep] = useState(0);
  const [sharing, setSharing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(
    () => computeWrappedStats(tracks, playCounts, listenTime, recentlyPlayed, firstPlayedAt),
    [tracks, playCounts, listenTime, recentlyPlayed, firstPlayedAt]
  );

  const totalSteps = 12;

  const next = useCallback(() => {
    setStep((s) => {
      if (s >= totalSteps - 1) return s;
      return s + 1;
    });
  }, []);

  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      if (e.key === 'Escape') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, goBack]);

  // Auto-advance timer
  useEffect(() => {
    const timer = setTimeout(() => {
      if (step < totalSteps - 1) next();
    }, 6000);
    return () => clearTimeout(timer);
  }, [step, next]);

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      const dataUrl = generateShareCard(stats);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `my-music-year-${new Date().getFullYear()}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Music Year' });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `my-music-year-${new Date().getFullYear()}.png`;
        a.click();
      }
    } catch { /* user cancelled */ }
    setSharing(false);
  }, [stats]);

  const topTrackIds = useMemo(() => {
    return stats.topSongs.map((s) => s.track.id).slice(0, 25);
  }, [stats]);

  const topTracks = useMemo(() => {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return topTrackIds.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  }, [topTrackIds, tracks]);

  const handlePlayTop = useCallback(() => {
    if (topTracks.length === 0) return;
    const name = `Wrapped ${new Date().getFullYear()}`;
    let playlist = playlists.find((p) => p.name === name);
    if (!playlist) {
      const id = createPlaylist(name);
      addToPlaylist(id, topTracks.map((t) => t.id));
    } else {
      addToPlaylist(playlist.id, topTracks.map((t) => t.id));
    }
    playTracks(topTracks, 0, name);
  }, [topTracks, playlists, createPlaylist, addToPlaylist, playTracks]);

  const theme = CARD_THEMES[step % CARD_THEMES.length];

  const renderCard = ():
    JSX.Element => {
    switch (step) {
      case 0: // Welcome
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
            <div style={{
              fontSize: 'clamp(40px, 10vw, 56px)',
              animation: 'wrappedWiggle 2s ease-in-out infinite',
              filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.15))',
            }}>
              🎧
            </div>
            <div style={{
              fontSize: 'clamp(13px, 3vw, 16px)',
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '4px',
              fontWeight: 600,
              animation: 'wrappedFadeIn 0.8s ease both',
            }}>
              YOUR MUSIC YEAR
            </div>
            <div style={{
              fontSize: 'clamp(64px, 16vw, 100px)',
              fontWeight: 900,
              color: theme.accent,
              letterSpacing: '-3px',
              textShadow: `0 0 60px ${theme.accent}44`,
              animation: 'wrappedScaleIn 0.7s ease 0.2s both',
            }}>
              {new Date().getFullYear()}
            </div>
            <div style={{
              fontSize: 'clamp(16px, 4vw, 20px)',
              color: 'rgba(255,255,255,0.6)',
              textAlign: 'center',
              maxWidth: 300,
              lineHeight: 1.5,
              animation: 'wrappedFadeIn 0.8s ease 0.4s both',
            }}>
              A look back at every beat, every artist, and every moment. 🎶
            </div>
            <div style={{
              marginTop: 24,
              fontSize: 14,
              color: 'rgba(255,255,255,0.35)',
              animation: 'wrappedFadeIn 0.8s ease 0.8s both, wrappedBounce 1.5s ease 1.5s infinite',
            }}>
              tap to explore →
            </div>
          </div>
        );

      case 1: // Total minutes
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{
              fontSize: 'clamp(30px, 7vw, 40px)',
              animation: 'wrappedBounce 2s ease-in-out infinite',
              marginBottom: 4,
            }}>
              ⏱️
            </div>
            <div style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', color: 'rgba(255,255,255,0.5)', marginBottom: 4, animation: 'wrappedFadeIn 0.6s ease both' }}>
              You spent
            </div>
            <BigNumber value={stats.totalMinutes} suffix=" min" label="listening to music" accent={theme.accent} />
            <div style={{ fontSize: 'clamp(14px, 3vw, 17px)', color: 'rgba(255,255,255,0.45)', animation: 'wrappedFadeIn 0.8s ease 0.3s both' }}>
              That's {formatMinutesLong(stats.totalMinutes)} of pure vibes ✨
            </div>
          </div>
        );

      case 2: // Top artist
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: '0 24px' }}>
            <div style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', color: 'rgba(255,255,255,0.5)', animation: 'wrappedFadeIn 0.6s ease both' }}>
              🏆 Your #1 artist
            </div>
            {stats.topArtists[0] && (
              <>
                <div style={{ animation: 'wrappedScaleIn 0.7s ease 0.2s both', position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    inset: -8,
                    borderRadius: '50%',
                    background: `conic-gradient(${theme.accent}, transparent, ${theme.accent})`,
                    opacity: 0.4,
                    animation: 'wrappedPulse 2s ease-in-out infinite',
                  }} />
                  <Artwork src={stats.topArtists[0].artwork} style={{ width: 160, height: 160, borderRadius: '50%', position: 'relative', zIndex: 1 }} placeholderSize={60} alt="" />
                </div>
                <div style={{
                  fontSize: 'clamp(28px, 7vw, 42px)',
                  fontWeight: 800,
                  color: '#fff',
                  textAlign: 'center',
                  animation: 'wrappedSlideUp 0.6s ease 0.4s both',
                }}>
                  {stats.topArtists[0].name}
                </div>
                <div style={{ fontSize: 'clamp(15px, 3.5vw, 18px)', color: theme.accent, fontWeight: 600, animation: 'wrappedFadeIn 0.6s ease 0.6s both' }}>
                  {formatMinutes(Math.round(stats.topArtists[0].minutes))} · {stats.topArtists[0].plays} plays 🎵
                </div>
              </>
            )}
          </div>
        );

      case 3: // Top 5 artists
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '40px 0 20px', justifyContent: 'center' }}>
            <TopListCard
              items={stats.topArtists.slice(0, 5)}
              title="Top Artists"
              subtitle="Ranked by minutes listened"
              accent={theme.accent}
              theme={theme}
              renderItem={(a) => (
                <>
                  <Artwork src={a.artwork} className="row-artwork row-art-circle" style={{ width: 44, height: 44 }} placeholderSize={16} alt="" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                      {formatMinutes(Math.round(a.minutes))}
                    </div>
                  </div>
                </>
              )}
            />
          </div>
        );

      case 4: // Top song
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, padding: '0 24px' }}>
            <div style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', color: 'rgba(255,255,255,0.5)', animation: 'wrappedFadeIn 0.6s ease both' }}>
              🔥 Your most played song
            </div>
            {stats.favouriteSong && (
              <>
                <div style={{ animation: 'wrappedScaleIn 0.7s ease 0.2s both', position: 'relative' }}>
                  <Artwork src={stats.favouriteSong.artwork} style={{ width: 150, height: 150, borderRadius: 16, boxShadow: `0 12px 40px ${theme.accent}33` }} placeholderSize={50} alt="" />
                </div>
                <div style={{
                  fontSize: 'clamp(22px, 5.5vw, 32px)',
                  fontWeight: 800,
                  color: '#fff',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  animation: 'wrappedSlideUp 0.6s ease 0.4s both',
                }}>
                  {stats.favouriteSong.title}
                </div>
                <div style={{ fontSize: 'clamp(15px, 3.5vw, 18px)', color: 'rgba(255,255,255,0.6)', animation: 'wrappedFadeIn 0.6s ease 0.6s both' }}>
                  {stats.favouriteSong.artist}
                </div>
                <div style={{
                  fontSize: 'clamp(15px, 3.5vw, 18px)',
                  color: theme.accent,
                  fontWeight: 700,
                  animation: 'wrappedFadeIn 0.6s ease 0.8s both, wrappedBounce 1.8s ease 1.2s infinite',
                }}>
                  {stats.topSongs[0]?.plays ?? 0} plays 🎧
                </div>
              </>
            )}
          </div>
        );

      case 5: // Top 5 songs
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '40px 0 20px', justifyContent: 'center' }}>
            <TopListCard
              items={stats.topSongs.slice(0, 5)}
              title="Top Songs"
              subtitle="Your most played tracks"
              accent={theme.accent}
              theme={theme}
              renderItem={(s) => (
                <>
                  <Artwork src={s.track.artwork} className="row-artwork" style={{ width: 44, height: 44, borderRadius: 8 }} placeholderSize={16} alt="" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.track.title}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.track.artist}
                    </div>
                  </div>
                  <div style={{ color: theme.accent, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {s.plays}×
                  </div>
                </>
              )}
            />
          </div>
        );

      case 6: // Top genres
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '50px 24px 30px', justifyContent: 'center' }}>
            <div style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              Your Sound
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>
              Genres that shaped your year
            </div>
            <GenreBars genres={stats.topGenres} accent={theme.accent} />
          </div>
        );

      case 7: // Listening age
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
            <div style={{
              fontSize: 'clamp(30px, 7vw, 40px)',
              animation: 'wrappedBounce 2s ease-in-out infinite',
            }}>
              🎂
            </div>
            <div style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', color: 'rgba(255,255,255,0.5)', animation: 'wrappedFadeIn 0.6s ease both' }}>
              Based on your taste, your listening age is
            </div>
            <div style={{
              fontSize: 'clamp(80px, 20vw, 130px)',
              fontWeight: 900,
              color: theme.accent,
              textShadow: `0 0 80px ${theme.accent}55`,
              animation: 'wrappedScaleIn 0.8s ease 0.2s both, wrappedPulse 2.5s ease 1s infinite',
              lineHeight: 1,
            }}>
              {stats.listeningAge}
            </div>
            <div style={{ fontSize: 'clamp(14px, 3vw, 17px)', color: 'rgba(255,255,255,0.45)', textAlign: 'center', maxWidth: 280, animation: 'wrappedFadeIn 0.6s ease 0.5s both' }}>
              {stats.listeningAge < 20 ? 'Born in the future 🚀' :
                stats.listeningAge < 28 ? 'Young at heart ✨' :
                  stats.listeningAge < 40 ? 'Perfectly timeless 🎵' :
                    stats.listeningAge < 55 ? 'Classic soul 🎻' : 'Timeless wisdom 📜'}
            </div>
          </div>
        );

      case 8: // Personality club
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, padding: '0 24px' }}>
            <div style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', color: 'rgba(255,255,255,0.5)', animation: 'wrappedFadeIn 0.6s ease both' }}>
              You belong to the
            </div>
            <div style={{
              fontSize: 'clamp(48px, 12vw, 72px)',
              animation: 'wrappedScaleIn 0.7s ease 0.2s both, wrappedWiggle 2.5s ease 0.9s infinite',
              filter: `drop-shadow(0 0 30px ${stats.personality.color}66)`,
            }}>
              {stats.personality.emoji}
            </div>
            <div style={{
              fontSize: 'clamp(28px, 7vw, 40px)',
              fontWeight: 800,
              color: stats.personality.color,
              textAlign: 'center',
              animation: 'wrappedSlideUp 0.6s ease 0.4s both',
              textShadow: `0 0 30px ${stats.personality.color}44`,
            }}>
              {stats.personality.name}
            </div>
            <div style={{
              fontSize: 'clamp(14px, 3vw, 17px)',
              color: 'rgba(255,255,255,0.55)',
              textAlign: 'center',
              maxWidth: 300,
              lineHeight: 1.5,
              animation: 'wrappedFadeIn 0.6s ease 0.6s both',
            }}>
              {stats.personality.description}
            </div>
          </div>
        );

      case 9: // Era distribution
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '50px 24px 30px', justifyContent: 'center' }}>
            <div style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              Your Eras
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>
              Decades of sound in your ears
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stats.eraDistribution.map((e, i) => {
                const max = stats.eraDistribution[0]?.plays ?? 1;
                return (
                  <div key={e.era}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{e.era}</span>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{e.plays} plays</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(e.plays / max) * 100}%`,
                        borderRadius: 4,
                        background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent}66)`,
                        animation: `wrappedBarGrow 0.8s ease ${i * 0.1}s both`,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 10: // Top albums
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '40px 0 20px', justifyContent: 'center' }}>
            <TopListCard
              items={stats.topAlbums.slice(0, 5)}
              title="Top Albums"
              subtitle="Most played albums"
              accent={theme.accent}
              theme={theme}
              renderItem={(a) => (
                <>
                  <Artwork src={a.artwork} className="row-artwork" style={{ width: 44, height: 44, borderRadius: 8 }} placeholderSize={16} alt="" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.artist}
                    </div>
                  </div>
                  <div style={{ color: theme.accent, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {formatMinutes(Math.round(a.minutes))}
                  </div>
                </>
              )}
            />
          </div>
        );

      case 11: // Summary + share
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: '0 24px' }}>
            <div style={{
              fontSize: 'clamp(30px, 7vw, 40px)',
              animation: 'wrappedBounce 2s ease-in-out infinite',
            }}>
              🎉
            </div>
            <div style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 700, color: '#fff', textAlign: 'center', animation: 'wrappedFadeIn 0.6s ease both' }}>
              That's your year in music!
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, width: '100%', maxWidth: 340 }}>
              {[
                { value: formatMinutes(stats.totalMinutes), label: 'Minutes', emoji: '⏱️' },
                { value: stats.totalPlays.toLocaleString(), label: 'Plays', emoji: '▶️' },
                { value: stats.uniqueTracksPlayed.toLocaleString(), label: 'Songs', emoji: '🎵' },
              ].map((s, i) => (
                <div key={i} style={{
                  textAlign: 'center',
                  padding: '14px 8px',
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  animation: `wrappedSlideUp 0.5s ease ${i * 0.1}s both`,
                }}>
                  <div style={{ fontSize: 20 }}>{s.emoji}</div>
                  <div style={{ fontSize: 'clamp(16px, 4vw, 22px)', fontWeight: 800, color: theme.accent, marginTop: 4 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
            {topTracks.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); handlePlayTop(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 28px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.12)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.15)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  backdropFilter: 'blur(10px)',
                  animation: 'wrappedFadeIn 0.6s ease 0.3s both',
                }}
              >
                <PlayIcon size={16} />
                Play Top Songs
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); void handleShare(); }}
              disabled={sharing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 28px',
                borderRadius: 999,
                background: theme.accent,
                color: '#000',
                border: 'none',
                fontSize: 16,
                fontWeight: 700,
                cursor: sharing ? 'wait' : 'pointer',
                boxShadow: `0 8px 30px ${theme.accent}44`,
                animation: 'wrappedFadeIn 0.6s ease 0.4s both',
              }}
            >
              <ShareIcon size={18} />
              {sharing ? 'Creating…' : 'Share Your Year'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); goBack(); }}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                fontSize: 14,
                cursor: 'pointer',
                animation: 'wrappedFadeIn 0.6s ease 0.6s both',
              }}
            >
              Done ✌️
            </button>
          </div>
        );

      default:
        return <div />;
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={next}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: theme.bg,
        cursor: 'pointer',
        userSelect: 'none',
        overflow: 'hidden',
        transition: 'background 0.6s ease',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Decorative background orbs */}
      <div style={{
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: theme.accent,
        opacity: 0.06,
        filter: 'blur(80px)',
        top: '-10%',
        right: '-10%',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: '50%',
        background: theme.accent,
        opacity: 0.04,
        filter: 'blur(60px)',
        bottom: '10%',
        left: '-10%',
        pointerEvents: 'none',
      }} />
      {/* Floating confetti particles */}
      {step > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {Array.from({ length: 14 }).map((_, i) => {
            const colors = [theme.accent, '#fbbf24', '#34d399', '#f472b6', '#60a5fa'];
            const c = colors[i % colors.length];
            const size = 4 + (i % 4) * 2;
            const left = (i * 7.3 + 3) % 90;
            const delay = (i % 7) * 0.6;
            const dur = 4 + (i % 5) * 0.8;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: size,
                  height: size * (i % 2 === 0 ? 1 : 1.6),
                  borderRadius: i % 3 === 0 ? '50%' : 2,
                  background: c,
                  opacity: 0.35,
                  left: `${left}%`,
                  top: '-5%',
                  animation: `confettiFall ${dur}s linear ${delay}s infinite`,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Progress bars */}
      <div style={{ paddingTop: 6 }}>
        <StoryProgress total={totalSteps} current={step + 1} />
      </div>

      {/* Close button — below the status bar / notch */}
      <button
        onClick={(e) => { e.stopPropagation(); goBack(); }}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top) + 48px)',
          right: 16,
          zIndex: 10,
          background: 'rgba(255,255,255,0.12)',
          border: 'none',
          color: '#fff',
          fontSize: 22,
          width: 38,
          height: 38,
          borderRadius: '50%',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(10px)',
          lineHeight: 1,
        }}
      >
        ×
      </button>

      {/* Navigation zones */}
      <div
        onClick={(e) => { e.stopPropagation(); prev(); }}
        style={{ position: 'absolute', left: 0, top: 80, bottom: 50, width: '30%', cursor: 'pointer', zIndex: 5 }}
      />

      {/* Card content */}
      <div style={{ position: 'relative', zIndex: 4, height: 'calc(100% - 80px)', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 'env(safe-area-inset-top)' }}>
        <div key={step} style={{ width: '100%', animation: 'wrappedCardIn 0.45s ease both' }}>
          {renderCard()}
        </div>
      </div>

      {/* Step indicator */}
      <div style={{
        position: 'absolute',
        bottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
        zIndex: 5,
      }}>
        {step + 1} / {totalSteps}
      </div>
    </div>
  );
}
