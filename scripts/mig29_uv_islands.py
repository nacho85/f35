"""
Diagnostic v3: flood-fill UV islands from known star positions.
Paints each island a distinct colour and reports exact bounding box + size.
This tells us exactly how much space we have on each fin/wing/fuselage.
"""
import bpy
import numpy as np
from collections import deque

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
sx = TW/1024; sy = TH/1024

# ── Step 1: rasterise ALL UV triangles of Object_4 into a binary mask ─────────
mask = np.zeros((TH, TW), dtype=np.uint8)  # 1 = belongs to airframe UV

obj4 = None
for o in bpy.context.scene.objects:
    if o.type == "MESH" and o.name == "Object_4":
        obj4 = o; break
if obj4 is None:
    # Fallback: use the mesh with the most triangles
    best = max((o for o in bpy.context.scene.objects if o.type=="MESH"),
               key=lambda o: len(o.data.polygons))
    obj4 = best
    print(f"Object_4 not found, using {obj4.name}")

mesh     = obj4.data
uv_layer = mesh.uv_layers.active.data

def fill_tri_mask(mask, p0, p1, p2, TW, TH):
    xs = [p0[0], p1[0], p2[0]]
    ys = [p0[1], p1[1], p2[1]]
    x0 = max(0, min(xs)); x1 = min(TW-1, max(xs))
    y0 = max(0, min(ys)); y1 = min(TH-1, max(ys))
    if x0 >= x1 or y0 >= y1: return
    gx = np.arange(x0, x1+1, dtype=np.float32)
    gy = np.arange(y0, y1+1, dtype=np.float32)
    GX, GY = np.meshgrid(gx, gy)
    def sign(ax, ay, bx, by, cx, cy):
        return (ax-cx)*(by-cy) - (bx-cx)*(ay-cy)
    d1 = sign(GX, GY, p0[0], p0[1], p1[0], p1[1])
    d2 = sign(GX, GY, p1[0], p1[1], p2[0], p2[1])
    d3 = sign(GX, GY, p2[0], p2[1], p0[0], p0[1])
    has_neg = (d1<0)|(d2<0)|(d3<0)
    has_pos = (d1>0)|(d2>0)|(d3>0)
    inside  = ~(has_neg & has_pos)
    rows = (GY[inside]-y0).astype(int)
    cols = (GX[inside]-x0).astype(int)
    mask[y0:y1+1, x0:x1+1][rows, cols] = 1

print("Rasterising UV triangles...")
for poly in mesh.polygons:
    loops = list(poly.loop_indices)
    uv0 = uv_layer[loops[0]].uv
    p0  = (int(uv0[0]*TW), int((1-uv0[1])*TH))
    for i in range(1, len(loops)-1):
        uv1 = uv_layer[loops[i]].uv
        uv2 = uv_layer[loops[i+1]].uv
        p1  = (int(uv1[0]*TW), int((1-uv1[1])*TH))
        p2  = (int(uv2[0]*TW), int((1-uv2[1])*TH))
        fill_tri_mask(mask, p0, p1, p2, TW, TH)

print(f"Mask coverage: {mask.sum()} / {TW*TH} pixels")

# ── Step 2: flood-fill from each star position ─────────────────────────────────
# Seed positions (1024-space, y=0 top in flipped convention)
seeds = {
    "tail_L":      (754, 183),
    "tail_R":      (78,  568),
    "wing_top_L":  (85,  426),
    "wing_top_R":  (542, 426),
    "wing_bot_L":  (428, 781),
    "wing_bot_R":  (871, 781),
}

PALETTE = {
    "tail_L":      [1.0,  0.3,  0.3],   # red
    "tail_R":      [0.3,  0.3,  1.0],   # blue
    "wing_top_L":  [0.2,  0.85, 0.2],   # green
    "wing_top_R":  [1.0,  0.85, 0.1],   # yellow
    "wing_bot_L":  [0.9,  0.2,  0.9],   # magenta
    "wing_bot_R":  [0.1,  0.9,  0.9],   # cyan
}

# visited array (0=unvisited, 1=mask-but-not-seed, 2+=labelled)
visited = np.zeros((TH, TW), dtype=np.int32)

# Start from white background
px = np.ones((TH, TW, 4), dtype=np.float32)
# Grey out the UV mesh area
px[mask == 1] = [0.55, 0.55, 0.55, 1.0]

print(f"\n{'Island':<14} {'x_min':>6} {'x_max':>6} {'y_min':>6} {'y_max':>6} {'w':>5} {'h':>5}  (1024-space, y=0=top)")
print("-"*70)

for name, (sx_, sy_) in seeds.items():
    cx = int(sx_ * sx);  cy = int(sy_ * sy)
    if not (0 <= cx < TW and 0 <= cy < TH):
        print(f"{name:<14}  seed out of bounds ({cx},{cy})")
        continue
    if mask[cy, cx] == 0:
        # Snap to nearest mask pixel within 20px
        found = False
        for r in range(1, 20):
            for dy in range(-r, r+1):
                for dx in range(-r, r+1):
                    nx, ny = cx+dx, cy+dy
                    if 0<=nx<TW and 0<=ny<TH and mask[ny,nx]==1 and visited[ny,nx]==0:
                        cx, cy = nx, ny; found=True; break
                if found: break
            if found: break
        if not found:
            print(f"{name:<14}  no mask pixel near seed"); continue

    colour = PALETTE[name]
    q = deque([(cx, cy)])
    pixels = []
    visited[cy, cx] = 1

    while q:
        x, y = q.popleft()
        pixels.append((x, y))
        px[y, x] = [*colour, 1.0]
        for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
            nx, ny = x+dx, y+dy
            if 0<=nx<TW and 0<=ny<TH and mask[ny,nx]==1 and visited[ny,nx]==0:
                visited[ny, nx] = 1
                q.append((nx, ny))

    if not pixels: continue
    xs = [p[0] for p in pixels]
    ys = [p[1] for p in pixels]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    # Convert back to 1024-space
    s = 1024/TW
    print(f"{name:<14} {int(x0*s):>6} {int(x1*s):>6} {int(y0*s):>6} {int(y1*s):>6} "
          f"{int((x1-x0)*s):>5} {int((y1-y0)*s):>5}  n={len(pixels)}")

    # Draw bounding box outline in white
    for x in range(x0, x1+1):
        for by in [y0, y1]:
            if 0<=x<TW and 0<=by<TH: px[by, x] = [1,1,1,1]
    for y in range(y0, y1+1):
        for bx in [x0, x1]:
            if 0<=bx<TW and 0<=y<TH: px[y, bx] = [1,1,1,1]

# Mark seeds with black dot
for name, (sx_, sy_) in seeds.items():
    cx = int(sx_*sx); cy = int(sy_*sy)
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            nx, ny = cx+dx, cy+dy
            if 0<=nx<TW and 0<=ny<TH:
                px[ny, nx] = [0, 0, 0, 1.0]

print()

px_out  = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("airframe_debug", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', export_image_format='AUTO')
print(f"✓ {GLB_OUT}")
