"""
MiG-29 Iran – bake completo desde decal sheet + iranian_flag.png
Markings:
  - Aleta izq exterior: número 3-6118 + bandera + águila
  - Aleta der exterior: número 3-6118 + bandera  (sin águila)
  - Alas superiores: roundels iraníes × 2
  - Ala izq inferior: águila IRIAF
  - Estrellas rusas: borradas con inpainting
"""
import bpy, os, math
import numpy as np

MIG_IN     = r"C:\devs\f35\public\mig-29.glb"
FLAG_PATH  = r"C:\devs\f35\public\iranian_flag.png"
DECAL_PATH = r"C:\devs\f35\public\mig29_iran_decals.png"
GLB_OUT    = r"C:\devs\f35\public\mig-29-iran.glb"

# ── cargar decal sheet ────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)

decal_img = bpy.data.images.load(DECAL_PATH)
decal_img.pack()
DW, DH = decal_img.size   # 212×247
d_px = np.array(decal_img.pixels[:], dtype=np.float32).reshape(DH, DW, 4)
d_px = np.flipud(d_px)   # y=0 arriba

def dcrop(x0, y0, x1, y1):
    return d_px[y0:y1, x0:x1].copy()

# Crops de cada elemento del decal sheet (coordenadas en 212×247)
crop_roundel  = dcrop(83,  2, 126,  42)   # 43×40 – roundel
crop_num_west = dcrop(16, 134,  54, 153)   # 38×19 – 3-6118 occidental
crop_num_pers = dcrop(11, 159,  56, 181)   # 45×22 – ۳-۶۱۱۸ persa
crop_eagle_L  = dcrop( 6, 172,  82, 231)   # 76×59 – águila izq (mira a la der)
crop_eagle_R  = dcrop(134,171, 210, 230)   # 76×59 – águila der (mira a la izq)
crop_iriaf    = dcrop(12,  70,  80,  94)   # 68×24 – IRIAF grande

print(f"Decal sheet cargado: {DW}x{DH}")

# ── cargar MiG-29 ─────────────────────────────────────────────────────────────
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
TW, TH = orig.size   # 1024×1024
px = np.array(orig.pixels[:], dtype=np.float32).reshape(TH, TW, 4)
px = np.flipud(px)
sx = TW / 1024;  sy = TH / 1024

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
    """Nearest-neighbour resize."""
    sh, sw = crop.shape[:2]
    yi = (np.arange(dh) * sh / dh).astype(int)
    xi = (np.arange(dw) * sw / dw).astype(int)
    return crop[np.ix_(yi, xi)]

def stamp(px, crop, cx, cy, dw, dh, rot_deg=0, flip_h=False, flip_v=False):
    """
    Estampa crop (rescalado a dw×dh) centrado en (cx,cy) con rotación y flip.
    Respeta el canal alpha del crop.
    """
    scaled = resize_nn(crop, dh, dw)
    H, W   = px.shape[:2]
    ang    = math.radians(-rot_deg)
    ca, sa = math.cos(ang), math.sin(ang)
    half_w, half_h = dw / 2.0, dh / 2.0

    for dy in range(-int(half_h), int(half_h)+1):
        for dx in range(-int(half_w), int(half_w)+1):
            # normalised coords in dst
            nx = (dx + 0.5) / dw
            ny = (dy + 0.5) / dh
            # rotate back to source
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
    ang = math.radians(-rot_deg)
    ca, sa = math.cos(ang), math.sin(ang)
    H, W = px.shape[:2]
    for dy in range(-sh//2, sh//2+1):
        for dx in range(-sw//2, sw//2+1):
            nx=(dx+.5)/sw; ny=(dy+.5)/sh
            snx= nx*ca+ny*sa; sny=-nx*sa+ny*ca
            if flip_h: snx=-snx
            fx=int((snx+.5)*FW); fy=int((sny+.5)*FH)
            if not(0<=fx<FW and 0<=fy<FH): continue
            i=(fy*FW+fx)*4
            r,g,b,a=flag_raw[i],flag_raw[i+1],flag_raw[i+2],flag_raw[i+3]
            if a<.05: continue
            tx,ty=tex_cx+dx,tex_cy+dy
            if 0<=tx<W and 0<=ty<H:
                px[ty,tx]=[r,g,b,1.0]

# ── 1. Borrar estrellas rusas ─────────────────────────────────────────────────
for (x,y) in [(754,183),(78,568),(85,426),(542,426),(428,781),(871,781)]:
    ring_inpaint(px, int(x*sx), int(y*sy), int(16*min(sx,sy)))
print("Estrellas borradas.")

# ── 2. Roundels en alas superiores ───────────────────────────────────────────
draw_roundel(px, int(85*sx),  int(426*sy), int(13*min(sx,sy)))
draw_roundel(px, int(542*sx), int(426*sy), int(13*min(sx,sy)))
print("Roundels pintados.")

# ── 3. Aleta izquierda exterior ──────────────────────────────────────────────
# El UV de esta aleta tiene X corriendo verticalmente (high X = top of fin)
# Posiciones base: (755, 183) = centro del área de la aleta
# Stacking de arriba hacia abajo: número → bandera → águila
flag_img  = bpy.data.images.load(FLAG_PATH)
flag_img.pack()
FW, FH    = flag_img.size
flag_raw  = list(flag_img.pixels)

# Número 3-6118 – por encima de la bandera (X mayor = más arriba en la aleta)
stamp(px, crop_num_west,
      cx=int(800*sx), cy=int(183*sy),
      dw=int(30*sx),  dh=int(13*sy),
      rot_deg=0, flip_h=True)

# Bandera
stamp_flag(px, flag_raw, FW, FH,
           int(755*sx), TH-int(183*sy),
           int(55*sx), int(38*sy), rot_deg=0, flip_h=True)

# Águila – por debajo de la bandera (X menor)
stamp(px, crop_eagle_L,
      cx=int(705*sx), cy=int(183*sy),
      dw=int(42*sx),  dh=int(34*sy),
      rot_deg=0, flip_h=True)
print("Aleta izq pintada.")

# ── 4. Aleta derecha exterior ─────────────────────────────────────────────────
# Posición base (78, 568), rot=-90, flip_h=True
# En esta aleta Y corre verticalmente (menor Y = más arriba en la aleta)

# Número – arriba de la bandera (Y menor)
stamp(px, crop_num_west,
      cx=int(78*sx), cy=int(535*sy),
      dw=int(13*sy),  dh=int(30*sx),   # transpuesto por la rotación
      rot_deg=-90, flip_h=True)

# Bandera
stamp_flag(px, flag_raw, FW, FH,
           int(80*sx), TH-int(569*sy),
           int(38*sx), int(55*sy), rot_deg=-90, flip_h=True)
print("Aleta der pintada.")

# ── 5. Ala izquierda inferior – águila ───────────────────────────────────────
stamp(px, crop_eagle_L,
      cx=int(428*sx), cy=int(781*sy),
      dw=int(52*sx),  dh=int(40*sy))
print("Águila ala izq pintada.")

# ── guardar + exportar ────────────────────────────────────────────────────────
px_out = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("airframe_iran", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', export_image_format='AUTO')
print(f"\n✓ Exportado: {GLB_OUT}")
