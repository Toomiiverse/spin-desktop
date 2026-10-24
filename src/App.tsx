import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpinAPI } from '../electron/preload';
import type { Session, Song } from '../electron/jellyfin';
import { artUrl, buildQueue, clock, nextIndex, onEnded, prevIndex, streamUrl, upNext, type Repeat } from './transport';
import { Panels } from './Panels';
import { haru } from './haru';
import { NowPlaying } from './NowPlaying';
import { MediaBar } from './MediaBar';
import { listen } from './spectrum';

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

  const ring = upNext(queue, index, repeat, 1);
  return (
    <div className="shell">
      <audio ref={audio} crossOrigin="anonymous" onPlay={e => { listen(e.currentTarget); setPlaying(true); }} onPause={() => setPlaying(false)} onTimeUpdate={e => setElapsed(e.currentTarget.currentTime)} onDurationChange={e => setDuration(e.currentTarget.duration)} onEnded={ended} onError={failed} />
      <div className="backdrop" style={current ? { backgroundImage: `url("${artUrl(session.server, current)}")` } : undefined} />
      <div className="wordmark" aria-hidden="true">Spin</div>
      <aside className="rail" aria-hidden="true" />
      <main className="left">
        <NowPlaying session={session} current={current} playing={playing} upNext={ring[0]?.Name ?? (repeat === 'off' ? 'end of the disc' : '—')} onLogout={onLogout} />
        <MediaBar session={session} current={current} playing={playing} elapsed={elapsed} duration={duration} repeat={repeat} shuffle={shuffle}
          onSeek={seekTo} onToggle={toggle} onPrev={prev} onNext={next} onShuffle={toggleShuffle}
          onRepeat={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')} />
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
