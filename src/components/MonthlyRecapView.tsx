import { useMemo, useState, useCallback } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import {
  computeMonthlyRecap,
  availableMonthKeys,
  monthLabelFor,
  formatMinutes,
} from '../lib/monthlyRecap';
import { Artwork } from './Artwork';
import { PlayIcon } from './Icons';

function StatCard({ value, label, accent }: { value: string | number; label: string; accent?: string }): JSX.Element {
  return (
    <div style={{
      padding: '16px 14px',
      borderRadius: 14,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--separator)',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 'clamp(20px, 4.5vw, 26px)',
        fontWeight: 800,
        color: accent ?? 'var(--accent)',
        letterSpacing: '-0.5px',
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 11,
        color: 'var(--label-secondary)',
        marginTop: 3,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: 600,
      }}>
        {label}
      </div>
    </div>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 12px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--label)', margin: 0, letterSpacing: '-0.3px' }}>
        {children}
      </h2>
      {action}
    </div>
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

export function MonthlyRecapView(): JSX.Element {
  const tracks = useLibrary((s) => s.tracks);
  const monthlyPlays = usePlayer((s) => s.monthlyPlays);
  const monthlyListenTime = usePlayer((s) => s.monthlyListenTime);
  const goBack = useUI((s) => s.goBack);
  const navigate = useUI((s) => s.navigate);
  const playTracks = usePlayer((s) => s.playTracks);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const playlists = useLibrary((s) => s.playlists);

  const monthKeys = useMemo(() => availableMonthKeys(monthlyPlays), [monthlyPlays]);
  const [monthIndex, setMonthIndex] = useState(0);

  const currentKey = monthKeys[Math.min(monthIndex, monthKeys.length - 1)] ?? monthKeys[0];

  const recap = useMemo(
    () => (currentKey ? computeMonthlyRecap(tracks, monthlyPlays, monthlyListenTime, currentKey) : null),
    [tracks, monthlyPlays, monthlyListenTime, currentKey]
  );

  const topTracks = useMemo(() => {
    if (!recap) return [];
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return recap.trackIdsByPlays
      .map((id) => byId.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .slice(0, 25);
  }, [recap, tracks]);

  const handlePlay = useCallback(() => {
    if (topTracks.length === 0) return;
    const name = `Monthly Recap – ${recap?.month.label ?? ''}`;
    // Reuse existing recap playlist if present, else create one
    let playlist = playlists.find((p) => p.name === name);
    if (!playlist) {
      const id = createPlaylist(name);
      addToPlaylist(id, topTracks.map((t) => t.id));
      playlist = playlists.find((p) => p.id === id) ?? { id, name, createdAt: Date.now(), trackIds: topTracks.map((t) => t.id) };
    } else {
      addToPlaylist(playlist.id, topTracks.map((t) => t.id));
    }
    playTracks(topTracks, 0, name);
  }, [topTracks, recap, playlists, createPlaylist, addToPlaylist, playTracks]);

  const handleSavePlaylist = useCallback(() => {
    if (topTracks.length === 0) return;
    const name = `Monthly Recap – ${recap?.month.label ?? ''}`;
    const existing = playlists.find((p) => p.name === name);
    if (existing) {
      navigate({ type: 'playlist', id: existing.id });
    } else {
      const id = createPlaylist(name);
      addToPlaylist(id, topTracks.map((t) => t.id));
      navigate({ type: 'playlist', id });
    }
  }, [topTracks, recap, playlists, createPlaylist, addToPlaylist, navigate]);

  const maxGenre = recap?.topGenres[0]?.plays ?? 1;
  const maxEra = recap ? Math.max(...recap.eraDistribution.map((e) => e.plays), 1) : 1;

  if (monthKeys.length === 0 || !recap) {
    return (
      <div className="fade-page" style={{ paddingBottom: 40, paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px' }}>
          <button onClick={goBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, cursor: 'pointer', fontWeight: 600 }}>
            ‹ Back
          </button>
        </div>
        <h1 className="large-title" style={{ marginBottom: 4 }}>Monthly Recap</h1>
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--label-secondary)' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No monthly data yet</p>
          <p style={{ fontSize: 14 }}>Play some music and your monthly recaps will appear here!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-page" style={{ paddingBottom: 40, paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px' }}>
        <button onClick={goBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, cursor: 'pointer', fontWeight: 600 }}>
          ‹ Back
        </button>
        <button
          onClick={() => navigate({ type: 'wrapped' })}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999,
            background: 'var(--accent-gradient)', color: '#fff',
            border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          ✨ Wrapped
        </button>
      </div>

      {/* Month Picker */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
        margin: '8px 0 4px',
      }}>
        <button
          onClick={() => setMonthIndex((i) => Math.min(i + 1, monthKeys.length - 1))}
          disabled={monthIndex >= monthKeys.length - 1}
          style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--separator)',
            color: monthIndex >= monthKeys.length - 1 ? 'var(--label-tertiary)' : 'var(--label)',
            width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: monthIndex >= monthKeys.length - 1 ? 0.4 : 1,
          }}
        >
          ‹
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--label-secondary)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Monthly Recap
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--label)', letterSpacing: '-0.5px' }}>
            {recap.month.label}
          </div>
        </div>
        <button
          onClick={() => setMonthIndex((i) => Math.max(i - 1, 0))}
          disabled={monthIndex <= 0}
          style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--separator)',
            color: monthIndex <= 0 ? 'var(--label-tertiary)' : 'var(--label)',
            width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: monthIndex <= 0 ? 0.4 : 1,
          }}
        >
          ›
        </button>
      </div>

      {/* Month dots */}
      {monthKeys.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '4px 0 8px' }}>
          {monthKeys.slice(0, 12).map((k, i) => (
            <button
              key={k}
              onClick={() => setMonthIndex(i)}
              style={{
                width: monthIndex === i ? 18 : 6,
                height: 6,
                borderRadius: 3,
                border: 'none',
                background: monthIndex === i ? 'var(--accent)' : 'var(--separator)',
                cursor: 'pointer',
                transition: 'width 0.2s, background 0.2s',
                padding: 0,
              }}
              title={monthLabelFor(k).label}
            />
          ))}
        </div>
      )}

      {/* Play CTA */}
      {topTracks.length > 0 && (
        <div style={{ display: 'flex', gap: 10, margin: '8px 0 4px' }}>
          <button
            onClick={handlePlay}
            style={{
              flex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px 20px', borderRadius: 14,
              background: 'var(--accent-gradient)', color: '#fff',
              border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <PlayIcon size={16} />
            Play Top {Math.min(topTracks.length, 25)} Songs
          </button>
          <button
            onClick={handleSavePlaylist}
            style={{
              padding: '14px 16px', borderRadius: 14,
              background: 'var(--bg-elevated)', color: 'var(--accent)',
              border: '1px solid var(--separator)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Save Playlist
          </button>
        </div>
      )}

      {/* Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 12 }}>
        <StatCard value={formatMinutes(recap.totalMinutes)} label="Time Listened" />
        <StatCard value={recap.totalPlays.toLocaleString()} label="Total Plays" />
        <StatCard value={recap.uniqueTracks.toLocaleString()} label="Songs Played" accent="#a78bfa" />
        <StatCard value={recap.uniqueArtists.toLocaleString()} label="Artists Heard" accent="#34c759" />
      </div>

      {/* Top Artists */}
      <SectionTitle>Top Artists</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recap.topArtists.slice(0, 5).map((a, i) => (
          <div key={a.id} style={{
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
      <SectionTitle>Most Played</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {recap.topSongs.slice(0, 10).map((s, i) => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 10px', borderRadius: 10, background: 'var(--bg-elevated)',
            border: '1px solid var(--separator)',
          }}>
            <span style={{ width: 22, textAlign: 'center', fontWeight: 700, color: 'var(--label-tertiary)', fontSize: 13 }}>{i + 1}</span>
            <Artwork src={s.artwork} className="row-artwork" style={{ width: 36, height: 36, borderRadius: 6 }} placeholderSize={12} alt="" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
              <div style={{ fontSize: 11, color: 'var(--label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sub}</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>{s.plays}×</div>
          </div>
        ))}
      </div>

      {/* Top Albums */}
      {recap.topAlbums.length > 0 && (
        <>
          <SectionTitle>Top Albums</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recap.topAlbums.slice(0, 5).map((a, i) => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 12, background: 'var(--bg-elevated)',
                border: '1px solid var(--separator)',
              }}>
                <span style={{ width: 22, textAlign: 'center', fontWeight: 700, color: 'var(--label-tertiary)', fontSize: 13 }}>{i + 1}</span>
                <Artwork src={a.artwork} className="row-artwork" style={{ width: 40, height: 40, borderRadius: 6 }} placeholderSize={14} alt="" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--label-secondary)' }}>{a.sub}</div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>{a.plays}×</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Genre Breakdown */}
      {recap.topGenres.length > 0 && (
        <>
          <SectionTitle>Genre Breakdown</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', borderRadius: 16, background: 'var(--bg-elevated)', border: '1px solid var(--separator)' }}>
            {recap.topGenres.map((g) => (
              <HorizontalBar key={g.genre} label={g.genre} value={g.plays} max={maxGenre} display={`${g.plays} plays`} />
            ))}
          </div>
        </>
      )}

      {/* Era Distribution */}
      {recap.eraDistribution.length > 0 && (
        <>
          <SectionTitle>Era Distribution</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', borderRadius: 16, background: 'var(--bg-elevated)', border: '1px solid var(--separator)' }}>
            {recap.eraDistribution.map((e) => (
              <HorizontalBar key={e.era} label={e.era} value={e.plays} max={maxEra} display={`${e.plays} plays`} color="var(--accent-2)" />
            ))}
          </div>
        </>
      )}

      {/* Fun Facts */}
      <SectionTitle>Fun Facts</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <StatCard value={recap.uniqueAlbums} label="Albums Played" accent="#ff375f" />
        <StatCard value={recap.averagePlaysPerTrack} label="Avg Plays/Song" accent="#ff9f0a" />
        {recap.topMood !== '—' && (
          <StatCard value={recap.topMood} label="Top Mood" accent="#a78bfa" />
        )}
        <StatCard value={monthLabelFor(currentKey).short} label="Viewing Month" accent="#34c759" />
      </div>

      {/* Bottom spacer */}
      <div style={{ height: 20 }} />
    </div>
  );
}
