import { useEffect, useRef } from 'react';
import type { Session, Song } from '../electron/jellyfin';
import { clock } from './transport';
import { Art, artist } from './App';
import { HaruStage } from './HaruStage';
import { read } from './spectrum';

// The now-playing card after the user's CD-player reference (a Blue Archive track player), turned 90° to the left:
// the spectrum display runs down the left edge, Haru's stage beside it lit by the music, the title plate on top,
// the printed disc half out of the case on the right, and the label strip along the bottom.
type Props = { session: Session; current?: Song; playing: boolean; elapsed: number; duration: number; upNext?: string; onSeek: (seconds: number) => void; onLogout: () => void };

export function NowPlaying({ session, current, playing, elapsed, duration, upNext, onSeek, onLogout }: Props) {
  const card = useRef<HTMLElement>(null);
  const bars = useRef<HTMLCanvasElement>(null);
  useLight(card, bars, playing);
  return (
    <section className={`card now ${playing ? 'playing' : ''}`} ref={card}>
      <div className="meter">
        <div className="meter-head"><i className="knob" /><span className="leds"><i /><i /><i /></span></div>
        <canvas ref={bars} className="bars" aria-hidden="true" />
        <span className="meter-label">Spectrum · L/R</span>
      </div>
      <div className="lit">
        <HaruStage />
        {/* Light from the spectrum's side: a glow at the height the music sits, a sweep across her on each beat,
            and the shadow it leaves behind on her far side. Both are blend layers over the rig. */}
        <div className="light" aria-hidden="true" />
        <div className="shade" aria-hidden="true" />
      </div>
      <div className="info">
        <div className="micro">Now playing <button className="link" onClick={onLogout}>Sign out</button></div>
        <div className="plate">
          <span className="brand">Spin</span>
          <h1 className="title">{current?.Name ?? 'Nothing on the deck'}</h1>
          <div className="album"><span className="plus">+++++++</span>/// {current?.Album ?? 'Pick a song on the right'}</div>
          <div className="artist">{current ? artist(current) : 'Spin · track player'}</div>
        </div>
        <div className="body">
          <div className="level"><b>{clock(elapsed)}</b> / {clock(duration)}{current && lossless(current) && <span className="max">MAX</span>}</div>
          <input className="seek" type="range" min={0} max={duration || 0} step={0.1} value={elapsed} style={{ '--p': duration ? `${(elapsed / duration) * 100}%` : '0%' } as React.CSSProperties} onChange={e => onSeek(Number(e.currentTarget.value))} aria-label="Seek" />
          <div className="chips">{current && <><span>{codec(current)}</span>{current.Genres?.[0] && <span>{current.Genres[0]}</span>}</>}</div>
          <Stats song={current} />
        </div>
        <div className="cd" aria-hidden="true">
          {current ? <Art session={session} song={current} /> : <span className="blank-art" />}
          <span className="cd-dark"><b>{current?.Name ?? 'Spin'}</b><small>{current ? artist(current) : ''}</small></span>
          <i className="cd-hub" />
        </div>
      </div>
      <div className="strip">
        <b className="strip-logo">SPIN</b><span className="strip-small">Trackplayer · Listen</span>
        <span className="strip-next">Up next: <b>{upNext}</b></span>
        <b className="strip-codec">{current ? codec(current) : '—'}</b>
      </div>
    </section>
  );
}

