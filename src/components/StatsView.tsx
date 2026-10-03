import { useMemo } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import { computeWrappedStats, formatMinutes } from '../lib/wrapped';
import { Artwork } from './Artwork';

function StatCard({ value, label, accent }: { value: string | number; label: string; accent?: string }): JSX.Element {
  return (
    <div style={{
      padding: '18px 16px',
      borderRadius: 16,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--separator)',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 'clamp(22px, 5vw, 28px)',
        fontWeight: 800,
        color: accent ?? 'var(--accent)',
        letterSpacing: '-0.5px',
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 12,
        color: 'var(--label-secondary)',
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: 600,
      }}>
        {label}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h2 style={{
      fontSize: 20,
      fontWeight: 700,
      color: 'var(--label)',
      margin: '28px 0 14px',
      letterSpacing: '-0.3px',
    }}>
      {children}
    </h2>
  );
}

function HorizontalBar({ label, value, max, display, color }: {
  label: string; value: number; max: number; display?: string; color?: string;
}): JSX.Element {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: 'var(--label)', fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{label}</span>
        <span style={{ color: 'var(--label-secondary)', fontSize: 13 }}>{display ?? value}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${max > 0 ? (value / max) * 100 : 0}%`,
          borderRadius: 4,
          background: color ?? 'var(--accent)',
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

export function StatsView(): JSX.Element {
  const tracks = useLibrary((s) => s.tracks);
  const playCounts = usePlayer((s) => s.playCounts);
  const listenTime = usePlayer((s) => s.listenTime);
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed);
  const firstPlayedAt = usePlayer((s) => s.firstPlayedAt);
  const goBack = useUI((s) => s.goBack);
  const navigate = useUI((s) => s.navigate);

  const stats = useMemo(
    () => computeWrappedStats(tracks, playCounts, listenTime, recentlyPlayed, firstPlayedAt),
    [tracks, playCounts, listenTime, recentlyPlayed, firstPlayedAt]
  );

  const maxGenre = stats.topGenres[0]?.plays ?? 1;
  const maxEra = Math.max(...stats.eraDistribution.map((e) => e.plays), 1);

  // Full top songs list
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const fullTopSongs = useMemo(() => {
    return Object.entries(playCounts)
      .filter(([, c]) => c > 0)
      .map(([id, plays]) => {
        const t = byId.get(id);
        if (!t) return null;
        const secs = listenTime[id] ?? 0;
        const minutes = secs > 0 ? secs / 60 : ((t.duration ?? 0) * plays) / 60;
        return { track: t, plays, minutes };
      })
      .filter(Boolean)
      .sort((a, b) => b!.plays - a!.plays)
      .slice(0, 25) as { track: NonNullable<ReturnType<typeof byId.get>>; plays: number; minutes: number }[];
  }, [playCounts, listenTime]);

  return (
    <div className="fade-page" style={{ paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 4px' }}>
        <button
          onClick={goBack}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, cursor: 'pointer', fontWeight: 600 }}
        >
          ‹ Back
        </button>
        <button
          onClick={() => navigate({ type: 'wrapped' })}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 999,
            background: 'var(--accent-gradient)', color: '#fff',
            border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          ✨ Wrapped
        </button>
      </div>

      <h1 className="large-title" style={{ marginBottom: 4 }}>Listening Stats</h1>
      <p style={{ color: 'var(--label-secondary)', fontSize: 14, marginBottom: 20 }}>
        Your all-time listening analytics
      </p>

      {/* Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <StatCard value={formatMinutes(stats.totalMinutes)} label="Total Time" />
        <StatCard value={stats.totalPlays.toLocaleString()} label="Total Plays" />
        <StatCard value={stats.uniqueTracksPlayed.toLocaleString()} label="Songs Played" />
        <StatCard value={stats.uniqueArtistsPlayed.toLocaleString()} label="Artists Heard" />
      </div>

      {/* Personality */}
      <SectionTitle>Your Listener Club</SectionTitle>
      <div style={{
        padding: '20px',
        borderRadius: 16,
        background: `linear-gradient(135deg, ${stats.personality.color}22, transparent)`,
        border: `1px solid ${stats.personality.color}44`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{ fontSize: 42 }}>{stats.personality.emoji}</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: stats.personality.color }}>{stats.personality.name}</div>
          <div style={{ fontSize: 13, color: 'var(--label-secondary)', marginTop: 2 }}>{stats.personality.description}</div>
        </div>
      </div>

      {/* Top Artists */}
      <SectionTitle>Top Artists</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {stats.topArtists.slice(0, 10).map((a, i) => (
          <div key={a.name} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 12, background: 'var(--bg-elevated)',
            border: '1px solid var(--separator)',
          }}>
            <span style={{ width: 24, textAlign: 'center', fontWeight: 800, color: 'var(--accent)', fontSize: 15 }}>{i + 1}</span>
            <Artwork src={a.artwork} className="row-artwork row-art-circle" style={{ width: 40, height: 40 }} placeholderSize={14} alt="" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
              <div style={{ fontSize: 12, color: 'var(--label-secondary)' }}>{formatMinutes(Math.round(a.minutes))} · {a.plays} plays</div>
            </div>
          </div>
        ))}
      </div>

      {/* Top Songs */}
      <SectionTitle>Most Played Songs</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {fullTopSongs.map((s, i) => (
          <div key={s.track.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 10px', borderRadius: 10, background: 'var(--bg-elevated)',
            border: '1px solid var(--separator)',
          }}>
            <span style={{ width: 22, textAlign: 'center', fontWeight: 700, color: 'var(--label-tertiary)', fontSize: 13 }}>{i + 1}</span>
            <Artwork src={s.track.artwork} className="row-artwork" style={{ width: 36, height: 36, borderRadius: 6 }} placeholderSize={12} alt="" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.track.title}</div>
              <div style={{ fontSize: 11, color: 'var(--label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.track.artist}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>{s.plays}×</div>
              <div style={{ fontSize: 11, color: 'var(--label-secondary)' }}>{formatMinutes(Math.round(s.minutes))}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Top Albums */}
      <SectionTitle>Top Albums</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stats.topAlbums.map((a, i) => (
          <div key={a.name} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 12, background: 'var(--bg-elevated)',
            border: '1px solid var(--separator)',
          }}>
            <span style={{ width: 22, textAlign: 'center', fontWeight: 700, color: 'var(--label-tertiary)', fontSize: 13 }}>{i + 1}</span>
            <Artwork src={a.artwork} className="row-artwork" style={{ width: 40, height: 40, borderRadius: 6 }} placeholderSize={14} alt="" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
              <div style={{ fontSize: 12, color: 'var(--label-secondary)' }}>{a.artist}</div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>{formatMinutes(Math.round(a.minutes))}</div>
          </div>
        ))}
      </div>

      {/* Genre Breakdown */}
      <SectionTitle>Genre Breakdown</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', borderRadius: 16, background: 'var(--bg-elevated)', border: '1px solid var(--separator)' }}>
        {stats.topGenres.slice(0, 8).map((g) => (
          <HorizontalBar key={g.genre} label={g.genre} value={g.plays} max={maxGenre} display={`${g.plays} plays`} />
        ))}
      </div>

      {/* Era Distribution */}
      <SectionTitle>Era Distribution</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', borderRadius: 16, background: 'var(--bg-elevated)', border: '1px solid var(--separator)' }}>
        {stats.eraDistribution.map((e) => (
          <HorizontalBar key={e.era} label={e.era} value={e.plays} max={maxEra} display={`${e.plays} plays · ${formatMinutes(Math.round(e.minutes))}`} color="var(--accent-2)" />
        ))}
      </div>

      {/* Language */}
      {stats.topLanguages.length > 0 && (
        <>
          <SectionTitle>Top Languages</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', borderRadius: 16, background: 'var(--bg-elevated)', border: '1px solid var(--separator)' }}>
            {stats.topLanguages.map((l) => (
              <HorizontalBar key={l.language} label={l.language} value={l.plays} max={stats.topLanguages[0]?.plays ?? 1} display={`${l.plays} plays`} color="#34c759" />
            ))}
          </div>
        </>
      )}

      {/* Fun facts */}
      <SectionTitle>Fun Facts</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <StatCard value={`Age ${stats.listeningAge}`} label="Listening Age" accent="#a78bfa" />
        <StatCard value={stats.topDayOfWeek} label="Top Day" accent="#34c759" />
        <StatCard value={stats.averagePlaysPerTrack} label="Avg Plays/Song" accent="#ff9f0a" />
        <StatCard value={stats.uniqueAlbumsPlayed} label="Albums Played" accent="#ff375f" />
      </div>

      {stats.totalPlays === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--label-secondary)' }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>No listening data yet</p>
          <p style={{ fontSize: 14 }}>Play some music and your stats will appear here!</p>
        </div>
      )}
    </div>
  );
}
