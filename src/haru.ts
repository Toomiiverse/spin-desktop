// Haru on the card is her portrait screen, the rig on her vertical monitor, copied verbatim from haru-desktop
// into haru/ by scripts/sync-haru.mjs. That component listens to haru-desktop's bridge (window.haru); every
// call is optional, so here a small stand-in bridge feeds it only what Spin knows: a mood, and where the
// pointer is. Her voice, captions, panels and terminal bursts stay quiet.
import type { Beat, EmotionName, LifeTick, SpeechClip } from '../haru/src/types';

type Listener<T> = (value: T) => void;
function channel<T>() {
  const listeners = new Set<Listener<T>>();
  return { on: (fn: Listener<T>) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, emit: (value: T) => listeners.forEach(fn => fn(value)) };
}
const emotion = channel<Beat>();
const cursor = channel<{ x: number; y: number }>();

// Just the members the portrait calls, typed as in haru-desktop's own bridge (its vite-env.d.ts).
type Off = () => void;
type Sub<T> = (callback: (value: T) => void) => Off;
type Panel = { id: number; title: string; body: string; image: string; seconds: number };
declare global {
  interface Window {
    haru?: {
      life: { onEmotion: Sub<Beat>; onTick: Sub<LifeTick> };
      companion: { onCursor: Sub<{ x: number; y: number }>; onThinking: Sub<boolean>; onPanel: Sub<Panel>; onTerminal: Sub<string>; onCoding: Sub<{ on: boolean; label: string }>; onSay: Sub<string | null> };
      voice: { onClip: Sub<SpeechClip>; onStop: (callback: () => void) => Off };
    };
  }
}
const silent = () => () => {};
window.haru = {
  life: { onEmotion: emotion.on, onTick: silent },
  companion: { onCursor: cursor.on, onThinking: silent, onPanel: silent, onTerminal: silent, onCoding: silent, onSay: silent },
  voice: { onClip: silent, onStop: silent },
};

// Her eyes follow the pointer across Spin's window. The portrait measures from the window's centre against a
// range sized for a whole monitor, so the offset is scaled up to give the same travel on a small card.
const REACH = 3;
addEventListener('pointermove', event => cursor.emit({ x: innerWidth / 2 + (event.clientX - innerWidth / 2) * REACH, y: innerHeight / 2 + (event.clientY - innerHeight / 2) * REACH }));

const beat = (name: EmotionName): Beat => ({ emotion: { emotion: name, confidence: 1, energy: 0.5, intent: 'listen', focus: 'user' } });
let settle: ReturnType<typeof setTimeout> | undefined;
let resting: EmotionName = 'neutral';
const feel = (name: EmotionName, ms?: number) => {
  clearTimeout(settle);
  emotion.emit(beat(name));
  if (ms) settle = setTimeout(() => emotion.emit(beat(resting)), ms);
};

export const haru = {
  playing: (on: boolean) => { resting = on ? 'happy' : 'neutral'; feel(resting); },
  changed: () => feel('curious', 2500),
  ended: () => { resting = 'sleepy'; feel('sleepy'); },
  celebrate: () => feel('affectionate', 3500),
  tap: () => feel('surprised', 1200),
};