/** One frame loop: draws the spectrum and moves the light on Haru, through CSS variables on the card. */
function useLight(card: React.RefObject<HTMLElement | null>, bars: React.RefObject<HTMLCanvasElement | null>, playing: boolean) {
  const on = useRef(playing);
  on.current = playing;
  useEffect(() => {
    let frame = 0, sweepAt = -1e9, glow = 0, height = 0.5, average = 0.2;
    const peaks = new Float32Array(32);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const el = card.current, canvas = bars.current;
      if (!el || !canvas) return;
      const { bands, level, centre, beat } = read(now);
      const live = on.current;
      // The glow follows the level against the song's own recent loudness, so it pulses on quiet and loud
      // masters alike (raw level pinned it at full on loud ones); it rests near 0.55 and swells on peaks.
      average += (level - average) * 0.01;
      const target = live ? Math.min(1, Math.max(0, (level / Math.max(average, 0.04)) * 0.55 - 0.05)) : 0;
      glow += (target - glow) * 0.22;
      height += ((1 - centre) - height) * 0.08;
      if (beat && live && !still) sweepAt = now;
      const sweep = (now - sweepAt) / 650; // 0..1 while a beat's light crosses her, then rests past her
      el.style.setProperty('--glow', glow.toFixed(3));
      el.style.setProperty('--ly', `${(height * 100).toFixed(1)}%`);
      el.style.setProperty('--sweep', Math.min(sweep, 1.4).toFixed(3));
      el.style.setProperty('--sv', (sweep < 1 ? Math.sin(Math.PI * Math.max(0, sweep)) : 0).toFixed(3));
      draw(canvas, bands, peaks);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [card, bars]);
}

// Horizontal bars, low frequencies at the bottom, growing right toward her, with falling peak caps.
function draw(canvas: HTMLCanvasElement, bands: Float32Array, peaks: Float32Array) {
  const ratio = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
  const g = canvas.getContext('2d')!;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, w, h);
  const rows = bands.length, pitch = h / rows, thick = Math.max(2, pitch * 0.55);
  for (let i = 0; i < rows; i++) {
    const value = bands[i], y = h - (i + 1) * pitch + (pitch - thick) / 2;
    peaks[i] = Math.max(value, peaks[i] - 0.012);
    g.fillStyle = 'rgba(200, 240, 0, 0.12)'; g.fillRect(2, y, w - 4, thick);
    g.fillStyle = '#c8f000'; g.shadowColor = '#c8f000'; g.shadowBlur = 6; g.fillRect(2, y, Math.max(1, (w - 4) * value), thick); g.shadowBlur = 0;
    g.fillStyle = '#f4ffd0'; g.fillRect(2 + (w - 6) * peaks[i], y, 2, thick);
  }
}

const stream = (song: Song) => song.MediaSources?.[0]?.MediaStreams?.find(s => s.Type === 'Audio');
const codec = (song: Song) => (stream(song)?.Codec ?? song.MediaSources?.[0]?.Container ?? '?').toUpperCase();
const lossless = (song: Song) => ['flac', 'alac', 'wav', 'aiff', 'pcm'].includes(stream(song)?.Codec ?? '');
function Stats({ song }: { song?: Song }) {
  const source = song?.MediaSources?.[0];
  const audio = song && stream(song);
  const rows: [string, string, boolean?][] = [
    ['Bitrate', audio?.BitRate || source?.Bitrate ? `${Math.round((audio?.BitRate || source?.Bitrate || 0) / 1000)} kbps` : '—', true],
    ['Sample rate', audio?.SampleRate ? `${(audio.SampleRate / 1000).toFixed(1)} kHz` : '—'],
    ['Year', song?.ProductionYear ? String(song.ProductionYear) : '—'],
    ['Track', song?.IndexNumber ? String(song.IndexNumber) : '—'],
    ['Size', source?.Size ? `${(source.Size / 1048576).toFixed(1)} MB` : '—'],
    ['Channels', audio?.Channels ? String(audio.Channels) : '—'],
    ['Added', song?.DateCreated ? song.DateCreated.slice(0, 10) : '—'],
    ['Quality', song ? (lossless(song) ? 'MAX' : 'A') : '—'],
  ];
  return <div className="stats">{rows.map(([label, value, hot]) => <div key={label} className={`pill ${hot ? 'hot' : ''}`}><span>{label}</span><b>{value}</b></div>)}</div>;
}
