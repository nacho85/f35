"""
Normalize borders of iranian_iriaf_symbol.png:
- Crop to the bounding box of opaque pixels
- Add a uniform transparent margin of MARGIN px on all sides
- Save back in place
"""
import bpy
import numpy as np

IMG_PATH = r"C:\devs\f35\public\iranian_iriaf_symbol.png"
MARGIN   = 8   # transparent padding in pixels

img = bpy.data.images.load(IMG_PATH)
img.pack()
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
px = np.flipud(px)  # y=0 at top

alpha = px[:, :, 3]

# Bounding box of opaque pixels (alpha > 0.05)
rows = np.any(alpha > 0.05, axis=1)
cols = np.any(alpha > 0.05, axis=0)
rmin, rmax = np.where(rows)[0][[0, -1]]
cmin, cmax = np.where(cols)[0][[0, -1]]
print(f"Opaque bbox: rows {rmin}-{rmax}, cols {cmin}-{cmax}")

cropped = px[rmin:rmax+1, cmin:cmax+1]
ch, cw = cropped.shape[:2]
print(f"Cropped size: {cw}x{ch}")

# New canvas: square, centred
side = max(ch, cw) + 2 * MARGIN
out  = np.zeros((side, side, 4), dtype=np.float32)
y0   = (side - ch) // 2
x0   = (side - cw) // 2
out[y0:y0+ch, x0:x0+cw] = cropped
nh = nw = side
print(f"Output size: {nw}x{nh}")

# Save
px_out = np.flipud(out).flatten().tolist()
new_img = bpy.data.images.new("eagle_normalized", nw, nh, alpha=True)
new_img.pixels = px_out
new_img.filepath_raw = IMG_PATH
new_img.file_format = "PNG"
new_img.save()
print(f"✓ Saved {IMG_PATH}")
