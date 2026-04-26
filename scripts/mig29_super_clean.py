"""
Remove Russian stars from ALL textures in mig-29.glb (albedo, metallic, normal).
Output: mig-29-super-clean.glb
"""
import bpy
import numpy as np

MIG_IN  = r"C:\devs\f35\public\mig-29.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-super-clean.glb"

STARS = [
    (754, 183), (78, 568), (85, 426),
    (542, 426), (428, 781), (871, 781),
]

def ring_inpaint(px, cx, cy, r):
    H, W = px.shape[:2]
    Y, X = np.ogrid[:H, :W]
    d2 = (X-cx)**2 + (Y-cy)**2
    ring = (d2 >= (r*1.5)**2) & (d2 <= (r*2.4)**2)
    pts  = px[ring]
    not_red = pts[:,0] - np.maximum(pts[:,1], pts[:,2]) < 0.25
    src = pts[not_red] if not_red.sum() > 0 else pts
    px[d2 <= r**2] = src.mean(axis=0)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=MIG_IN)

for img in bpy.data.images:
    if not img.size[0]: continue
    TW, TH = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(TH, TW, 4)
    px = np.flipud(px)
    sx, sy = TW/1024, TH/1024
    r = int(16 * min(sx, sy))
    for (x, y) in STARS:
        ring_inpaint(px, int(x*sx), int(y*sy), r)
    px_out = np.flipud(px).flatten().tolist()
    img.pixels = px_out
    img.pack()
    print(f"Inpainted {img.name} ({TW}x{TH})")

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_image_format="AUTO")
print(f"\nOK {GLB_OUT}")
