"""
MiG-29 Iran – v9
Uses individual pre-cut PNG files — no more decal sheet cropping.

UV layout (flood-fill confirmed):
  tail_L  x:677-816 (w=139)  y:130-425 (h=295)  cx=746
          HIGH cy = TIP (top of fin)  /  LOW cy = ROOT
  tail_R  x:  2-140 (w=138)  y:327-622 (h=295)  cx= 71
          LOW  cy = TIP (top of fin)  /  HIGH cy = ROOT

Stack top→bottom on fin: number → flag → eagle (left only)
"""
import bpy
import numpy as np

MIG_IN   = r"C:\devs\f35\public\mig-29.glb"
GLB_OUT  = r"C:\devs\f35\public\mig-29-iran.glb"

IMG = {
    "flag":    r"C:\devs\f35\public\iranian_flag.png",
    "roundel": r"C:\devs\f35\public\iranian_roundel.png",
    "number":  r"C:\devs\f35\public\iranian_number.png",
    "pnumber": r"C:\devs\f35\public\iranian_persian_number.png",
    "iriaf":   r"C:\devs\f35\public\iranian_iriaf.png",
    "eagle":   r"C:\devs\f35\public\iranian_iriaf_symbol.png",
}

# ── scene reset ───────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)

# ── helpers ───────────────────────────────────────────────────────────────────
_cache = {}
def load_img(key):
    if key in _cache: return _cache[key]
    img = bpy.data.images.load(IMG[key]); img.pack()
    W, H = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
    px = np.flipud(px)   # y=0 at top
    _cache[key] = (px, W, H)
    print(f"  {key}: {W}x{H}")
    return _cache[key]

def resize_bilinear(src, dh, dw):
    sh, sw = src.shape[:2]
    ys = np.linspace(0, sh-1, dh)
    xs = np.linspace(0, sw-1, dw)
    y0 = np.floor(ys).astype(int).clip(0, sh-2)
    y1 = (y0 + 1).clip(0, sh-1)
    x0 = np.floor(xs).astype(int).clip(0, sw-2)
    x1 = (x0 + 1).clip(0, sw-1)
    wy = (ys - y0)[:, None, None]
    wx = (xs - x0)[None, :, None]
    out = (src[y0][:, x0] * (1-wy)*(1-wx)
         + src[y0][:, x1] * (1-wy)*wx
         + src[y1][:, x0] * wy*(1-wx)
         + src[y1][:, x1] * wy*wx)
    return np.clip(out, 0, 1).astype(np.float32)

def stamp_img(dst, key, cx, cy, target_w, flip_h=False, flip_v=False):
    """
    Stamp image (by key) centred at (cx,cy).
    target_w  – width in dst pixels; height is auto from aspect ratio.
    flip_h / flip_v – mirror the source image.
    """
    src, IW, IH = load_img(key)
    dw = max(1, int(target_w))
    dh = max(1, int(round(target_w * IH / IW)))
    scaled = resize_bilinear(src, dh, dw)
    if flip_h: scaled = scaled[:, ::-1, :]
    if flip_v: scaled = scaled[::-1, :, :]
    H, W = dst.shape[:2]
    y0 = cy - dh // 2;  x0 = cx - dw // 2
    for dy in range(dh):
        for dx in range(dw):
            tx, ty = x0+dx, y0+dy
            if not (0 <= tx < W and 0 <= ty < H): continue
            r, g, b, a = (float(scaled[dy, dx, c]) for c in range(4))
            if a < 0.05: continue
            bg = dst[ty, tx]
            dst[ty, tx, 0] = r*a + bg[0]*(1-a)
            dst[ty, tx, 1] = g*a + bg[1]*(1-a)
            dst[ty, tx, 2] = b*a + bg[2]*(1-a)
            dst[ty, tx, 3] = 1.0

# ── load MiG-29 ───────────────────────────────────────────────────────────────
print("Loading images:")
for k in IMG: load_img(k)

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
sx = TW/1024;  sy = TH/1024
print(f"Airframe texture: {TW}x{TH}")

# ── inpainting / roundels ─────────────────────────────────────────────────────
def ring_inpaint(px, cx, cy, r):
    H, W = px.shape[:2]
    Y, X = np.ogrid[:H, :W]
    d2 = (X-cx)**2 + (Y-cy)**2
    ring = (d2 >= (r*1.5)**2) & (d2 <= (r*2.4)**2)
    pts  = px[ring]
    not_red = pts[:,0] - np.maximum(pts[:,1], pts[:,2]) < 0.25
    src = pts[not_red] if not_red.sum() > 0 else pts
    px[d2 <= r**2] = src.mean(axis=0)

for (x,y) in [(754,183),(78,568),(85,426),(542,426),(428,781),(871,781)]:
    ring_inpaint(px, int(x*sx), int(y*sy), int(16*min(sx,sy)))
print("Stars removed.")

# Top wing roundels from iranian_roundel.png
R_W = int(20 * sx)   # roundel target width
stamp_img(px, "roundel", int(85*sx),  int(426*sy), R_W)
stamp_img(px, "roundel", int(542*sx), int(426*sy), R_W)
print("Roundels done.")

# ── tail fins ─────────────────────────────────────────────────────────────────
# Island width = 139px.
# Flag:   target_w = 100px  (72% island — flag is wide & relatively short)
# Number: target_w =  70px  (50% island)
# Eagle:  target_w =  55px  (40% island)

FLAG_W = int(100 * sx)
NUM_W  = int( 70 * sx)
EAG_W  = int( 55 * sx)

# ── LEFT tail (cx=746, TIP=HIGH cy) ──────────────────────────────────────────
CX_L = int(746 * sx)
# top→bottom: number(375) → flag(305) → eagle(225)
stamp_img(px, "number", CX_L, int(375*sy), NUM_W)
stamp_img(px, "flag",   CX_L, int(300*sy), FLAG_W)
stamp_img(px, "eagle",  CX_L, int(220*sy), EAG_W)
print("Left tail done.")

# ── RIGHT tail (cx=71, TIP=LOW cy) ───────────────────────────────────────────
CX_R = int(71 * sx)
# top→bottom: number(395) → flag(490)   [no eagle on right tail]
# flip_h to mirror number/flag for the other side
stamp_img(px, "number", CX_R, int(395*sy), NUM_W, flip_h=True)
stamp_img(px, "flag",   CX_R, int(490*sy), FLAG_W, flip_h=True)
print("Right tail done.")

# ── left wing bottom eagle ────────────────────────────────────────────────────
stamp_img(px, "eagle", int(428*sx), int(781*sy), EAG_W)
print("Wing eagle done.")

# ── export ────────────────────────────────────────────────────────────────────
px_out  = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("airframe_iran", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', export_image_format='AUTO')
print(f"\n✓ Exported: {GLB_OUT}")
