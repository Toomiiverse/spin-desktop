import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shape } from '../src/coverWave.ts';

// A 96x96 RGBA cover: flat grey on the left half, a busy red checkerboard on the right.
function cover(busyFrom: number) {
  const px = new Uint8ClampedArray(96 * 96 * 4);
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const i = (y * 96 + x) * 4, busy = x >= busyFrom && (x + y) % 2 === 0;
    px[i] = busy ? 230 : 120; px[i + 1] = busy ? 30 : 120; px[i + 2] = busy ? 40 : 120; px[i + 3] = 255;
  }
  return px;
}

test('the wave follows where the cover is busy, and each cover gives its own', () => {
  const a = shape(cover(48), 24), b = shape(cover(12), 24);
  assert.equal(a.heights.length, 24);
  assert.ok(a.heights.every(h => h >= 0.12 && h <= 1));
  assert.ok(a.heights[2] < 0.3 && a.heights[20] > 0.9, 'flat half low, busy half high');
  assert.notDeepEqual(a.heights, b.heights);
  assert.match(a.colour, /^rgb\(\d+, \d+, \d+\)$/);
  const [r, g] = a.colour.match(/\d+/g)!.map(Number);
  assert.ok(r > g, 'the red of the busy half is the accent');
});
