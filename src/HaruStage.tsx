import { PortraitWindow } from '../haru/src/PortraitWindow';
import { VIEWS, type View } from '../haru/src/portraitRig';
import withHeadphones from './assets/haru-headphones.webp';
import { haru } from './haru';

// Her portrait rig in its bust view, with the picture swapped for her redrawn wearing headphones
// (scripts/haru-headphones: Flux 2 Klein from her bust and the headphone sheet, aligned by her eyes, her face kept
// from the original so the rig's eye, mouth and blush overlays land where they always did).
// Cropped like the user's reference: half her face, nose to the cup over her left ear. Only the viewBox changes;
// the frame is where her picture is drawn and stays the whole picture.
// Ends at the picture's right edge: the rig zooms its frame 5% (OVERSCAN), which still leaves the cup whole.
export const CROP: [number, number, number, number] = [560, 210, 880, 1222];
const VIEW: View = { ...VIEWS.bust, image: withHeadphones, viewBox: CROP };

/** Haru on the card, wearing headphones. */
export function HaruStage() {
  return <div className="stage" onClick={haru.tap} title="Haru"><PortraitWindow view={VIEW} /></div>;
}
