"""
Bake reference dots onto the MiG-29 airframe texture at each decal target position.
Each dot is a distinct bright colour with a black border so it's easy to click in React.

UV axis notes (confirmed via flood-fill):
  tail_L island: x:677-816 (w=139), y:130-425 (h=295), cx_centre=746
    → CX (column/x) = fin HEIGHT axis (root→tip)
    → CY (row/y)    = chord direction (front→back of aircraft)
    → star at (754, 183) = fin exterior face
  tail_R island: x:2-140 (w=138), y:327-622 (h=295), cx_centre=71
    → star at (78, 568)  = fin exterior face

Stacking along CX (fin height):
  tail_L: eagle@705 → flag@754 → number@800  (root→tip)
"""
import bpy
import numpy as np

MIG_IN  = r"C:\devs\f35\public\mig-29.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-refpoints.glb"

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
sx = TW/1024; sy = TH/1024

MAGENTA = [1.0, 0.0, 1.0]   # all roundels same colour

# (cx, cy) in 1024-space, colour RGB, label
# CX = fin height axis; CY = chord (front/back)
# tail_L star at (754,183)  tail_R star at (78,568)
REFS = [
    # ── tail_L: stack along CX (fin height), CY fixed at 183 ──────────────────
    (800, 183, [1.0, 0.0, 0.0], "tail_L_number"),   # above star → toward tip
    (754, 183, [0.0, 0.8, 1.0], "tail_L_flag"),     # AT star
    (705, 183, [1.0, 0.5, 0.0], "tail_L_eagle"),    # below star → toward root

    # ── tail_R: exterior face, AT star ────────────────────────────────────────
    ( 78, 568, [0.0, 0.8, 1.0], "tail_R_flag"),

    # ── wing roundels (all magenta) ───────────────────────────────────────────
    ( 85, 426, MAGENTA, "wing_top_L_roundel"),
    (542, 426, MAGENTA, "wing_top_R_roundel"),

    # ── wing bottom eagle ─────────────────────────────────────────────────────
    (428, 781, [1.0, 0.5, 0.0], "wing_bot_L_eagle"),

    # ── fuselage exploration (guesses — adjust after seeing in React) ─────────
    (500, 530, [1.0, 1.0, 0.0],   "fus_roundel_51"),      # right of "51"
    (380, 280, [0.8, 0.8, 0.0],   "fus_iriaf_L"),         # below cockpit L
    (380, 680, [0.6, 0.6, 0.0],   "fus_iriaf_R"),         # below cockpit R
    (600, 500, [0.0, 1.0, 1.0],   "nose_persian_num"),    # near nose
]

R = 8  # dot radius in pixels

def dot(px, cx, cy, colour, r=R):
    H, W = px.shape[:2]
    Y, X = np.ogrid[:H, :W]
    d2 = (X-cx)**2 + (Y-cy)**2
    # black border
    px[(d2 <= (r+2)**2) & (d2 > r**2)] = [0, 0, 0, 1]
    # coloured fill
    px[d2 <= r**2] = [*colour, 1.0]

for (cx, cy, col, lbl) in REFS:
    px_x = int(cx * sx)
    px_y = int(cy * sy)
    dot(px, px_x, px_y, col)
    print(f"{lbl}: UV pixel ({px_x}, {px_y})")

px_out  = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("airframe_refpoints", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', export_image_format='AUTO')
print(f"\n✓ {GLB_OUT}")
