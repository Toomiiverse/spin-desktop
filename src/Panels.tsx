import { useEffect, useMemo, useState } from 'react';
import type { Playlist, Session, Song } from '../electron/jellyfin';
import type { Job, Result, Source } from '../electron/sources';
import { clock, letterOf } from './transport';
import { Art, artist } from './App';
import { haru } from './haru';

type Props = { session: Session; songs: Song[]; current?: Song; onPlay: (list: Song[], song: Song) => void; onReload: () => Promise<unknown>; error: string };
type Tab = 'library' | 'playlists' | 'add';
const message = (reason: unknown) => (reason as Error).message || String(reason);

export function Panels({ session, songs, current, onPlay, onReload, error }: Props) {
  const [tab, setTab] = useState<Tab>('library');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [problem, setProblem] = useState('');
  const loadPlaylists = () => window.spin.playlists().then(setPlaylists).catch(reason => setProblem(message(reason)));
  useEffect(() => { void loadPlaylists(); }, []);
  const shared = { session, songs, current, onPlay, onReload, playlists, loadPlaylists, setProblem };
  return (
    <aside className="panels">
      <nav className="tabs">{(['library', 'playlists', 'add'] as Tab[]).map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'add' ? 'Add music' : t}</button>)}</nav>
      {(error || problem) && <p className="error">{error || problem}</p>}
      {tab === 'library' && <Library {...shared} />}
      {tab === 'playlists' && <Playlists {...shared} />}
      {tab === 'add' && <AddMusic {...shared} />}
    </aside>
  );
}

type Shared = Omit<Props, 'error'> & { playlists: Playlist[]; loadPlaylists: () => Promise<unknown>; setProblem: (text: string) => void };

