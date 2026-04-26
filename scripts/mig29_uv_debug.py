"""
Diagnostic v2: rasterise each UV triangle so islands appear as solid
filled regions. Each mesh object gets a distinct colour.
"""
import bpy
import numpy as np

MIG_IN  = r"C:\devs\f35\public\mig-29.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-debug.glb"

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
# Start from white so unpainted areas are obvious
px = np.ones((TH, TW, 4), dtype=np.float32)

PALETTE = [
    [1.0, 0.15, 0.15],  # red
    [0.15, 0.85, 0.15], # green
    [0.25, 0.45, 1.0],  # blue
    [1.0,  0.8,  0.05], # yellow
    [0.9,  0.15, 0.9],  # magenta
    [0.05, 0.85, 0.85], # cyan
    [1.0,  0.45, 0.0],  # orange
    [0.55, 0.15, 1.0],  # purple
    [0.0,  0.6,  0.35], # teal
    [0.5,  0.5,  0.5],  # grey
]

def fill_triangle(px, p0, p1, p2, colour, TW, TH):
    """Fill UV triangle (pixel coords, y=0 top) with colour."""
    xs = [p0[0], p1[0], p2[0]]
    ys = [p0[1], p1[1], p2[1]]
    x0 = max(0, min(xs)); x1 = min(TW-1, max(xs))
    y0 = max(0, min(ys)); y1 = min(TH-1, max(ys))
    if x0 >= x1 or y0 >= y1: return

    # Vectorised barycentric test
    gx = np.arange(x0, x1+1, dtype=np.float32)
    gy = np.arange(y0, y1+1, dtype=np.float32)
    GX, GY = np.meshgrid(gx, gy)

    def sign(ax, ay, bx, by, cx, cy):
        return (ax-cx)*(by-cy) - (bx-cx)*(ay-cy)

    d1 = sign(GX, GY, p0[0], p0[1], p1[0], p1[1])
    d2 = sign(GX, GY, p1[0], p1[1], p2[0], p2[1])
    d3 = sign(GX, GY, p2[0], p2[1], p0[0], p0[1])

    has_neg = (d1 < 0) | (d2 < 0) | (d3 < 0)
    has_pos = (d1 > 0) | (d2 > 0) | (d3 > 0)
    inside  = ~(has_neg & has_pos)

    rows = (GY[inside] - y0).astype(int)
    cols = (GX[inside] - x0).astype(int)
    px[y0:y1+1, x0:x1+1][rows, cols] = [*colour, 1.0]

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
print(f"\n{'Obj':<12} {'colour'}")
print("-" * 35)

for idx, obj in enumerate(meshes):
    colour = PALETTE[idx % len(PALETTE)]
    mesh   = obj.data
    if not mesh.uv_layers: continue
    uv_layer = mesh.uv_layers.active.data
    total = 0

    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        if len(loops) < 3: continue
        # Fan-triangulate
        uv0 = uv_layer[loops[0]].uv
        p0  = (int(uv0[0]*TW), int((1-uv0[1])*TH))
        for i in range(1, len(loops)-1):
            uv1 = uv_layer[loops[i]].uv
            uv2 = uv_layer[loops[i+1]].uv
            p1  = (int(uv1[0]*TW), int((1-uv1[1])*TH))
            p2  = (int(uv2[0]*TW), int((1-uv2[1])*TH))
            fill_triangle(px, p0, p1, p2, colour, TW, TH)
            total += 1

    print(f"{obj.name:<12} rgb={[round(c,2) for c in colour]}  tris={total}")

# White crosses at known star positions
def cross(px, cx, cy, size=10):
    H, W = px.shape[:2]
    for d in range(-size, size+1):
        if 0 <= cy+d < H: px[cy+d, cx] = [1,1,1,1]
        if 0 <= cx+d < W: px[cy, cx+d] = [1,1,1,1]

sx = TW/1024; sy = TH/1024
for (x,y) in [(754,183),(78,568),(85,426),(542,426),(428,781),(871,781)]:
    cross(px, int(x*sx), int(y*sy))

print()

px_out  = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("airframe_debug", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', export_image_format='AUTO')
print(f"✓ {GLB_OUT}")
