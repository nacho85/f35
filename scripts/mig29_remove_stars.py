"""
Remove Russian stars from the MiG-29 airframe texture via inpainting.
No markings added — clean base model only.
"""
import bpy
import numpy as np

MIG_IN  = r"C:\devs\f35\public\mig-29.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-clean.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=MIG_IN)

tex_node = None
for o in bpy.context.scene.objects:
    if o.type != "MESH": continue
    for mat in o.data.materials:
        if not mat or not mat.use_nodes: continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and "airframe" in mat.name.lower():
                tex_node = node; break
        if tex_node: break
    if tex_node: break

orig = tex_node.image
TW, TH = orig.size
px = np.array(orig.pixels[:], dtype=np.float32).reshape(TH, TW, 4)
px = np.flipud(px)
sx = TW / 1024
sy = TH / 1024
print(f"Airframe texture: {TW}x{TH}")

# Star UV positions in 1024-space (confirmed via flood-fill / refpoints script)
STARS = [
    (754, 183),   # tail fin L
    ( 78, 568),   # tail fin R
    ( 85, 426),   # wing top L
    (542, 426),   # wing top R
    (428, 781),   # wing bot L
    (871, 781),   # wing bot R
]

def ring_inpaint(px, cx, cy, r):
    """Fill circle at (cx,cy) radius r with the average colour of the surrounding ring."""
    H, W = px.shape[:2]
    Y, X = np.ogrid[:H, :W]
    d2 = (X - cx) ** 2 + (Y - cy) ** 2
    ring = (d2 >= (r * 1.5) ** 2) & (d2 <= (r * 2.4) ** 2)
    pts  = px[ring]
    # prefer non-red pixels for the sample (avoids picking up star colour)
    not_red = pts[:, 0] - np.maximum(pts[:, 1], pts[:, 2]) < 0.25
    src = pts[not_red] if not_red.sum() > 0 else pts
    px[d2 <= r ** 2] = src.mean(axis=0)

r = int(16 * min(sx, sy))
for (x, y) in STARS:
    cx, cy = int(x * sx), int(y * sy)
    ring_inpaint(px, cx, cy, r)
    print(f"Inpainted star at UV ({x},{y}) → pixel ({cx},{cy})")

px_out  = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("airframe_clean", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_image_format="AUTO")
print(f"\n✓ {GLB_OUT}")
