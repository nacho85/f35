"""
Paint a colour grid over the MiG-29 airframe texture so we can see in React
which UV region maps to which part of the fuselage.
Grid: 8x8 cells of 128px each, each cell gets a unique hue label.
"""
import bpy
import numpy as np

MIG_IN  = r"C:\devs\f35\public\mig-29.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-uvgrid.glb"

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

COLS = 8
ROWS = 8
cw = TW // COLS
ch = TH // ROWS

# Distinct colours for each column (x), brightened by row
COL_HUES = [
    [1.0, 0.0, 0.0],  # 0 red
    [1.0, 0.5, 0.0],  # 1 orange
    [1.0, 1.0, 0.0],  # 2 yellow
    [0.0, 1.0, 0.0],  # 3 green
    [0.0, 1.0, 1.0],  # 4 cyan
    [0.0, 0.0, 1.0],  # 5 blue
    [0.8, 0.0, 1.0],  # 6 violet
    [1.0, 0.0, 0.8],  # 7 pink
]

for row in range(ROWS):
    for col in range(COLS):
        x0, x1 = col*cw, (col+1)*cw
        y0, y1 = row*ch, (row+1)*ch
        base = COL_HUES[col]
        # Vary brightness by row: top rows darker, bottom rows lighter
        bright = 0.4 + 0.6 * (row / (ROWS - 1))
        colour = [c * bright for c in base]

        # Paint solid fill
        px[y0:y1, x0:x1, 0] = colour[0]
        px[y0:y1, x0:x1, 1] = colour[1]
        px[y0:y1, x0:x1, 2] = colour[2]
        px[y0:y1, x0:x1, 3] = 1.0

        # Draw grid lines (2px black border)
        px[y0:y0+2, x0:x1] = [0,0,0,1]
        px[y1-2:y1, x0:x1] = [0,0,0,1]
        px[y0:y1, x0:x0+2] = [0,0,0,1]
        px[y0:y1, x1-2:x1] = [0,0,0,1]

        # Label: dot in centre of each cell (white)
        cx, cy = (x0+x1)//2, (y0+y1)//2
        Y, X = np.ogrid[:TH, :TW]
        d2 = (X-cx)**2 + (Y-cy)**2
        px[d2 <= 6**2] = [1,1,1,1]

        print(f"cell ({col},{row}) px x:{x0}-{x1} y:{y0}-{y1}  colour={[round(c,2) for c in colour]}")

px_out  = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("uvgrid", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', export_image_format='AUTO')
print(f"\n✓ {GLB_OUT}")
