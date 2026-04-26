"""
MiG-29 Iran – v4
Bug fix: stamp_flag was receiving TH-cy instead of cy (coordinate flip mismatch).
Both stamp() and stamp_flag() operate on the same flipud px array (y=0 at top),
so all coordinates must be in the same system.

Layout:
  Top wings      : roundels × 2  (confirmed working)
  Left tail  (A) : number → flag → eagle  (X-axis = fin height, cx varies)
  Right tail (B) : number → flag          (Y-axis = fin height, cy varies, rot=-90)
  Left wing btm  : IRIAF eagle
"""
import bpy, math
import numpy as np

MIG_IN     = r"C:\devs\f35\public\mig-29.glb"
FLAG_PATH  = r"C:\devs\f35\public\iranian_flag.png"
DECAL_PATH = r"C:\devs\f35\public\mig29_iran_decals.png"
GLB_OUT    = r"C:\devs\f35\public\mig-29-iran.glb"

# ── scene reset ───────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)

# ── load decal sheet ──────────────────────────────────────────────────────────
decal_img = bpy.data.images.load(DECAL_PATH)
decal_img.pack()
DW, DH = decal_img.size   # 212×247
d_px = np.array(decal_img.pixels[:], dtype=np.float32).reshape(DH, DW, 4)
d_px = np.flipud(d_px)    # y=0 at top

def dcrop(x0, y0, x1, y1):
    return d_px[y0:y1, x0:x1].copy()

crop_roundel  = dcrop(83,   2, 126,  42)   # 43×40
crop_num_west = dcrop(16, 134,  54, 153)   # 38×19
crop_eagle_L  = dcrop( 6, 172,  82, 231)   # 76×59 – faces right
crop_iriaf    = dcrop(12,  70,  80,  94)   # 68×24

print(f"Decal sheet: {DW}x{DH}")

# ── load MiG-29 ───────────────────────────────────────────────────────────────
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
px = np.flipud(px)   # y=0 at top (same convention for ALL ops below)
sx = TW / 1024;  sy = TH / 1024
print(f"Textura: {TW}x{TH}")

# ── helpers ───────────────────────────────────────────────────────────────────
def ring_inpaint(px, cx, cy, r):
    H, W = px.shape[:2]
    Y, X = np.ogrid[:H, :W]
    d2 = (X-cx)**2 + (Y-cy)**2
    ring = (d2 >= (r*1.5)**2) & (d2 <= (r*2.4)**2)
    pts  = px[ring]
    not_red = pts[:,0] - np.maximum(pts[:,1], pts[:,2]) < 0.25
    src = pts[not_red] if not_red.sum() > 0 else pts
    px[d2 <= r**2] = src.mean(axis=0)

def draw_roundel(px, cx, cy, r):
    H, W = px.shape[:2]
    Y, X = np.ogrid[:H, :W]
    d2 = (X-cx)**2 + (Y-cy)**2
    px[d2 <= r**2]       = [0.137, 0.624, 0.251, 1.0]
    px[d2 <= (r*.68)**2] = [1.0,   1.0,   1.0,   1.0]
    px[d2 <= (r*.38)**2] = [0.855, 0.0,   0.0,   1.0]

def resize_nn(crop, dh, dw):
    sh, sw = crop.shape[:2]
    yi = (np.arange(dh) * sh / dh).astype(int)
    xi = (np.arange(dw) * sw / dw).astype(int)
    return crop[np.ix_(yi, xi)]

def stamp(px, crop, cx, cy, dw, dh, rot_deg=0, flip_h=False, flip_v=False):
    """Stamp crop (resized to dw×dh) centred at (cx,cy). Alpha composited."""
    scaled = resize_nn(crop, dh, dw)
    H, W   = px.shape[:2]
    ang    = math.radians(-rot_deg)
    ca, sa = math.cos(ang), math.sin(ang)
    half_w, half_h = dw / 2.0, dh / 2.0
    for dy in range(-int(half_h), int(half_h)+1):
        for dx in range(-int(half_w), int(half_w)+1):
            nx = (dx + 0.5) / dw
            ny = (dy + 0.5) / dh
            snx =  nx*ca + ny*sa
            sny = -nx*sa + ny*ca
            if flip_h: snx = -snx
            if flip_v: sny = -sny
            fx = int((snx + 0.5) * dw)
            fy = int((sny + 0.5) * dh)
            if not (0 <= fx < dw and 0 <= fy < dh): continue
            r, g, b, a = (float(scaled[fy, fx, c]) for c in range(4))
            if a < 0.05: continue
            tx, ty = cx+dx, cy+dy
            if not (0 <= tx < W and 0 <= ty < H): continue
            bg = px[ty, tx]
            px[ty, tx, 0] = r*a + bg[0]*(1-a)
            px[ty, tx, 1] = g*a + bg[1]*(1-a)
            px[ty, tx, 2] = b*a + bg[2]*(1-a)
            px[ty, tx, 3] = 1.0