function Library({ session, songs, current, onPlay, onReload, playlists, setProblem }: Shared) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? songs.filter(s => [s.Name, s.Album, ...(s.Artists ?? [])].some(f => f?.toLowerCase().includes(q))) : songs;
  }, [songs, query]);
  const letters = useMemo(() => new Set(filtered.map(s => letterOf(s.Name))), [filtered]);
  const seen = new Set<string>();
  const run = (work: Promise<unknown>) => work.then(() => { setOpen(null); setEditing(null); setProblem(''); }).catch(reason => setProblem(message(reason)));
  const remove = (song: Song) => { if (confirm(`Delete "${song.Name}" from the server? The file goes too.`)) void run(window.spin.deleteItem(song.Id).then(onReload)); };
  return (
    <div className="library">
      <div className="search"><input placeholder="Search songs, artists, albums" value={query} onChange={e => setQuery(e.currentTarget.value)} /><button onClick={() => void onReload()} title="Reload the library">↻</button></div>
      <div className="list-wrap">
        {/* ponytail: plain rows, fine to a few thousand songs; virtualise only if the list ever drags. */}
        <ul className="songs">
          {filtered.map(song => {
            const letter = letterOf(song.Name);
            const first = !seen.has(letter); seen.add(letter);
            return (
              <li key={song.Id} data-letter={first ? letter : undefined} className={song.Id === current?.Id ? 'on' : ''}>
                {editing === song.Id ? <EditSong song={song} onDone={() => run(onReload())} onCancel={() => setEditing(null)} setProblem={setProblem} /> : (
                  <div className="row-wrap">
                    <button className="row" onClick={() => onPlay(filtered, song)}>
                      <Art session={session} song={song} size={80} />
                      <span className="name">{song.Name}</span><span className="who">{artist(song)}{song.Album ? ` · ${song.Album}` : ''}</span>
                      <span className="time">{clock((song.RunTimeTicks ?? 0) / 1e7)}</span>
                    </button>
                    <button className="more" onClick={() => setOpen(open === song.Id ? null : song.Id)} aria-label="More">⋯</button>
                  </div>
                )}
                {open === song.Id && editing !== song.Id && (
                  <div className="actions">
                    <select defaultValue="" onChange={e => { const pid = e.currentTarget.value; if (pid) void run(window.spin.addToPlaylist(pid, [song.Id])); }}>
                      <option value="" disabled>Add to playlist…</option>
                      {playlists.map(p => <option key={p.Id} value={p.Id}>{p.Name}</option>)}
                    </select>
                    <button onClick={() => setEditing(song.Id)}>Edit</button>
                    <button className="danger" onClick={() => remove(song)}>Delete</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="letters">{[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'].map(l => <button key={l} disabled={!letters.has(l)} onClick={() => document.querySelector(`[data-letter="${l}"]`)?.scrollIntoView({ block: 'start' })}>{l}</button>)}</div>
      </div>
      <div className="count">{filtered.length} songs</div>
    </div>
  );
}

function EditSong({ song, onDone, onCancel, setProblem }: { song: Song; onDone: () => void; onCancel: () => void; setProblem: (text: string) => void }) {
  const [busy, setBusy] = useState('');
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy('Saving…');
    try { await window.spin.editItem(song.Id, { title: String(form.get('title')), artist: String(form.get('artist')), album: String(form.get('album')) }); onDone(); }
    catch (reason) { setProblem(message(reason)); }
    finally { setBusy(''); }
  };
  const cover = async () => {
    setBusy('Cover…');
    try { if (await window.spin.pickArt(song.Id)) onDone(); }
    catch (reason) { setProblem(message(reason)); }
    finally { setBusy(''); }
  };
  return (
    <form className="edit" onSubmit={save}>
      <input name="title" defaultValue={song.Name} placeholder="Title" required />
      <input name="artist" defaultValue={song.Artists?.join(', ') ?? ''} placeholder="Artist" />
      <input name="album" defaultValue={song.Album ?? ''} placeholder="Album" />
      <div className="actions"><button disabled={!!busy}>{busy || 'Save'}</button><button type="button" onClick={() => void cover()} disabled={!!busy}>Cover…</button><button type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function Playlists({ session, current, onPlay, playlists, loadPlaylists, setProblem }: Shared) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<Song[]>([]);
  const [name, setName] = useState('');
  const run = (work: Promise<unknown>) => work.then(() => setProblem('')).catch(reason => setProblem(message(reason)));
  const open = (pid: string) => { setOpenId(pid); void run(window.spin.playlistItems(pid).then(setItems)); };
  const create = (event: React.FormEvent) => { event.preventDefault(); if (name.trim()) void run(window.spin.createPlaylist(name.trim(), []).then(loadPlaylists).then(() => setName(''))); };
  const remove = (pid: string, label: string) => { if (confirm(`Delete the playlist "${label}"? The songs stay.`)) void run(window.spin.deletePlaylist(pid).then(loadPlaylists).then(() => setOpenId(null))); };
  const drop = (song: Song) => openId && song.PlaylistItemId && void run(window.spin.removeFromPlaylist(openId, [song.PlaylistItemId]).then(() => open(openId)).then(loadPlaylists));
  const opened = playlists.find(p => p.Id === openId);
  if (opened) return (
    <div className="library">
      <div className="search"><button onClick={() => setOpenId(null)}>←</button><b className="crumb">{opened.Name}</b><button onClick={() => items[0] && onPlay(items, items[0])} disabled={!items.length}>Play</button></div>
      <ul className="songs">
        {items.map((song, i) => (
          <li key={song.PlaylistItemId ?? `${song.Id}-${i}`} className={song.Id === current?.Id ? 'on' : ''}>
            <div className="row-wrap">
              <button className="row" onClick={() => onPlay(items, song)}><Art session={session} song={song} size={80} /><span className="name">{song.Name}</span><span className="who">{artist(song)}</span><span className="time">{clock((song.RunTimeTicks ?? 0) / 1e7)}</span></button>
              <button className="more" onClick={() => drop(song)} aria-label="Remove from playlist">✕</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="count">{items.length} songs</div>
    </div>
  );
  return (
    <div className="library">
      <form className="search" onSubmit={create}><input placeholder="New playlist name" value={name} onChange={e => setName(e.currentTarget.value)} /><button disabled={!name.trim()}>＋</button></form>
      <ul className="songs">
        {playlists.map(p => (
          <li key={p.Id}><div className="row-wrap">
            <button className="row" onClick={() => open(p.Id)}><span className="blank-art" /><span className="name">{p.Name}</span><span className="who">{p.ChildCount ?? 0} songs</span></button>
            <button className="more danger" onClick={() => remove(p.Id, p.Name)} aria-label="Delete playlist">✕</button>
          </div></li>
        ))}
      </ul>
      <div className="count">{playlists.length} playlists, Jellyfin's own</div>
    </div>
  );
}

const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
function AddMusic({ songs, onReload, setProblem }: Shared) {
  const [source, setSource] = useState<Source>('youtube');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const inLibrary = (r: Result) => songs.some(s => plain(s.Name) === plain(r.title) && (!r.artist || (s.Artists ?? []).some(a => plain(a).includes(plain(r.artist!.split(',')[0])))));
  const run = (work: Promise<unknown>) => work.then(() => setProblem('')).catch(reason => setProblem(message(reason)));
  // Jobs on both servers, newest first, polled while this tab is open; Haru cheers when one lands.
  useEffect(() => {
    let done = new Set<string>();
    const poll = async () => {
      try {
        const [yt, sc] = await Promise.all([window.spin.jobs(), window.spin.soundcloudJobs()]);
        const all = [...yt, ...sc];
        if (done.size && all.some(j => j.status === 'completed' && !done.has(j.id))) haru.celebrate();
        done = new Set(all.filter(j => j.status === 'completed').map(j => j.id));
        setJobs(all);
      } catch (reason) { setProblem(message(reason)); }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [setProblem]);
  const isLink = /^https?:\/\//i.test(query.trim());
  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLink) return add({ kind: 'link', title: query.trim(), url: query.trim() });
    setBusy(true);
    try { setResults(await window.spin.search(query.trim(), source)); setProblem(''); }
    catch (reason) { setProblem(message(reason)); }
    finally { setBusy(false); }
  };
  const add = async (r: Result, force = false) => {
    if (!force && inLibrary(r) && !confirm(`"${r.title}" looks like it is already in the library. Download it again?`)) return;
    const soundcloud = /soundcloud\.com/i.test(r.url);
    try { await (soundcloud ? window.spin.addSoundcloud(r.url, force) : window.spin.addJob(r.url)); setProblem(''); setQuery(isLink ? '' : query); }
    catch (reason) {
      const why = message(reason);
      if (why.startsWith('409') && soundcloud && !force && confirm(`${why.slice(4)}\nDownload it anyway?`)) return add(r, true);
      setProblem(why);
    }
  };
  const clear = () => void run(Promise.all([window.spin.clearJobs(), window.spin.clearSoundcloud()]));
  const rescan = () => void run(window.spin.refreshLibrary().then(onReload));
  return (
    <div className="library add">
      <div className="toggle"><button className={source === 'youtube' ? 'on' : ''} onClick={() => setSource('youtube')}>YouTube Music</button><button className={source === 'soundcloud' ? 'on' : ''} onClick={() => setSource('soundcloud')}>SoundCloud</button></div>
      <form className="search" onSubmit={search}><input placeholder="Search, or paste a YouTube Music or SoundCloud link" value={query} onChange={e => setQuery(e.currentTarget.value)} /><button disabled={busy || !query.trim()}>{isLink ? 'Add' : busy ? '…' : 'Go'}</button></form>
      <ul className="songs results">
        {results.map((r, i) => (
          <li key={`${r.url}-${i}`}><div className="row-wrap">
            <div className="row">{r.thumbnail ? <img src={r.thumbnail} alt="" /> : <span className="blank-art" />}<span className="name">{r.title}{inLibrary(r) && <em className="have"> in library</em>}</span><span className="who">{[r.kind, r.artist, r.detail].filter(Boolean).join(' · ')}</span><span className="time">{r.duration ?? ''}</span></div>
            <button className="more" onClick={() => void add(r)} aria-label="Download">＋</button>
          </div></li>
        ))}
      </ul>
      <div className="jobs">
        <div className="micro">Downloads <span><button className="link" onClick={clear}>Clear done</button> · <button className="link" onClick={rescan}>Rescan library</button></span></div>
        {jobs.map(j => (
          <div key={j.id} className={`job ${j.status}`}>
            {j.content_info?.thumbnail_url ? <img src={j.content_info.thumbnail_url} alt="" /> : <span className="blank-art" />}
            <span className="name">{j.content_info?.title ?? j.url}</span>
            <span className="who">{[j.content_info?.artist, j.status.replace('_', ' '), j.content_info?.track_count && `${j.content_info.track_count} tracks`].filter(Boolean).join(' · ')}</span>
            <i style={{ width: `${j.status === 'completed' ? 100 : Math.round((j.progress ?? 0) * (j.progress && j.progress <= 1 ? 100 : 1))}%` }} />
          </div>
        ))}
        {!jobs.length && <div className="count">Nothing downloading</div>}
      </div>
    </div>
  );
}
