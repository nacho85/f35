"""
Hornea las marcas iraníes directamente en la textura del MiG-29 y exporta mig-29-iran.glb.
  - Borra las 6 estrellas rusas (inpainting por vecinos)
  - Roundels iraníes en alas superiores y colas
  - Emblema iraní (del flag PNG, solo canal rojo) en ala izquierda inferior
"""
import bpy, os, math
import numpy as np

GLB_IN   = r"C:\devs\f35\public\mig-29.glb"
GLB_OUT  = r"C:\devs\f35\public\mig-29-iran.glb"
FLAG_PATH = r"C:\devs\f35\public\iranian_flag.png"

# ── Limpiar escena ─────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)

bpy.ops.import_scene.gltf(filepath=GLB_IN)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

# ── Encontrar textura del airframe ─────────────────────────────────────────────
tex_node = None
for o in meshes:
    for mat in o.data.materials:
        if mat and "airframe" in mat.name.lower() and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    tex_node = node
                    break
        if tex_node: break
    if tex_node: break

orig = tex_node.image
TW, TH = orig.size
print(f"Textura: {TW}x{TH}")

# Blender pixels: flat RGBA float, y=0 en ABAJO
px = np.array(orig.pixels[:], dtype=np.float32).reshape(TH, TW, 4)
# Trabajamos con y=0 arriba (canvas convention) — flip vertical
px = np.flipud(px)

sx = TW / 1024
sy = TH / 1024

# ── Helpers ────────────────────────────────────────────────────────────────────
def fill_circle_inpaint(px, cx, cy, r):
    """Rellena el círculo con el color promedio de un anillo exterior."""
    H, W = px.shape[:2]
    Y, X = np.ogrid[:H, :W]
    d2 = (X - cx)**2 + (Y - cy)**2
    ring = (d2 >= (r*1.4)**2) & (d2 <= (r*2.2)**2)
    ring_px = px[ring]
    # Excluir píxeles muy rojos del promedio
    not_red = ring_px[:, 0] - np.maximum(ring_px[:, 1], ring_px[:, 2]) < 0.3
    candidates = ring_px[not_red]
    if len(candidates) == 0:
        candidates = ring_px
    avg = candidates.mean(axis=0)
    mask = d2 <= r**2
    px[mask] = avg

def draw_roundel(px, cx, cy, r):
    """Roundel iraní verde/blanco/rojo."""
    H, W = px.shape[:2]
    Y, X = np.ogrid[:H, :W]
    d2 = (X - cx)**2 + (Y - cy)**2
    # Verde
    m = d2 <= r**2
    px[m] = [0.137, 0.624, 0.251, 1.0]
    # Blanco
    m = d2 <= (r * 0.68)**2
    px[m] = [1.0, 1.0, 1.0, 1.0]
    # Rojo
    m = d2 <= (r * 0.38)**2
    px[m] = [0.855, 0.0, 0.0, 1.0]

# ── Cargar flag ────────────────────────────────────────────────────────────────
flag_img = bpy.data.images.load(FLAG_PATH)
flag_img.pack()
FW, FH = flag_img.size
flag_px = np.array(flag_img.pixels[:], dtype=np.float32).reshape(FH, FW, 4)
flag_px = np.flipud(flag_px)   # y=0 arriba

def stamp_emblem(px, cx, cy, size):
    """
    Extrae el emblema (canal rojo) de la franja blanca del flag y lo estampa.
    Usa redness = R - max(G,B) con alpha proporcional.
    """
    # Crop: tercio central del flag (franja blanca)
    x0 = int(FW * 0.335); x1 = int(FW * 0.665)
    crop = flag_px[:, x0:x1, :]   # shape (FH, crop_w, 4)
    crop_h, crop_w = crop.shape[:2]

    half = size // 2
    H, W = px.shape[:2]

    for dy in range(-half, half + 1):
        for dx in range(-half, half + 1):
            tx = cx + dx
            ty = cy + dy
            if tx < 0 or ty < 0 or tx >= W or ty >= H:
                continue
            # Coordenadas en el crop
            fx = int((dx + half) / size * crop_w)
            fy = int((dy + half) / size * crop_h)
            fx = max(0, min(crop_w - 1, fx))
            fy = max(0, min(crop_h - 1, fy))
            r, g, b, a = crop[fy, fx]
            redness = r - max(g, b)
            if redness > 0.15:
                alpha = min(1.0, redness * 3.0)
                existing = px[ty, tx]
                px[ty, tx, 0] = 0.855 * alpha + existing[0] * (1 - alpha)
                px[ty, tx, 1] = 0.0   * alpha + existing[1] * (1 - alpha)
                px[ty, tx, 2] = 0.0   * alpha + existing[2] * (1 - alpha)
                px[ty, tx, 3] = 1.0

# ── 1. Borrar las 6 estrellas ─────────────────────────────────────────────────
stars = [
    (754, 183),   # cola
    ( 78, 568),   # cola
    ( 85, 426),   # ala top izq
    (542, 426),   # ala top der
    (428, 781),   # ala bot izq
    (871, 781),   # ala bot der
]
STAR_R = 16
for (x, y) in stars:
    fill_circle_inpaint(px, int(x * sx), int(y * sy), int(STAR_R * min(sx, sy)))
print("Estrellas borradas.")

# ── 2. Roundels en alas superiores ────────────────────────────────────────────
roundels_top = [
    ( 85, 426, 13),
    (542, 426, 13),
]
for (x, y, r) in roundels_top:
    draw_roundel(px, int(x * sx), int(y * sy), int(r * min(sx, sy)))
print("Roundels alas sup pintados.")

# ── 3. Emblema iraní — ala izquierda inferior ─────────────────────────────────
EMBLEM_SIZE = int(62 * min(sx, sy))
stamp_emblem(px, int(428 * sx), int(781 * sy), EMBLEM_SIZE)
print("Emblema pintado.")

# ── Guardar textura modificada ─────────────────────────────────────────────────
px_out = np.flipud(px).flatten().tolist()
new_img = bpy.data.images.new("airframe_iran", TW, TH, alpha=True)
new_img.pixels = px_out
tex_node.image = new_img

# ── Exportar GLB ───────────────────────────────────────────────────────────────
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format='GLB',
    export_image_format='AUTO',
)
print(f"Exportado: {GLB_OUT}")
