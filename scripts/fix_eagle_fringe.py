"""
Fix alpha fringe on iranian_iriaf_symbol.png using Pillow.
Dilates RGB of opaque pixels into transparent neighbours so the GPU
bilinear filter blends red->transparent instead of white->transparent.
"""
from PIL import Image
import numpy as np

IMG_PATH = r"C:\devs\f35\public\iranian_iriaf_symbol.png"
DILATE   = 16

img = Image.open(IMG_PATH).convert("RGBA")
data = np.array(img, dtype=np.float32) / 255.0
H, W = data.shape[:2]

rgb    = data[:, :, :3].copy()
alpha  = data[:, :,  3]
opaque = alpha > 0.05

for _ in range(DILATE):
    new_rgb    = rgb.copy()
    new_opaque = opaque.copy()
    for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
        ny = np.clip(np.arange(H) + dy, 0, H-1)
        nx = np.clip(np.arange(W) + dx, 0, W-1)
        neighbour_rgb    = rgb[np.ix_(ny, nx)]
        neighbour_opaque = opaque[np.ix_(ny, nx)]
        mask = (~opaque) & neighbour_opaque
        new_rgb[mask]    = neighbour_rgb[mask]
        new_opaque[mask] = True
    rgb    = new_rgb
    opaque = new_opaque

out = (np.dstack([rgb, alpha[..., None]]) * 255).clip(0, 255).astype(np.uint8)
Image.fromarray(out, "RGBA").save(IMG_PATH)
print(f"OK Saved {IMG_PATH}  ({W}x{H}, dilated {DILATE}px)")
