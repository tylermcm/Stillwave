"""Generate honest 50% overlays and amplified pixel differences for TV screens."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops, ImageEnhance

parser = argparse.ArgumentParser()
parser.add_argument('reference')
parser.add_argument('candidate')
parser.add_argument('output')
args = parser.parse_args()
reference = Image.open(args.reference).convert('RGB')
candidate = Image.open(args.candidate).convert('RGB')
if reference.size != candidate.size:
    raise SystemExit(f'Size mismatch: {reference.size} versus {candidate.size}')
prefix = Path(args.output)
prefix.parent.mkdir(parents=True, exist_ok=True)
Image.blend(reference, candidate, .5).save(str(prefix) + '-overlay.png')
diff = ImageChops.difference(reference, candidate)
ImageEnhance.Brightness(diff).enhance(5).save(str(prefix) + '-difference.png')
delta = np.abs(np.asarray(reference, dtype=np.int16) - np.asarray(candidate, dtype=np.int16))
regions = {'full': (0, 0, 1920, 1080), 'top': (0, 0, 1920, 80), 'details': (0, 80, 1920, 380), 'grid': (0, 380, 1920, 1024), 'footer': (0, 1024, 1920, 1080)}
result = {'reference': args.reference, 'candidate': args.candidate, 'size': list(reference.size), 'regions': {}}
for name, (x0, y0, x1, y1) in regions.items():
    values = delta[y0:y1, x0:x1]
    result['regions'][name] = {'mean_absolute_channel_error': float(values.mean()), 'pixels_over_16_percent': float((values.max(axis=2) > 16).mean() * 100), 'identical_pixels_percent': float((values.max(axis=2) == 0).mean() * 100)}
Path(str(prefix) + '-metrics.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
