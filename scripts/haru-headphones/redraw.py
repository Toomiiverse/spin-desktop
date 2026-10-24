"""Redraws Haru's bust wearing the headphones with Flux 2 Klein (ComfyUI on 8188), using her picture and the
headphone sheet as reference images, and optionally a picture of her wearing them for how they sit.
python redraw.py <bust> <headphones> <out-prefix> [seed ...] [--wearing <reference>]"""
import json, sys, time, uuid, urllib.request
from pathlib import Path

API = 'http://127.0.0.1:8188'
args = sys.argv[1:]
wearing = args[args.index('--wearing') + 1] if '--wearing' in args else None
if wearing: del args[args.index('--wearing'):args.index('--wearing') + 2]
bust, phones, out = args[0], args[1], args[2]
seeds = [int(s) for s in args[3:]] or [11]
W, H = 1088, 1936  # her picture's 9:16, about 2 MP, multiples of 16

PROMPT_PLAIN = ("Edit the first image: the same girl now wears the silver over-ear headphones from the second image. "
          "The headband rests on top of her head over her hair, the ear cups sit over her ears on both sides of her "
          "head, and strands of her hair fall over the edges of the cups. Keep everything else exactly the same: her "
          "face, eyes, expression, hair, hoodie, pose, framing and the flat greyscale anime line-art style with "
          "magenta eyes. The headphones are drawn in the same greyscale style with clean dark outlines.")

# With the wearing reference: her side locks hang in FRONT of the cups and hide their inner half, as in it.
PROMPT_WEARING = ("Edit the first image: the same girl now wears the silver over-ear headphones from the second image, "
          "worn exactly as in the third image. The headband arcs over the top of her head above her hair. The ear cups "
          "sit behind her hair at the sides of her head: the long locks of hair that frame her face hang in front of "
          "each cup and cover its inner half and its cushion, so only the outer shell of each cup shows, sticking out "
          "past the hair. Her hair is solid and opaque over the cups. Keep everything else exactly the same as the "
          "first image: her face, eyes, expression, hair shape, hoodie, pose, framing, and the flat greyscale anime "
          "line-art style with magenta eyes; ignore the third image's colours. The headphones are greyscale with clean "
          "dark outlines.")
PROMPT = PROMPT_WEARING if wearing else PROMPT_PLAIN

def upload(path):
    boundary = uuid.uuid4().hex
    data = Path(path).read_bytes()
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{Path(path).name}"\r\n'
            f'Content-Type: image/png\r\n\r\n').encode() + data + f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request(f'{API}/upload/image', body, {'Content-Type': f'multipart/form-data; boundary={boundary}'})
    return json.load(urllib.request.urlopen(req))['name']

def graph(seed, bust_name, phones_name, wearing_name=None):
    g = {
        'unet': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'flux-2-klein-4b.safetensors', 'weight_dtype': 'default'}},
        'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'qwen_3_4b.safetensors', 'type': 'flux2'}},
        'vae': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'flux2-vae.safetensors'}},
        'pos': {'class_type': 'CLIPTextEncode', 'inputs': {'text': PROMPT, 'clip': ['clip', 0]}},
        'img1': {'class_type': 'LoadImage', 'inputs': {'image': bust_name}},
        'img1s': {'class_type': 'ImageScale', 'inputs': {'image': ['img1', 0], 'upscale_method': 'lanczos', 'width': W, 'height': H, 'crop': 'disabled'}},
        'lat1': {'class_type': 'VAEEncode', 'inputs': {'pixels': ['img1s', 0], 'vae': ['vae', 0]}},
        'ref1': {'class_type': 'ReferenceLatent', 'inputs': {'conditioning': ['pos', 0], 'latent': ['lat1', 0]}},
        'img2': {'class_type': 'LoadImage', 'inputs': {'image': phones_name}},
        'img2s': {'class_type': 'ImageScaleToTotalPixels', 'inputs': {'image': ['img2', 0], 'upscale_method': 'lanczos', 'megapixels': 1.0, 'resolution_steps': 16}},
        'lat2': {'class_type': 'VAEEncode', 'inputs': {'pixels': ['img2s', 0], 'vae': ['vae', 0]}},
        'ref2': {'class_type': 'ReferenceLatent', 'inputs': {'conditioning': ['ref1', 0], 'latent': ['lat2', 0]}},
        'neg': {'class_type': 'ConditioningZeroOut', 'inputs': {'conditioning': ['pos', 0]}},
        'empty': {'class_type': 'EmptyFlux2LatentImage', 'inputs': {'width': W, 'height': H, 'batch_size': 1}},
        'ks': {'class_type': 'KSampler', 'inputs': {'model': ['unet', 0], 'positive': ['ref3' if wearing_name else 'ref2', 0], 'negative': ['neg', 0], 'latent_image': ['empty', 0],
                                                    'seed': seed, 'steps': 4, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'simple', 'denoise': 1.0}},
        'dec': {'class_type': 'VAEDecode', 'inputs': {'samples': ['ks', 0], 'vae': ['vae', 0]}},
        'save': {'class_type': 'SaveImage', 'inputs': {'images': ['dec', 0], 'filename_prefix': 'haru-headphones'}},
    }
    if wearing_name:
        g['img3'] = {'class_type': 'LoadImage', 'inputs': {'image': wearing_name}}
        g['img3s'] = {'class_type': 'ImageScaleToTotalPixels', 'inputs': {'image': ['img3', 0], 'upscale_method': 'lanczos', 'megapixels': 1.0, 'resolution_steps': 16}}
        g['lat3'] = {'class_type': 'VAEEncode', 'inputs': {'pixels': ['img3s', 0], 'vae': ['vae', 0]}}
        g['ref3'] = {'class_type': 'ReferenceLatent', 'inputs': {'conditioning': ['ref2', 0], 'latent': ['lat3', 0]}}
    return g

bust_name, phones_name = upload(bust), upload(phones)
wearing_name = upload(wearing) if wearing else None
for seed in seeds:
    req = urllib.request.Request(f'{API}/prompt', json.dumps({'prompt': graph(seed, bust_name, phones_name, wearing_name)}).encode(), {'Content-Type': 'application/json'})
    pid = json.load(urllib.request.urlopen(req))['prompt_id']
    start = time.time()
    while True:
        time.sleep(1.5)
        hist = json.load(urllib.request.urlopen(f'{API}/history/{pid}'))
        if pid in hist:
            status = hist[pid].get('status', {})
            if status.get('status_str') == 'error': sys.exit(f'seed {seed} failed: {json.dumps(status)[:800]}')
            files = hist[pid]['outputs']['save']['images']
            break
        if time.time() - start > 600: sys.exit('timed out')
    f = files[0]
    data = urllib.request.urlopen(f"{API}/view?filename={f['filename']}&subfolder={f['subfolder']}&type={f['type']}").read()
    Path(f'{out}-{seed}.png').write_bytes(data)
    print(f'seed {seed}: {out}-{seed}.png in {time.time() - start:.0f}s', flush=True)
