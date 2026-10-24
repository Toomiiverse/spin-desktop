import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpinAPI } from '../electron/preload';
import type { Session, Song } from '../electron/jellyfin';
import { artUrl, buildQueue, clock, nextIndex, onEnded, prevIndex, streamUrl, upNext, type Repeat } from './transport';
import { Panels } from './Panels';
import { haru } from './haru';
import { HaruStage } from './HaruStage';

declare global { interface Window { spin: SpinAPI } }

const SERVER = 'https://haruserver.tail6da04d.ts.net:8920';
export const artist = (song: Song) => song.Artists?.join(', ') || 'Unknown artist';

export function App() {
  const [session, setSession] = useState<Partial<Session> | null>(null);
  useEffect(() => { void window.spin.session().then(setSession); }, []);
  if (!session) return null;
  if (!session.token) return <Login server={session.server || SERVER} onDone={setSession} />;
  return <Deck session={session as Session} onLogout={() => window.spin.logout().then(() => setSession({ server: session.server }))} />;
}

function Login({ server, onDone }: { server: string; onDone: (session: Partial<Session>) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try { onDone(await window.spin.login(String(form.get('server')), String(form.get('username')), String(form.get('password')))); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <form className="login" onSubmit={submit}>
      <h1>Spin</h1>
      <label>Server <input name="server" defaultValue={server} required /></label>
      <label>User <input name="username" defaultValue="toomii" required autoFocus /></label>
      <label>Password <input name="password" type="password" required /></label>
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function Deck({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [error, setError] = useState('');
  // The pick is the list the song was chosen from; the queue is that list as it will play.
  const [pick, setPick] = useState<Song[]>([]);
  const [queue, setQueue] = useState<Song[]>([]);
  const [index, setIndex] = useState(0);
  const [repeat, setRepeat] = useState<Repeat>('off');
  const [shuffle, setShuffle] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [transcoded, setTranscoded] = useState(false);
  const current: Song | undefined = queue[index];

  const reload = useCallback(() => window.spin.songs().then(setSongs).catch(reason => setError((reason as Error).message)), []);
  useEffect(() => { void reload(); }, [reload]);
  // Haru on the card: she reacts to the deck, and idles on her own the rest of the time.
  useEffect(() => { if (current) haru.changed(); }, [current]);
  useEffect(() => { haru.playing(playing); }, [playing]);

  const play = (list: Song[], song: Song) => {
    const next = buildQueue(list, song.Id, shuffle);
    setPick(list); setQueue(next); setIndex(next.findIndex(s => s.Id === song.Id)); setTranscoded(false);
  };
  const jump = (to: number) => { setIndex(to); setTranscoded(false); audio.current && (audio.current.currentTime = 0); };
  const seekTo = (seconds: number) => { if (audio.current) audio.current.currentTime = seconds; };
  const toggle = () => { const el = audio.current; if (!el || !current) return; el.paused ? void el.play() : el.pause(); };
  const next = () => queue.length && jump(nextIndex(index, queue.length));
  const prev = () => { const to = prevIndex(index, queue.length, elapsed); to === 'seek0' ? seekTo(0) : jump(to); };
  const ended = () => { const to = onEnded(index, queue.length, repeat); if (to === 'stop') { seekTo(0); audio.current?.pause(); haru.ended(); } else if (to === index) { seekTo(0); void audio.current?.play(); } else jump(to); };
  const toggleShuffle = () => {
    const on = !shuffle; setShuffle(on);
    if (!current) return;
    const rebuilt = buildQueue(pick, current.Id, on); setQueue(rebuilt); setIndex(rebuilt.findIndex(s => s.Id === current.Id));
  };

  // A new song: load it, play it, tell the system what is on.
  useEffect(() => {
    const el = audio.current;
    if (!el || !current) return;
    el.src = streamUrl(session.server, current.Id, session.token, transcoded);
    void el.play().catch(() => {});
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: current.Name, artist: artist(current), album: current.Album, artwork: [{ src: artUrl(session.server, current), sizes: '600x600' }] });
  }, [current, transcoded, session]);
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', toggle); ms.setActionHandler('pause', toggle);
    ms.setActionHandler('previoustrack', prev); ms.setActionHandler('nexttrack', next);
    ms.setActionHandler('seekbackward', () => seekTo(Math.max(0, elapsed - 10))); ms.setActionHandler('seekforward', () => seekTo(Math.min(duration, elapsed + 10)));
  });
  // Chromium cannot decode this one: ask Jellyfin for AAC instead, from the same place.
  const failed = () => { if (!transcoded && current) { const at = audio.current?.currentTime ?? 0; setTranscoded(true); setTimeout(() => seekTo(at), 0); } };

  const ring = upNext(queue, index, repeat, 6);
  return (
    <div className="shell">
      <audio ref={audio} muted={muted} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={e => setElapsed(e.currentTarget.currentTime)} onDurationChange={e => setDuration(e.currentTarget.duration)} onEnded={ended} onError={failed} />
      <div className="backdrop" style={current ? { backgroundImage: `url("${artUrl(session.server, current)}")` } : undefined} />
      <div className="wordmark" aria-hidden="true">Spin</div>
      <aside className="rail" aria-hidden="true" />
      <main className="left">
        <section className="card now">
          <HaruStage />
          <div className="info">
            <div className="micro">Now playing <button className="link" onClick={onLogout}>Sign out</button></div>
            <div className="album">{current?.Album ?? '—'}</div>
            <h1 className="title">{current?.Name ?? 'Nothing on the deck'}</h1>
            <div className="artist">{current ? artist(current) : 'Pick a song on the right'}</div>
            <div className="level"><b>{clock(elapsed)}</b> / {clock(duration)}{current && lossless(current) && <span className="max">MAX</span>}</div>
            <input className="seek" type="range" min={0} max={duration || 0} step={0.1} value={elapsed} style={{ '--p': duration ? `${(elapsed / duration) * 100}%` : '0%' } as React.CSSProperties} onChange={e => seekTo(Number(e.currentTarget.value))} aria-label="Seek" />
            <div className="chips">{current && <><span>{codec(current)}</span>{current.Genres?.[0] && <span>{current.Genres[0]}</span>}</>}</div>
            <Stats song={current} />
            <div className="footer">Up next: <b>{ring[0]?.Name ?? (repeat === 'off' ? 'end of the disc' : '—')}</b></div>
          </div>
        </section>
        <section className="card modes">
          <div className="keys">
            <button className={`key ${shuffle ? 'on' : ''}`} onClick={toggleShuffle}>Shuffle</button>
            <button className={`key ${repeat === 'all' ? 'on' : ''}`} onClick={() => setRepeat(repeat === 'all' ? 'off' : 'all')}>Repeat</button>
            <button className={`key ${repeat === 'one' ? 'on' : ''}`} onClick={() => setRepeat(repeat === 'one' ? 'off' : 'one')}>Repeat one</button>
            <button className="key" disabled>Crossfade</button>
            <button className="key" disabled>Offline</button>
            <button className={`key ${muted ? 'on' : ''}`} onClick={() => setMuted(!muted)}>Mute</button>
          </div>
          <div className="transport">
            <button className="round" onClick={prev} aria-label="Previous">⏮</button>
            <button className="round" onClick={() => seekTo(Math.max(0, elapsed - 10))} aria-label="Back ten seconds">-10</button>
            <button className="round play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '⏸' : '▶'}</button>
            <button className="round" onClick={() => seekTo(Math.min(duration, elapsed + 10))} aria-label="Forward ten seconds">+10</button>
            <button className="round" onClick={next} aria-label="Next">⏭</button>
            <div className="counter"><b>{queue.length ? index + 1 : 0}</b> / {queue.length}</div>
          </div>
        </section>
        <section className="card deck">
          <div className="track" />
          <div className={`disc ${playing ? 'playing' : ''}`}>{current && <Art session={session} song={current} />}</div>
          {ring.map((song, i) => (
            <button key={`${song.Id}-${i}`} className="satellite" style={{ '--i': i } as React.CSSProperties} onClick={() => jump(queue.indexOf(song))} title={song.Name}>
              <Art session={session} song={song} size={120} /><span>{clock((song.RunTimeTicks ?? 0) / 1e7)}</span>
            </button>
          ))}
        </section>
      </main>
      <Panels session={session} songs={songs} current={current} onPlay={play} onReload={reload} error={error} />
    </div>
  );
}

export function Art({ session, song, size = 600 }: { session: Session; song: Song; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = artUrl(session.server, song, size);
  useEffect(() => setBroken(false), [src]);
  return broken ? <span className="blank-art" /> : <img src={src} alt="" onError={() => setBroken(true)} />;
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
