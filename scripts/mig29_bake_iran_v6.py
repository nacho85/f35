"""
MiG-29 Iran – v6

Confirmed from gradient diagnostic (red = low-y = fin TIP):
  tail_R  x:2-140    y:327-622  TIP=y_low(327)  BASE=y_hi(622)  cx=71   star=(78,568)
  tail_L  x:677-816  y:130-425  TIP=y_hi(425)   BASE=y_lo(130)  cx=746  star=(754,183)

Stack on each fin (from TIP downward = toward BASE):
  number  →  flag  →  eagle (left only)

Flag orientation:
  tail_L: TIP at high y → green must be at high y → flip_v=False
  tail_R: TIP at low  y → green must be at low  y → flip_v=True

Horizontal centering: cx = island X-centre (746 / 71).
Widths capped at 110px (< 139px island width).
"""
import bpy, math
import numpy as np

MIG_IN     = r"C:\devs\f35\public\mig-29.glb"
FLAG_PATH  = r"C:\devs\f35\public\iranian_flag.png"
DECAL_PATH = r"C:\devs\f35\public\mig29_iran_decals.png"
GLB_OUT    = r"C:\devs\f35\public\mig-29-iran.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)

# ── decal sheet ───────────────────────────────────────────────────────────────
decal_img = bpy.data.images.load(DECAL_PATH)
decal_img.pack()
DW, DH = decal_img.size
d_px = np.array(decal_img.pixels[:], dtype=np.float32).reshape(DH, DW, 4)
d_px = np.flipud(d_px)

def dcrop(x0, y0, x1, y1):
    return d_px[y0:y1, x0:x1].copy()

crop_roundel  = dcrop(83,   2, 126,  42)
crop_num_west = dcrop(16, 134,  54, 153)   # 38×19
crop_eagle_L  = dcrop( 6, 172,  82, 231)   # 76×59

# ── MiG-29 ────────────────────────────────────────────────────────────────────
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
print(f"Texture {TW}x{TH}")

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
    yi = (np.arange(dh)*sh/dh).astype(int)
    xi = (np.arange(dw)*sw/dw).astype(int)
    return crop[np.ix_(yi, xi)]

def stamp(px, crop, cx, cy, dw, dh, flip_h=False, flip_v=False):
    scaled = resize_nn(crop, dh, dw)
    H, W   = px.shape[:2]
    for dy in range(-dh//2, dh//2+1):
        for dx in range(-dw//2, dw//2+1):
            nx=(dx+0.5)/dw; ny=(dy+0.5)/dh
            snx = -nx if flip_h else nx
            sny = -ny if flip_v else ny
            fx=int((snx+0.5)*dw); fy=int((sny+0.5)*dh)
            if not(0<=fx<dw and 0<=fy<dh): continue
            r,g,b,a = (float(scaled[fy,fx,c]) for c in range(4))
            if a < 0.05: continue
            tx,ty = cx+dx, cy+dy
            if not(0<=tx<W and 0<=ty<H): continue
            bg = px[ty,tx]
            px[ty,tx,0]=r*a+bg[0]*(1-a)
            px[ty,tx,1]=g*a+bg[1]*(1-a)
            px[ty,tx,2]=b*a+bg[2]*(1-a)
            px[ty,tx,3]=1.0

def stamp_flag(px, flag_raw, FW, FH, cx, cy, sw, sh, flip_h=False, flip_v=False):
    """
    flip_v=True  → inverts sny so fy maps: low-ty→high-fy(green).
                   Use for fins where TIP is at low y (tail_R).
    flip_v=False → fy normal: high-ty→high-fy(green).
                   Use for fins where TIP is at high y (tail_L).
    """
    H, W = px.shape[:2]
    for dy in range(-sh//2, sh//2+1):
        for dx in range(-sw//2, sw//2+1):
            nx=(dx+.5)/sw; ny=(dy+.5)/sh
            snx = -nx if flip_h else nx
            sny = -ny if flip_v else ny
            fx=int((snx+.5)*FW); fy=int((sny+.5)*FH)
            if not(0<=fx<FW and 0<=fy<FH): continue
            i=(fy*FW+fx)*4
            r,g,b,a=flag_raw[i],flag_raw[i+1],flag_raw[i+2],flag_raw[i+3]
            if a<.05: continue
            tx,ty=cx+dx,cy+dy
            if 0<=tx<W and 0<=ty<H:
                px[ty,tx]=[r,g,b,1.0]

# ── 1. Remove Russian stars ───────────────────────────────────────────────────
for (x,y) in [(754,183),(78,568),(85,426),(542,426),(428,781),(871,781)]:
    ring_inpaint(px, int(x*sx), int(y*sy), int(16*min(sx,sy)))
print("Stars removed.")

# ── 2. Top wing roundels ──────────────────────────────────────────────────────
draw_roundel(px, int(85*sx),  int(426*sy), int(13*min(sx,sy)))
draw_roundel(px, int(542*sx), int(426*sy), int(13*min(sx,sy)))
print("Roundels done.")

# ── load flag ─────────────────────────────────────────────────────────────────
flag_img = bpy.data.images.load(FLAG_PATH)
flag_img.pack()
FW, FH   = flag_img.size
flag_raw = list(flag_img.pixels)

SW = int(100 * sx)   # stamp width — fits inside 139px island, leaves margins

# ── 3. LEFT tail fin ──────────────────────────────────────────────────────────
# TIP = high y (425), BASE = low y (130). cx = 746.
# Stack from TIP downward: number @ 370, flag @ 295, eagle @ 215
CX_L = int(746 * sx)

stamp(px, crop_num_west,
      cx=CX_L, cy=int(370*sy),
      dw=SW,  dh=int(14*sy))

stamp_flag(px, flag_raw, FW, FH,
           cx=CX_L, cy=int(295*sy),
           sw=SW,   sh=int(36*sy),
           flip_v=False)   # green at high y = TIP

eagle_dw = SW
eagle_dh = int(eagle_dw * 59 // 76)
stamp(px, crop_eagle_L,
      cx=CX_L, cy=int(215*sy),
      dw=eagle_dw, dh=eagle_dh)
print("Left tail done.")

# ── 4. RIGHT tail fin ─────────────────────────────────────────────────────────
# TIP = low y (327), BASE = high y (622). cx = 71.
# Stack from TIP downward: number @ 420, flag @ 495
CX_R = int(71 * sx)

stamp(px, crop_num_west,
      cx=CX_R, cy=int(420*sy),
      dw=SW,  dh=int(14*sy),
      flip_h=True)

stamp_flag(px, flag_raw, FW, FH,
           cx=CX_R, cy=int(495*sy),
           sw=SW,   sh=int(36*sy),
           flip_h=True, flip_v=True)  # green at low y = TIP
print("Right tail done.")

# ── 5. Left wing bottom eagle ─────────────────────────────────────────────────
stamp(px, crop_eagle_L,
      cx=int(428*sx), cy=int(781*sy),
      dw=int(60*sx), dh=int(int(60*sx)*59//76))
print("Wing eagle done.")

# ── export ────────────────────────────────────────────────────────────────────
px_out  = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("airframe_iran", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', export_image_format='AUTO')
print(f"\n✓ Exported: {GLB_OUT}")