def stamp_flag(px, flag_raw, FW, FH, tex_cx, tex_cy, sw, sh, rot_deg=0, flip_h=False):
    """
    Stamp Iranian flag centred at (tex_cx, tex_cy) in the flipud px array.
    tex_cx / tex_cy are PIXEL coordinates in the flipped array (y=0 at top).
    flag_raw is Blender-order (y=0 at bottom) – fy indexing handles this.
    """
    ang = math.radians(-rot_deg)
    ca, sa = math.cos(ang), math.sin(ang)
    H, W = px.shape[:2]
    for dy in range(-sh//2, sh//2+1):
        for dx in range(-sw//2, sw//2+1):
            nx = (dx+.5)/sw;  ny = (dy+.5)/sh
            snx =  nx*ca + ny*sa
            sny = -nx*sa + ny*ca
            if flip_h: snx = -snx
            fx = int((snx+.5)*FW);  fy = int((sny+.5)*FH)
            if not (0 <= fx < FW and 0 <= fy < FH): continue
            i = (fy*FW + fx)*4
            r, g, b, a = flag_raw[i], flag_raw[i+1], flag_raw[i+2], flag_raw[i+3]
            if a < .05: continue
            tx, ty = tex_cx+dx, tex_cy+dy
            if 0 <= tx < W and 0 <= ty < H:
                px[ty, tx] = [r, g, b, 1.0]

# ── 1. Remove Russian stars ───────────────────────────────────────────────────
# Coordinates are (x,y) in 1024-space where y=0 is TOP (flipped array convention)
for (x, y) in [(754,183), (78,568), (85,426), (542,426), (428,781), (871,781)]:
    ring_inpaint(px, int(x*sx), int(y*sy), int(16*min(sx,sy)))
print("Stars removed.")

# ── 2. Top wing roundels ──────────────────────────────────────────────────────
draw_roundel(px, int(85*sx),  int(426*sy), int(13*min(sx,sy)))
draw_roundel(px, int(542*sx), int(426*sy), int(13*min(sx,sy)))
print("Wing roundels done.")

# ── load Iranian flag ─────────────────────────────────────────────────────────
flag_img = bpy.data.images.load(FLAG_PATH)
flag_img.pack()
FW, FH   = flag_img.size
flag_raw = list(flag_img.pixels)

# ── 3. Left tail fin (A) ──────────────────────────────────────────────────────
# Star confirmed at (754, 183) in flipped-array coords.
# X-axis (column) = fin height: high col → fin top, low col → fin bottom.
# All items share the same row: cy = 183.
# Stacking order (top→bottom of fin = right→left in texture):
#   number   cx ≈ 808
#   flag     cx ≈ 755  (55 px wide in X)
#   eagle    cx ≈ 697

CY_A = int(183 * sy)

# Number (Western)
stamp(px, crop_num_west,
      cx=int(808*sx), cy=CY_A,
      dw=int(30*sx),  dh=int(12*sy),
      rot_deg=0, flip_h=True)

# Flag  (55 wide × 38 tall in X/Y of texture)
stamp_flag(px, flag_raw, FW, FH,
           int(755*sx), CY_A,          # ← FIXED: was TH-int(183*sy)
           int(50*sx),  int(35*sy),
           rot_deg=0, flip_h=True)

# Eagle – slightly left of flag
stamp(px, crop_eagle_L,
      cx=int(697*sx), cy=CY_A,
      dw=int(40*sx),  dh=int(32*sy),
      rot_deg=0, flip_h=True)
print("Left tail done.")

# ── 4. Right tail fin (B) ────────────────────────────────────────────────────
# Star at (78, 568).
# Y-axis (row) = fin height: low row → fin top, high row → fin bottom.
# rot=-90 so the flag's long axis runs vertically in the texture.
# Stacking: number (above flag = lower row), flag (at star row).

CX_B = int(78 * sx)

# Number – above flag (lower row number = higher on fin)
stamp(px, crop_num_west,
      cx=CX_B, cy=int(518*sy),
      dw=int(12*sx),  dh=int(30*sy),   # transposed for -90 rotation
      rot_deg=-90, flip_h=True)

# Flag
stamp_flag(px, flag_raw, FW, FH,
           CX_B, int(568*sy),           # ← FIXED: was TH-int(569*sy)
           int(35*sx), int(50*sy),
           rot_deg=-90, flip_h=True)
print("Right tail done.")

# ── 5. Left wing bottom – eagle ───────────────────────────────────────────────
stamp(px, crop_eagle_L,
      cx=int(428*sx), cy=int(781*sy),
      dw=int(52*sx),  dh=int(40*sy))
print("Wing eagle done.")

# ── export ────────────────────────────────────────────────────────────────────
px_out  = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("airframe_iran", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img

bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format='GLB',
    export_image_format='AUTO')
print(f"\n✓ Exported: {GLB_OUT}")
