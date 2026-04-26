"""
Bake markings iraníes en mig-29-iran.glb copiando los decals directamente del F-14.
  1. Borra 6 estrellas rusas con inpainting por promedio de anillo
  2. Roundels iraníes en alas superiores (dibujados programáticamente)
  3. Emblema iraní en ala izq inferior  (extraído de F-14 Image_6)
  4. Decal IRIAF debajo de la cabina    (extraído de F-14 Image_6)
  5. Bandera iraní en las colas         (usando iranian_flag.png con rotación/flip)
"""
import bpy, os, math
import numpy as np

MIG_IN    = r"C:\devs\f35\public\mig-29.glb"
F14_IN    = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
FLAG_PATH = r"C:\devs\f35\public\iranian_flag.png"
GLB_OUT   = r"C:\devs\f35\public\mig-29-iran.glb"

# ═══════════════════════════════════════════════════════════════════════════════
#  PASO 1: cargar F-14 y extraer parches
# ═══════════════════════════════════════════════════════════════════════════════
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)

bpy.ops.import_scene.gltf(filepath=F14_IN)
f14_img = bpy.data.images["Image_6"]
F14W, F14H = f14_img.size   # 4096x4096
f14_px = np.array(f14_img.pixels[:], dtype=np.float32).reshape(F14H, F14W, 4)
f14_px = np.flipud(f14_px)  # y=0 arriba

def crop_f14(x0_1024, y0_1024, x1_1024, y1_1024):
    """Extrae un parche del F-14 en coords 1024×1024, devuelve numpy RGBA float."""
    sc = F14W / 1024
    x0 = int(x0_1024 * sc); x1 = int(x1_1024 * sc)
    y0 = int(y0_1024 * sc); y1 = int(y1_1024 * sc)
    return f14_px[y0:y1, x0:x1].copy()

# Emblema: bbox en F-14 1024-space (710,754)→(760,804) — ligeramente más amplio
patch_emblem = crop_f14(700, 744, 770, 814)   # 70×70 px en 1024

# IRIAF text: clusters blancos en y≈601, x≈655→763 en F-14 1024-space
# Ampliar bbox para capturar el texto completo
patch_iriaf = crop_f14(640, 588, 780, 625)    # 140×37 px en 1024

print(f"Emblema patch: {patch_emblem.shape[1]}x{patch_emblem.shape[0]} px (en F-14)")
print(f"IRIAF patch:   {patch_iriaf.shape[1]}x{patch_iriaf.shape[0]} px (en F-14)")

# ═══════════════════════════════════════════════════════════════════════════════
#  PASO 2: cargar MiG-29 original
# ═══════════════════════════════════════════════════════════════════════════════
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
                tex_node = node
                break
        if tex_node: break
    if tex_node: break

orig = tex_node.image
TW, TH = orig.size
print(f"MiG-29 textura: {TW}x{TH}")
px = np.array(orig.pixels[:], dtype=np.float32).reshape(TH, TW, 4)
px = np.flipud(px)   # y=0 arriba
sx = TW / 1024; sy = TH / 1024

# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════════
def ring_inpaint(px, cx, cy, r):
    """Rellena círculo con promedio de anillo exterior (sin rojo)."""
    H, W = px.shape[:2]
    Y, X = np.ogrid[:H, :W]
    d2 = (X-cx)**2 + (Y-cy)**2
    ring = (d2 >= (r*1.5)**2) & (d2 <= (r*2.4)**2)
    pts = px[ring]
    not_red = pts[:,0] - np.maximum(pts[:,1], pts[:,2]) < 0.25
    src = pts[not_red] if not_red.sum() > 0 else pts
    avg = src.mean(axis=0)
    px[d2 <= r**2] = avg

def draw_roundel(px, cx, cy, r):
    H, W = px.shape[:2]
    Y, X = np.ogrid[:H, :W]
    d2 = (X-cx)**2 + (Y-cy)**2
    px[d2 <= r**2]          = [0.137, 0.624, 0.251, 1.0]   # verde
    px[d2 <= (r*.68)**2]    = [1.0,   1.0,   1.0,   1.0]   # blanco
    px[d2 <= (r*.38)**2]    = [0.855, 0.0,   0.0,   1.0]   # rojo

def resize_patch(patch, dst_h, dst_w):
    """Redimensiona patch a dst_h×dst_w con interpolación bilineal (numpy puro)."""
    sh, sw = patch.shape[:2]
    ys = np.linspace(0, sh-1, dst_h)
    xs = np.linspace(0, sw-1, dst_w)
    y0 = np.floor(ys).astype(int); y1 = np.minimum(y0+1, sh-1)
    x0 = np.floor(xs).astype(int); x1 = np.minimum(x0+1, sw-1)
    wy = (ys - y0)[:, None, None]; wx = (xs - x0)[None, :, None]
    out = (patch[y0][:, x0] * (1-wy)*(1-wx)
         + patch[y0][:, x1] * (1-wy)*wx
         + patch[y1][:, x0] * wy*(1-wx)
         + patch[y1][:, x1] * wy*wx)
    return np.clip(out, 0, 1)

