// The deck's rules, mirrored from the phone's Transport.swift. Pure, no imports, and only syntax Node can strip,
// so `node --test` runs the test against this file directly.
export type Repeat = 'off' | 'all' | 'one';

const pad = (n: number) => String(n).padStart(2, '0');
/** mm:ss; anything that is not a finite non-negative number reads 00:00, like the phone's LCD. */
export const clock = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const whole = Math.floor(seconds);
  return `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}`;
};

/** The library's index letter: A–Z, or # for anything else. */
export const letterOf = (name: string): string => {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
};

/** Next always wraps, like skipping a CD. */
export const nextIndex = (index: number, count: number): number => count ? (index + 1) % count : 0;

/** Previous goes back only in the first three seconds; later it restarts the song. */
export const prevIndex = (index: number, count: number, elapsed: number): number | 'seek0' =>
  elapsed <= 3 && count > 1 ? (index - 1 + count) % count : 'seek0';

/** A song ran out: where the deck goes, or 'stop' at the end of the disc with repeat off. */
export const onEnded = (index: number, count: number, repeat: Repeat): number | 'stop' => {
  if (repeat === 'one') return index;
  if (repeat === 'all') return (index + 1) % count;
  return index + 1 < count ? index + 1 : 'stop';
};

/** The queue from the songs picked: as picked, or shuffled with the current song kept first. */
export const buildQueue = <T extends { Id: string }>(original: T[], currentId: string | undefined, shuffle: boolean, rng: () => number = Math.random): T[] => {
  if (!shuffle) return original.slice();
  const rest = original.filter(song => song.Id !== currentId);
  for (let k = rest.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [rest[k], rest[j]] = [rest[j], rest[k]];
  }
  const current = original.find(song => song.Id === currentId);
  return current ? [current, ...rest] : rest;
};

/** What plays after the current song, in order; it wraps around the disc only under repeat all. */
export const upNext = <T>(queue: T[], index: number, repeat: Repeat, count = 6): T[] =>
  queue.slice(index + 1).concat(repeat === 'all' ? queue.slice(0, index + 1) : []).slice(0, count);

/** Direct play of the file itself, or Jellyfin transcoding to AAC when Chromium cannot decode it. */
export const streamUrl = (server: string, id: string, token: string, transcode: boolean): string =>
  `${server}/Audio/${id}/stream?${transcode ? 'audioCodec=aac&container=aac' : 'static=true'}&api_key=${encodeURIComponent(token)}`;

export const artUrl = (server: string, song: { Id: string; AlbumId?: string }, size = 600): string =>
  `${server}/Items/${song.AlbumId ?? song.Id}/Images/Primary?fillWidth=${size}&fillHeight=${size}&quality=90`;
