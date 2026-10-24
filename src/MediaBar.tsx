import { useEffect, useState } from 'react';
import type { Session, Song } from '../electron/jellyfin';
import { artUrl, clock, type Repeat } from './transport';
import { coverWave, type Wave } from './coverWave';

// The controls card after the user's minimal player reference: the title with a play-count badge, the genre as a
// tag, a waveform between the two times that fills as the song plays (and seeks when clicked), then five keys.
// The waveform's shape and colour come from the album cover (coverWave.ts), so each album has its own.
type Props = {
  session: Session; current?: Song; playing: boolean; elapsed: number; duration: number; repeat: Repeat; shuffle: boolean;
  onSeek: (seconds: number) => void; onToggle: () => void; onPrev: () => void; onNext: () => void; onRepeat: () => void; onShuffle: () => void;
};

export function MediaBar({ session, current, playing, elapsed, duration, repeat, shuffle, onSeek, onToggle, onPrev, onNext, onRepeat, onShuffle }: Props) {
  const wave = useCoverWave(session, current);
  const progress = duration ? elapsed / duration : 0;
  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * duration);
  };
  const plays = current?.UserData?.PlayCount ?? 0;
  return (
    <section className="card player">
      <div className="player-head">
        <h2 className="player-title">{current?.Name ?? 'Nothing on the deck'}</h2>
        <span className="player-count" title="Plays"><Icon d="M4 4h16v12H9l-5 4zM12 7v6M9 10h6" />{plays}</span>
      </div>
      {current?.Genres?.[0] && <span className="player-tag">{current.Genres[0]}</span>}
      <div className="player-wave-row">
        <span className="player-time">{clock(elapsed)}</span>
        <div className="player-wave" role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(elapsed)} tabIndex={0}
          onClick={seek} onKeyDown={e => { if (e.key === 'ArrowRight') onSeek(Math.min(duration, elapsed + 5)); if (e.key === 'ArrowLeft') onSeek(Math.max(0, elapsed - 5)); }}
          style={{ '--accent': wave.colour } as React.CSSProperties}>
          {wave.heights.map((h, i) => <i key={i} className={(i + 0.5) / wave.heights.length <= progress ? 'played' : ''} style={{ height: `${Math.round(h * 100)}%` }} />)}
        </div>
        <span className="player-time">{clock(duration)}</span>
      </div>
      <div className="player-keys">
        <button className={`player-key ${repeat !== 'off' ? 'on' : ''}`} onClick={onRepeat} aria-label={`Repeat ${repeat}`} title={`Repeat: ${repeat}`}>
          <Icon d="M7 7h11l-3-3M17 17H6l3 3M18 7v5M6 17v-5" />{repeat === 'one' && <b>1</b>}
        </button>
        <button className="player-key" onClick={onPrev} aria-label="Previous"><Icon d="M17 6v12L8 12zM6 6v12" /></button>
        <button className="player-play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Icon d="M9 6v12M15 6v12" /> : <Icon d="M8 5v14l11-7z" />}
        </button>
        <button className="player-key" onClick={onNext} aria-label="Next"><Icon d="M7 6v12l9-6zM18 6v12" /></button>
        <button className={`player-key ${shuffle ? 'on' : ''}`} onClick={onShuffle} aria-label="Shuffle"><Icon d="M4 7h3l10 10h3M4 17h3l3-3M14 10l3-3h3M18 5l2 2-2 2M18 15l2 2-2 2" /></button>
      </div>
    </section>
  );
}

// Thin and many, like the reference's waveform.
const BARS = 120;
function useCoverWave(session: Session, song?: Song): Wave {
  const [wave, setWave] = useState<Wave>({ heights: Array(BARS).fill(0.3), colour: '#111214' });
  const url = song ? artUrl(session.server, song, 96) : '';
  useEffect(() => {
    let live = true;
    if (url) void coverWave(url, BARS).then(w => live && setWave(w));
    return () => { live = false; };
  }, [url]);
  return wave;
}

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
