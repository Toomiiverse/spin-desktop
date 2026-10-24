import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artUrl, buildQueue, clock, letterOf, nextIndex, onEnded, prevIndex, streamUrl, upNext } from '../src/transport.ts';

const songs = ['a', 'b', 'c', 'd', 'e'].map(Id => ({ Id }));

test('clock pads and refuses nonsense', () => {
  assert.equal(clock(0), '00:00');
  assert.equal(clock(154.9), '02:34');
  assert.equal(clock(3599), '59:59');
  assert.equal(clock(3600), '60:00');
  assert.equal(clock(NaN), '00:00');
  assert.equal(clock(Infinity), '00:00');
  assert.equal(clock(-5), '00:00');
});

test('letter index', () => {
  assert.equal(letterOf('zebra'), 'Z');
  assert.equal(letterOf('  bob'), 'B');
  assert.equal(letterOf('9 lives'), '#');
  assert.equal(letterOf(''), '#');
  assert.equal(letterOf('été'), '#');
});

test('next wraps, previous only within three seconds', () => {
  assert.equal(nextIndex(4, 5), 0);
  assert.equal(nextIndex(0, 0), 0);
  assert.equal(prevIndex(0, 5, 2), 4);
  assert.equal(prevIndex(3, 5, 10), 'seek0');
  assert.equal(prevIndex(0, 1, 1), 'seek0');
});

test('the end of a song under each repeat mode', () => {
  assert.equal(onEnded(4, 5, 'off'), 'stop');
  assert.equal(onEnded(2, 5, 'off'), 3);
  assert.equal(onEnded(4, 5, 'all'), 0);
  assert.equal(onEnded(4, 5, 'one'), 4);
});

test('shuffle keeps the current song first and the rest intact', () => {
  let seed = 1;
  const rng = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  const shuffled = buildQueue(songs, 'c', true, rng);
  assert.equal(shuffled[0].Id, 'c');
  assert.deepEqual(shuffled.map(s => s.Id).sort(), ['a', 'b', 'c', 'd', 'e']);
  assert.notDeepEqual(shuffled.map(s => s.Id), ['c', 'a', 'b', 'd', 'e']);
  assert.deepEqual(buildQueue(songs, 'c', false).map(s => s.Id), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(buildQueue(songs, 'zz', true, rng).length, 5);
});

test('up next wraps only under repeat all', () => {
  assert.deepEqual(upNext(songs, 3, 'off', 6).map(s => s.Id), ['e']);
  assert.deepEqual(upNext(songs, 3, 'one', 6).map(s => s.Id), ['e']);
  assert.deepEqual(upNext(songs, 3, 'all', 6).map(s => s.Id), ['e', 'a', 'b', 'c', 'd']);
  assert.deepEqual(upNext(songs, 0, 'all', 2).map(s => s.Id), ['b', 'c']);
  assert.deepEqual(upNext([], 0, 'all'), []);
});

test('urls', () => {
  assert.equal(streamUrl('https://h:8920', 'abc', 't k', false), 'https://h:8920/Audio/abc/stream?static=true&api_key=t%20k');
  assert.equal(streamUrl('https://h:8920', 'abc', 'tk', true), 'https://h:8920/Audio/abc/stream?audioCodec=aac&container=aac&api_key=tk');
  assert.equal(artUrl('https://h', { Id: 's', AlbumId: 'al' }), 'https://h/Items/al/Images/Primary?fillWidth=600&fillHeight=600&quality=90');
  assert.equal(artUrl('https://h', { Id: 's' }, 80), 'https://h/Items/s/Images/Primary?fillWidth=80&fillHeight=80&quality=90');
});
