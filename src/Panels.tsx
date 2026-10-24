import { useMemo, useState } from 'react';
import type { Session, Song } from '../electron/jellyfin';
import { clock, letterOf } from './transport';
import { Art, artist } from './App';

type Props = { session: Session; songs: Song[]; current?: Song; onPlay: (list: Song[], song: Song) => void; onReload: () => Promise<unknown>; error: string };

export function Panels({ session, songs, current, onPlay, onReload, error }: Props) {
  return (
    <aside className="panels">
      <nav className="tabs"><button className="on">Library</button><button disabled>Playlists</button><button disabled>Add music</button></nav>
      {error && <p className="error">{error}</p>}
      <Library session={session} songs={songs} current={current} onPlay={onPlay} onReload={onReload} />
    </aside>
  );
}

function Library({ session, songs, current, onPlay, onReload }: Omit<Props, 'error'>) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? songs.filter(s => [s.Name, s.Album, ...(s.Artists ?? [])].some(f => f?.toLowerCase().includes(q))) : songs;
  }, [songs, query]);
  const letters = useMemo(() => new Set(filtered.map(s => letterOf(s.Name))), [filtered]);
  const seen = new Set<string>();
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
              <li key={song.Id} data-letter={first ? letter : undefined} className={song.Id === current?.Id ? 'on' : ''} onDoubleClick={() => onPlay(filtered, song)}>
                <button className="row" onClick={() => onPlay(filtered, song)}>
                  <Art session={session} song={song} size={80} />
                  <span className="name">{song.Name}</span><span className="who">{artist(song)}{song.Album ? ` · ${song.Album}` : ''}</span>
                  <span className="time">{clock((song.RunTimeTicks ?? 0) / 1e7)}</span>
                </button>
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
