// A waveform drawn from the album cover rather than the audio, so every album has its own: the cover is read at
// 96x96, and each bar is how busy one vertical slice of it is (its contrast plus its edges), smoothed and scaled.
// The colour is the cover's most saturated common hue. Jellyfin serves images with Access-Control-Allow-Origin: *,
// so a crossOrigin image can be read back from a canvas.
export type Wave = { heights: number[]; colour: string };

const SIZE = 96;
const cache = new Map<string, Promise<Wave>>();

/** The cover's wave, computed once per URL. */
export function coverWave(url: string, bars = 56): Promise<Wave> {
  const key = `${url}#${bars}`;
  if (!cache.has(key)) cache.set(key, load(url).then(pixels => shape(pixels, bars)).catch(() => flat(bars)));
  return cache.get(key)!;
}

function load(url: string): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIZE;
      const g = canvas.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(image, 0, 0, SIZE, SIZE);
      resolve(g.getImageData(0, 0, SIZE, SIZE).data);
    };
    image.onerror = () => reject(new Error('no cover'));
    image.src = url;
  });
}

/** Bar heights (0.12..1) and an accent colour from 96x96 RGBA pixels. Pure, so it is easy to check. */
export function shape(px: Uint8ClampedArray, bars: number): Wave {
  const lum = (x: number, y: number) => { const i = (y * SIZE + x) * 4; return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; };
  const columns: number[] = [];
  for (let x = 0; x < SIZE; x++) {
    let sum = 0, sq = 0, edges = 0;
    for (let y = 0; y < SIZE; y++) {
      const l = lum(x, y); sum += l; sq += l * l;
      if (y) edges += Math.abs(l - lum(x, y - 1));
      if (x) edges += Math.abs(l - lum(x - 1, y));
    }
    const mean = sum / SIZE, spread = Math.sqrt(Math.max(0, sq / SIZE - mean * mean));
    columns.push(spread + edges / SIZE);
  }
  // Each bar covers its share of columns; a light 3-tap blur keeps neighbours related, like real audio.
  const raw = Array.from({ length: bars }, (_, b) => {
    const from = Math.floor((b * SIZE) / bars), to = Math.max(from + 1, Math.floor(((b + 1) * SIZE) / bars));
    let total = 0; for (let x = from; x < to; x++) total += columns[x];
    return total / (to - from);
  });
  const smooth = raw.map((v, i) => (raw[i - 1] ?? v) * 0.25 + v * 0.5 + (raw[i + 1] ?? v) * 0.25);
  const lo = Math.min(...smooth), hi = Math.max(...smooth);
  const heights = smooth.map(v => 0.12 + 0.88 * (hi > lo ? (v - lo) / (hi - lo) : 0.5));
  return { heights, colour: accent(px) };
}

// The most saturated colour that is also common: hues are binned, each bin scored by count × saturation.
function accent(px: Uint8ClampedArray): string {
  const bins = new Map<number, { n: number; r: number; g: number; b: number; s: number }>();
  for (let i = 0; i < px.length; i += 16) {
    const r = px[i], g = px[i + 1], b = px[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
    const s = max ? (max - min) / max : 0;
    if (s < 0.3 || max < 60) continue;
    const h = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min);
    const key = Math.round(((h + 6) % 6) * 2);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0, s: 0 };
    bin.n++; bin.r += r; bin.g += g; bin.b += b; bin.s += s; bins.set(key, bin);
  }
  let best: { n: number; r: number; g: number; b: number; s: number } | undefined, score = 0;
  for (const bin of bins.values()) { const sc = bin.n * (bin.s / bin.n); if (sc > score) { score = sc; best = bin; } }
  if (!best) return '#111214';
  // Darkened enough to read on the light player panel.
  const k = 0.78 / best.n;
  return `rgb(${Math.round(best.r * k)}, ${Math.round(best.g * k)}, ${Math.round(best.b * k)})`;
}

function flat(bars: number): Wave {
  return { heights: Array.from({ length: bars }, (_, i) => 0.3 + 0.25 * Math.abs(Math.sin(i * 1.7))), colour: '#111214' };
}
