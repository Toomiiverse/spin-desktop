"""Aligns a redraw onto her original bust by her eyes and keeps the original's face, so the rig's eye, mouth and
blush overlays still land where they were drawn.  python blend.py <original> <redraw> <out.png> [preview.png]"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

orig = Image.open(sys.argv[1]).convert('RGB')
red = Image.open(sys.argv[2]).convert('RGB').resize(orig.size, Image.LANCZOS)

# A redraw that borrowed the wearing reference's white backdrop gets hers back: near-white reached from the top
# corners (the line art walls off the silver highlights) becomes her picture's dark grey.
backdrop = orig.getpixel((1420, 40))
for seed in [(5, 5), (red.width - 6, 5)]:
    if sum(red.getpixel(seed)) > 3 * 225: ImageDraw.floodfill(red, seed, backdrop, thresh=40)
# Greyscale like her (her irises come from the original below), with the grey matched to hers on bare skin.
grey = np.asarray(red.convert('L')).astype(float)
skin = [(640, 1120, 760, 1200), (380, 1160, 470, 1240), (990, 1080, 1090, 1160)]  # cheeks and below the nose
ref_l = np.asarray(orig.convert('L')).astype(float)
src = np.concatenate([grey[y0:y1, x0:x1].ravel() for x0, y0, x1, y1 in skin]); dst = np.concatenate([ref_l[y0:y1, x0:x1].ravel() for x0, y0, x1, y1 in skin])
gain = dst.std() / max(src.std(), 1e-3) if src.std() > 4 else 1.0
grey = np.clip((grey - src.mean()) * gain + dst.mean(), 0, 255) if gain < 3 else np.clip(grey - src.mean() + dst.mean(), 0, 255)
print(f'skin grey {src.mean():.0f} -> {dst.mean():.0f}')
red = Image.fromarray(grey.astype(np.uint8)).convert('RGB')
EYES = np.array([(500, 1012), (985, 932)], float)  # iris centres in portraitRig.ts's bust view

def eyes(im):
    """Centres of the two magenta blobs: the only saturated pink in the picture is her irises."""
    a = np.asarray(im).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mask = (r - g > 60) & (b - g > 40)
    ys, xs = np.nonzero(mask); split = np.median(xs)
    return np.array([(xs[xs < split].mean(), ys[xs < split].mean()), (xs[xs >= split].mean(), ys[xs >= split].mean())])

def similarity(src, dst):
    """Scale, rotation and shift taking the two src points onto the two dst points (as a complex multiply)."""
    s = complex(*(src[1] - src[0])); d = complex(*(dst[1] - dst[0]))
    k = d / s; t = complex(*dst[0]) - k * complex(*src[0])
    return k, t

found = eyes(Image.open(sys.argv[2]).convert('RGB').resize(orig.size, Image.LANCZOS)); seen = eyes(orig)
print('original eyes measured', seen.round(), 'rig says', EYES)
print('redraw eyes', found.round())
k, t = similarity(found, seen)
print(f'scale {abs(k):.3f} rotation {np.degrees(np.angle(k)):.2f} deg shift {t.real:.0f},{t.imag:.0f}')
# PIL's affine maps output pixels back to input ones: x_in = inverse(k) * (x_out - t).
inv = 1 / k
a, b = inv.real, -inv.imag; c = -(inv * t).real
d, e = inv.imag, inv.real; f = -(inv * t).imag
aligned = red.transform(orig.size, Image.AFFINE, (a, b, c, d, e, f), Image.BICUBIC)

# Only what the rig draws over stays the original's: the two eyes (its lids and irises are fitted to them) and the
# mouth (its sprite covers the drawn one). Everything else, hair over the cups included, is the redraw at full
# strength; a wide feathered face patch here ghosted the original's hair through the cups.
keep = Image.new('L', orig.size, 0); g = ImageDraw.Draw(keep)
g.ellipse((290, 950, 630, 1100), fill=255)   # her right eye, the rig's 'open' polygon with a margin
g.ellipse((870, 870, 1135, 1020), fill=255)  # her left eye
g.ellipse((660, 1250, 900, 1370), fill=255)  # her mouth
keep = keep.filter(ImageFilter.GaussianBlur(8))
# Where the shift pulled in nothing from the redraw (its edges), the original shows through too.
covered = Image.new('L', red.size, 255).transform(orig.size, Image.AFFINE, (a, b, c, d, e, f), Image.NEAREST).filter(ImageFilter.MinFilter(9))
keep = Image.fromarray(np.maximum(np.asarray(keep), 255 - np.asarray(covered)))
out = Image.composite(orig, aligned, keep)
out.save(sys.argv[3], quality=95)
if len(sys.argv) > 4:
    side = Image.new('RGB', (1080, 960)); side.paste(orig.resize((540, 960)), (0, 0)); side.paste(out.resize((540, 960)), (540, 0)); side.save(sys.argv[4])
