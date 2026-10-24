// Haru on the deck: the same SVG renderer and artwork as haru-desktop, copied into public/ (lib/haru-avatar.js
// and emotions/*.svg; re-copy them when her artwork changes). The bundle mounts into #stage, fetches her faces
// from /emotions/, and leaves window.haruAvatar behind for us to nudge.
type Avatar = { express(emotion: string): void; notify(): void; attend(why: string, ms?: number): void; tap(): void; stop(): void };
declare global { interface Window { haruAvatar?: Avatar; haruNative?: { mouth: number; peek: boolean; speakingUntil?: number } } }

let loading: Promise<void> | undefined;
/** Loads her once #stage exists; calls after that just reuse her. */
export function mountHaru(): Promise<void> {
  if (loading) return loading;
  // With haruNative present the frame fills #stage (not a phone-sized strip) and her mouth stays shut.
  window.haruNative = { mouth: 0, peek: false };
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/lib/haru-avatar.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Haru did not load'));
    document.head.appendChild(script);
  });
  return loading;
}

const her = () => window.haruAvatar;
export const haru = {
  playing: (on: boolean) => her()?.express(on ? 'playful' : 'content'),
  changed: () => her()?.notify(),
  ended: () => her()?.express('sleepy'),
  celebrate: () => { her()?.express('excited'); her()?.attend('talking', 2500); },
  tap: () => her()?.tap(),
};
