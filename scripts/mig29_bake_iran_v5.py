"""
MiG-29 Iran – v5
UV island data from flood-fill analysis:
  tail_L  x:677-816 (w=139)  y:130-425 (h=295)  cx=746  star=(754,183)
  tail_R  x:  2-140 (w=138)  y:327-622 (h=295)  cx= 71  star=( 78,568)

Key fixes vs v4:
  1. Stack items along Y axis (fin height), not X axis (fin width).
  2. tail_R stacks in DECREASING-Y direction (mirror of tail_L).
  3. stamp_flag gains flip_v to render Iranian flag right-side-up (green top).
  4. No rot=-90 for tail_R: both fins have Y=fin-height in UV space.
  5. All item widths (dw / sw) fit inside the 139px island width.
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
DW, DH = decal_img.size
d_px = np.array(decal_img.pixels[:], dtype=np.float32).reshape(DH, DW, 4)
d_px = np.flipud(d_px)

def dcrop(x0, y0, x1, y1):
    return d_px[y0:y1, x0:x1].copy()

crop_roundel  = dcrop(83,   2, 126,  42)
crop_num_west = dcrop(16, 134,  54, 153)   # 38×19 "3-6118"
crop_eagle_L  = dcrop( 6, 172,  82, 231)   # 76×59 eagle faces right
crop_iriaf    = dcrop(12,  70,  80,  94)   # 68×24 IRIAF text

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
px = np.flipud(px)
sx = TW / 1024;  sy = TH / 1024
print(f"Texture: {TW}x{TH}")

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
    scaled = resize_nn(crop, dh, dw)
    H, W   = px.shape[:2]
    ang    = math.radians(-rot_deg)
    ca, sa = math.cos(ang), math.sin(ang)
    for dy in range(-dh//2, dh//2+1):
        for dx in range(-dw//2, dw//2+1):
            nx = (dx+0.5)/dw;  ny = (dy+0.5)/dh
            snx =  nx*ca + ny*sa
            sny = -nx*sa + ny*ca
            if flip_h: snx = -snx
            if flip_v: sny = -sny
            fx = int((snx+0.5)*dw);  fy = int((sny+0.5)*dh)
            if not (0<=fx<dw and 0<=fy<dh): continue
            r, g, b, a = (float(scaled[fy, fx, c]) for c in range(4))
            if a < 0.05: continue
            tx, ty = cx+dx, cy+dy
            if not (0<=tx<W and 0<=ty<H): continue
            bg = px[ty, tx]
            px[ty, tx, 0] = r*a + bg[0]*(1-a)
            px[ty, tx, 1] = g*a + bg[1]*(1-a)
            px[ty, tx, 2] = b*a + bg[2]*(1-a)
            px[ty, tx, 3] = 1.0

def stamp_flag(px, flag_raw, FW, FH, tex_cx, tex_cy, sw, sh,
               rot_deg=0, flip_h=False, flip_v=False):
    """
    Stamp flag centred at (tex_cx, tex_cy) in the flipud px array.
    flip_v=True  → green stripe ends up at the top (lower ty values).
    flag_raw is Blender-order (fy=0 = bottom of image = red stripe).
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
            if flip_v: sny = -sny
            fx = int((snx+.5)*FW);  fy = int((sny+.5)*FH)
            if not (0<=fx<FW and 0<=fy<FH): continue
            i = (fy*FW + fx)*4
            r, g, b, a = flag_raw[i], flag_raw[i+1], flag_raw[i+2], flag_raw[i+3]
            if a < .05: continue
            tx, ty = tex_cx+dx, tex_cy+dy
            if 0<=tx<W and 0<=ty<H:
                px[ty, tx] = [r, g, b, 1.0]

# ── 1. Remove Russian stars ───────────────────────────────────────────────────
for (x, y) in [(754,183),(78,568),(85,426),(542,426),(428,781),(871,781)]:
    ring_inpaint(px, int(x*sx), int(y*sy), int(16*min(sx,sy)))
print("Stars removed.")

# ── 2. Top-wing roundels ─────────────────────────────────────────────────────
draw_roundel(px, int(85*sx),  int(426*sy), int(13*min(sx,sy)))
draw_roundel(px, int(542*sx), int(426*sy), int(13*min(sx,sy)))
print("Roundels done.")

# ── load flag ─────────────────────────────────────────────────────────────────
flag_img = bpy.data.images.load(FLAG_PATH)
flag_img.pack()
FW, FH   = flag_img.size
flag_raw = list(flag_img.pixels)

# ── 3. LEFT tail fin ──────────────────────────────────────────────────────────
# Island: x 677-816 (w=139), y 130-425 (h=295). cx_centre=746, star=(754,183).
# Y increases downward. Star near TOP of island → items go downward from there.
# Stacking (top→bottom of fin = low-cy → high-cy):
#   number  cy≈190  (above/at star row)
#   flag    cy≈260
#   eagle   cy≈340

CX_L = int(746 * sx)
FIN_SW = int(110 * sx)   # flag/number width — fits inside 139px island width

# Number
stamp(px, crop_num_west,
      cx=CX_L, cy=int(192*sy),
      dw=FIN_SW, dh=int(14*sy),
      flip_h=False)

# Flag (flip_v so green is on top)
stamp_flag(px, flag_raw, FW, FH,
           CX_L, int(262*sy),
           sw=FIN_SW, sh=int(38*sy),
           flip_v=True)

# Eagle
stamp(px, crop_eagle_L,
      cx=CX_L, cy=int(340*sy),
      dw=FIN_SW, dh=int(int(110*sx)*59//76))   # maintain eagle aspect 76:59
print("Left tail done.")

# ── 4. RIGHT tail fin ─────────────────────────────────────────────────────────
# Island: x 2-140 (w=138), y 327-622 (h=295). cx_centre=71, star=(78,568).
# Star is near BOTTOM of island (y=568 ≈ 82% of y range).
# Mirror of tail_L: items go UPWARD from star (decreasing cy).
#   flag   cy≈500
#   number cy≈430

CX_R = int(71 * sx)

# Flag (flip_v=True keeps green on top; flip_h=True mirrors for other side)
stamp_flag(px, flag_raw, FW, FH,
           CX_R, int(500*sy),
           sw=FIN_SW, sh=int(38*sy),
           flip_v=True, flip_h=True)

# Number
stamp(px, crop_num_west,
      cx=CX_R, cy=int(430*sy),
      dw=FIN_SW, dh=int(14*sy),
      flip_h=True)
print("Right tail done.")

# ── 5. Left wing bottom – eagle ───────────────────────────────────────────────
stamp(px, crop_eagle_L,
      cx=int(428*sx), cy=int(781*sy),
      dw=int(60*sx),  dh=int(int(60*sx)*59//76))
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
