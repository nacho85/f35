"""
MiG-29 Iran – v8

Confirmed from v7 screenshot (eagle@355 appeared at TOP of fin, flag@262 below it):
  tail_L: HIGH cy = fin TIP (top), LOW cy = fin ROOT (bottom). cx=746.
  tail_R: mirror — LOW cy = fin TIP (top), HIGH cy = fin ROOT. cx=71.

Correct stack (top→bottom on fin):
  number (near tip)  →  flag  →  eagle (near root, left fin only)

Flag drawn programmatically (3 solid stripes) — iranian_flag.png has
transparency issues where the white and red stripes are alpha≈0.

Flag orientation:
  tail_L: TIP=HIGH cy → want green at HIGH cy → flip_v=True in draw_flag()
  tail_R: TIP=LOW  cy → want green at LOW  cy → flip_v=False in draw_flag()

Sizes: SW=65px (47% of 139px island width).
"""
import bpy, math
import numpy as np

MIG_IN     = r"C:\devs\f35\public\mig-29.glb"
DECAL_PATH = r"C:\devs\f35\public\mig29_iran_decals.png"
GLB_OUT    = r"C:\devs\f35\public\mig-29-iran.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)

decal_img = bpy.data.images.load(DECAL_PATH)
decal_img.pack()
DW, DH = decal_img.size
d_px = np.array(decal_img.pixels[:], dtype=np.float32).reshape(DH, DW, 4)
d_px = np.flipud(d_px)

def dcrop(x0, y0, x1, y1):
    return d_px[y0:y1, x0:x1].copy()

crop_roundel  = dcrop(83,   2, 126,  42)
crop_num_west = dcrop(16, 134,  54, 153)
crop_eagle_L  = dcrop( 6, 172,  82, 231)

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

# Iranian flag: green / white / red  (top to bottom when viewed on fin)
FLAG_GREEN = [0.086, 0.639, 0.290, 1.0]
FLAG_WHITE = [1.000, 1.000, 1.000, 1.0]
FLAG_RED   = [0.843, 0.000, 0.000, 1.0]

def draw_flag(px, cx, cy, sw, sh, flip_v=False):
    """
    Draw a 3-stripe flag centred at (cx, cy).
    flip_v=True  → green at HIGH dy (toward high y in texture).
    flip_v=False → green at LOW  dy (toward low  y in texture).
    """
    H, W = px.shape[:2]
    stripes = [FLAG_GREEN, FLAG_WHITE, FLAG_RED]
    for dy in range(-sh//2, sh//2+1):
        ny = (dy + 0.5) / sh          # -0.5 … +0.5
        sny = -ny if flip_v else ny    # signed normalised y in flag space
        idx = int((sny + 0.5) * 3)    # 0=green  1=white  2=red
        col = stripes[max(0, min(2, idx))]
        for dx in range(-sw//2, sw//2+1):
            tx, ty = cx+dx, cy+dy
            if 0 <= tx < W and 0 <= ty < H:
                px[ty, tx] = col

# ── 1. Remove stars ───────────────────────────────────────────────────────────
for (x,y) in [(754,183),(78,568),(85,426),(542,426),(428,781),(871,781)]:
    ring_inpaint(px, int(x*sx), int(y*sy), int(16*min(sx,sy)))
print("Stars removed.")

# ── 2. Top wing roundels ──────────────────────────────────────────────────────
draw_roundel(px, int(85*sx),  int(426*sy), int(13*min(sx,sy)))
draw_roundel(px, int(542*sx), int(426*sy), int(13*min(sx,sy)))
print("Roundels done.")

SW = int(36 * sx)   # stamp width – ~26% of 139px island

# ── 3. LEFT tail fin ──────────────────────────────────────────────────────────
# x:677-816 cx=746   y:130-425   HIGH cy = TIP (top) / LOW cy = ROOT (bottom)
# Stack top→bottom: number@375, flag@305, eagle@225
CX_L = int(746 * sx)

stamp(px, crop_num_west,
      cx=CX_L, cy=int(375*sy), dw=SW, dh=int(12*sy))

draw_flag(px, cx=CX_L, cy=int(305*sy),
          sw=SW, sh=int(30*sy),
          flip_v=True)    # green at HIGH cy = TIP

EW = int(30*sx);  EH = int(EW*59//76)
stamp(px, crop_eagle_L,
      cx=CX_L, cy=int(225*sy), dw=EW, dh=EH)
print("Left tail done.")

# ── 4. RIGHT tail fin ─────────────────────────────────────────────────────────
# x:2-140  cx=71   y:327-622   LOW cy = TIP (top) / HIGH cy = ROOT (bottom)
# Stack top→bottom: number@395, flag@490
CX_R = int(71 * sx)

stamp(px, crop_num_west,
      cx=CX_R, cy=int(395*sy), dw=SW, dh=int(12*sy),
      flip_h=True)

draw_flag(px, cx=CX_R, cy=int(490*sy),
          sw=SW, sh=int(30*sy),
          flip_v=False)   # green at LOW cy = TIP
print("Right tail done.")

# ── 5. Left wing bottom eagle ─────────────────────────────────────────────────
stamp(px, crop_eagle_L,
      cx=int(428*sx), cy=int(781*sy),
      dw=int(30*sx), dh=int(int(30*sx)*59//76))
print("Wing eagle done.")

# ── export ────────────────────────────────────────────────────────────────────
px_out  = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("airframe_iran", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', export_image_format='AUTO')
print(f"\n✓ Exported: {GLB_OUT}")
