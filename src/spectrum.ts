// The music as numbers, read off the <audio> element through Web Audio: 32 log-spaced bands (low first), an
// overall level, where on the band axis the energy sits, and a beat flag from the bass. Jellyfin's streams send
// Access-Control-Allow-Origin: *, and the element is crossOrigin="anonymous", so the analyser hears real samples.
export type Reading = { bands: Float32Array; level: number; centre: number; beat: boolean };

const BANDS = 32;
let analyser: AnalyserNode | undefined;
let context: AudioContext | undefined;
let bins: Uint8Array<ArrayBuffer>;
const bands = new Float32Array(BANDS);
let bassAverage = 0, lastBeat = 0;

/** Wires the element into an analyser once; safe to call again. Needs a user gesture first (play). */
export function listen(audio: HTMLAudioElement) {
  if (analyser) { void context?.resume(); return; }
  context = new AudioContext();
  const source = context.createMediaElementSource(audio);
  analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.72;
  source.connect(analyser).connect(context.destination);
  bins = new Uint8Array(analyser.frequencyBinCount);
}

const silent: Reading = { bands, level: 0, centre: 0.3, beat: false };
/** This frame's reading; all zeros until listen() has run. */
export function read(now = performance.now()): Reading {
  if (!analyser) return silent;
  analyser.getByteFrequencyData(bins);
  // Log-spaced from ~40 Hz to ~14 kHz, so the bass gets as many bars as the treble, like a hi-fi display.
  const nyquist = analyser.context.sampleRate / 2, per = bins.length / nyquist;
  let total = 0, weighted = 0;
  for (let b = 0; b < BANDS; b++) {
    const lo = Math.floor(40 * Math.pow(14000 / 40, b / BANDS) * per), hi = Math.max(lo + 1, Math.floor(40 * Math.pow(14000 / 40, (b + 1) / BANDS) * per));
    let peak = 0;
    for (let i = lo; i < hi && i < bins.length; i++) peak = Math.max(peak, bins[i]);
    const value = peak / 255;
    bands[b] = value; total += value; weighted += value * b;
  }
  const level = total / BANDS;
  // A beat: the bass jumping well above its own recent average, at most every 280 ms.
  const bass = (bands[0] + bands[1] + bands[2] + bands[3]) / 4;
  bassAverage = bassAverage * 0.94 + bass * 0.06;
  const beat = bass > 0.35 && bass > bassAverage * 1.25 && now - lastBeat > 280;
  if (beat) lastBeat = now;
  return { bands, level, centre: total ? weighted / total / (BANDS - 1) : 0.3, beat };
}