def stamp_patch(px, patch, dst_cx, dst_cy, dst_w, dst_h, alpha_from_red=False):
    scaled = resize_patch(patch, dst_h, dst_w)
    H, W = px.shape[:2]
    x0 = dst_cx - dst_w//2; y0 = dst_cy - dst_h//2
    for dy in range(dst_h):
        for dx in range(dst_w):
            tx, ty = x0+dx, y0+dy
            if tx < 0 or ty < 0 or tx >= W or ty >= H: continue
            r, g, b, a = float(scaled[dy,dx,0]), float(scaled[dy,dx,1]), float(scaled[dy,dx,2]), float(scaled[dy,dx,3])
            if alpha_from_red:
                redness = r - max(g, b)
                if redness < 0.12: continue
                a = min(1.0, redness * 4.0)
                r, g, b = 0.855, 0.0, 0.0
            else:
                if a < 0.05 and r+g+b > 2.7: continue
            bg = px[ty, tx]
            px[ty, tx, 0] = r*a + bg[0]*(1-a)
            px[ty, tx, 1] = g*a + bg[1]*(1-a)
            px[ty, tx, 2] = b*a + bg[2]*(1-a)
            px[ty, tx, 3] = 1.0

def stamp_patch_opaque(px, patch, dst_cx, dst_cy, dst_w, dst_h):
    scaled = resize_patch(patch, dst_h, dst_w)
    H, W = px.shape[:2]
    x0 = dst_cx - dst_w//2; y0 = dst_cy - dst_h//2
    for dy in range(dst_h):
        for dx in range(dst_w):
            tx, ty = x0+dx, y0+dy
            if tx < 0 or ty < 0 or tx >= W or ty >= H: continue
            r, g, b = float(scaled[dy,dx,0]), float(scaled[dy,dx,1]), float(scaled[dy,dx,2])
            lum = 0.299*r + 0.587*g + 0.114*b
            if lum > 0.78:
                alpha = min(1.0, (lum - 0.78) * 5.0)
                bg = px[ty, tx]
                px[ty, tx, 0] = r*alpha + bg[0]*(1-alpha)
                px[ty, tx, 1] = g*alpha + bg[1]*(1-alpha)
                px[ty, tx, 2] = b*alpha + bg[2]*(1-alpha)
                px[ty, tx, 3] = 1.0

def stamp_flag(px, flag_px, FW, FH, tex_cx, tex_cy, sw, sh, rot_deg=0, flip_h=False):
    ang = math.radians(-rot_deg)
    ca, sa = math.cos(ang), math.sin(ang)
    H, W = px.shape[:2]
    for dy in range(-sh//2, sh//2+1):
        for dx in range(-sw//2, sw//2+1):
            nx = (dx+0.5)/sw; ny = (dy+0.5)/sh
            src_nx =  nx*ca + ny*sa
            src_ny = -nx*sa + ny*ca
            if flip_h: src_nx = -src_nx
            fx = int((src_nx+0.5)*FW); fy = int((src_ny+0.5)*FH)
            if not (0 <= fx < FW and 0 <= fy < FH): continue
            idx = (fy*FW + fx)*4
            r = flag_px[idx]; g = flag_px[idx+1]; b = flag_px[idx+2]; a = flag_px[idx+3]
            if a < 0.05: continue
            tx, ty = tex_cx+dx, tex_cy+dy
            if 0 <= tx < W and 0 <= ty < H:
                px[ty, tx] = [r, g, b, 1.0]

# ═══════════════════════════════════════════════════════════════════════════════
#  PASO 3: aplicar marcas
# ═══════════════════════════════════════════════════════════════════════════════

# ── 3a. Borrar estrellas rusas ────────────────────────────────────────────────
stars = [(754,183),(78,568),(85,426),(542,426),(428,781),(871,781)]
for (x,y) in stars:
    ring_inpaint(px, int(x*sx), int(y*sy), int(16*min(sx,sy)))
print("Estrellas borradas.")

# ── 3b. Roundels iraníes — alas superiores ────────────────────────────────────
for (x,y,r) in [(85,426,13),(542,426,13)]:
    draw_roundel(px, int(x*sx), int(y*sy), int(r*min(sx,sy)))
print("Roundels pintados.")


# ── 3e. Bandera iraní en colas ────────────────────────────────────────────────
flag_img = bpy.data.images.load(FLAG_PATH)
flag_img.pack()
FW, FH = flag_img.size
flag_raw = list(flag_img.pixels)

stamp_flag(px, flag_raw, FW, FH,
           int(755*sx), TH - int(183*sy),   # cola A (flip Y para Blender)
           int(55*sx), int(38*sy), rot_deg=0, flip_h=True)
stamp_flag(px, flag_raw, FW, FH,
           int(80*sx),  TH - int(569*sy),   # cola B
           int(38*sx), int(55*sy), rot_deg=-90, flip_h=True)
print("Banderas pintadas.")

# ═══════════════════════════════════════════════════════════════════════════════
#  PASO 4: guardar textura + exportar GLB
# ═══════════════════════════════════════════════════════════════════════════════
px_out = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("airframe_iran", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', export_image_format='AUTO')
print(f"\n✓ Exportado: {GLB_OUT}")
