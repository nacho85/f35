"""
Pinta la bandera iraní en la textura del MiG-29 en 4 variantes distintas
y hace un render de la cola para ver cuál queda bien.

Variantes:
  A) flag_A sin rotación
  B) flag_A rotada 90° CW
  C) flag_A rotada 90° CCW
  D) flag_A rotada 180°

Cada variante es una zona del timón izquierdo.
"""
import bpy, mathutils, os, math

GLB_PATH  = r"C:\devs\f35\public\mig-29.glb"
FLAG_PATH = r"C:\devs\f35\public\iranian_flag.png"
TEX_PATH  = r"C:\devs\f35\public\mig29_airframe.png"
OUT_DIR   = r"C:\devs\f35\scripts\mig29_parts"
os.makedirs(OUT_DIR, exist_ok=True)

# ── Load scene ────────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)

bpy.ops.import_scene.gltf(filepath=GLB_PATH)

# ── Find tail fins: meshes with airframe material, narrow in Y (fin-like) ────
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

# Find model extents
all_pts = []
for o in meshes:
    for c in o.bound_box:
        all_pts.append(o.matrix_world @ mathutils.Vector(c))
min_x = min(v.x for v in all_pts)
max_x = max(v.x for v in all_pts)
min_y = min(v.y for v in all_pts)
max_y = max(v.y for v in all_pts)
min_z = min(v.z for v in all_pts)
max_z = max(v.z for v in all_pts)

print(f"Model X=[{min_x:.1f},{max_x:.1f}] Y=[{min_y:.1f},{max_y:.1f}] Z=[{min_z:.1f},{max_z:.1f}]")

# Print all airframe mesh extents
for o in meshes:
    if not any(m and "airframe" in m.name.lower() for m in o.data.materials):
        continue
    pts = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    ox = [v.x for v in pts]; oy = [v.y for v in pts]; oz = [v.z for v in pts]
    print(f"  {o.name}: X=[{min(ox):.1f},{max(ox):.1f}] Y=[{min(oy):.1f},{max(oy):.1f}] Z=[{min(oz):.1f},{max(oz):.1f}]")

# ── Load the flag image and the airframe texture ──────────────────────────────
flag_img = bpy.data.images.load(FLAG_PATH)
flag_img.pack()
FW, FH = flag_img.size
flag_px = list(flag_img.pixels)  # RGBA float, row0=bottom

def get_flag_pixel(fx, fy):
    """Get RGBA of flag at pixel (fx, fy) where fy=0 is bottom."""
    if fx < 0 or fx >= FW or fy < 0 or fy >= FH:
        return (0,0,0,0)
    idx = (fy * FW + fx) * 4
    return (flag_px[idx], flag_px[idx+1], flag_px[idx+2], flag_px[idx+3])

tex_img = bpy.data.images.load(TEX_PATH)
tex_img.pack()
TW, TH = tex_img.size
tex_px = list(tex_img.pixels)  # RGBA float, row0=bottom

def set_tex_pixel(tx, ty, r, g, b, a=1.0):
    if 0 <= tx < TW and 0 <= ty < TH:
        idx = (ty * TW + tx) * 4
        tex_px[idx]   = r * a + tex_px[idx]   * (1-a)
        tex_px[idx+1] = g * a + tex_px[idx+1] * (1-a)
        tex_px[idx+2] = b * a + tex_px[idx+2] * (1-a)
        tex_px[idx+3] = max(tex_px[idx+3], a)

def stamp_flag_on_tex(tex_cx, tex_cy, stamp_w, stamp_h, rotation_deg=0, label=""):
    """
    Stamp the flag image onto the texture at tex_cx, tex_cy (pixel coords, y=0 bottom).
    stamp_w, stamp_h: size in pixels on texture.
    rotation_deg: 0, 90, -90, or 180.
    """
    print(f"  Stamping {label} at ({tex_cx},{tex_cy}) size={stamp_w}x{stamp_h} rot={rotation_deg}")
    for dy in range(-stamp_h//2, stamp_h//2):
        for dx in range(-stamp_w//2, stamp_w//2):
            # Normalize to [-0.5, 0.5]
            nx = (dx + 0.5) / stamp_w
            ny = (dy + 0.5) / stamp_h
            # Apply reverse rotation to find source pixel in flag
            ang = math.radians(-rotation_deg)
            cos_a, sin_a = math.cos(ang), math.sin(ang)
            src_nx =  nx * cos_a + ny * sin_a
            src_ny = -nx * sin_a + ny * cos_a
            # Back to pixel coords in flag (y=0 bottom)
            src_x = int((src_nx + 0.5) * FW)
            src_y = int((src_ny + 0.5) * FH)
            r, g, b, a = get_flag_pixel(src_x, src_y)
            if a > 0.1:
                set_tex_pixel(tex_cx + dx, tex_cy + dy, r, g, b, a)

# ── Current flag positions (from Mig29.jsx, in canvas coords y=0=top) ─────────
# Convert canvas→texture pixel: tex_y = TH - canvas_y (because row0 is bottom in Blender)
# Flag A: canvas(755, 183), size fw=55*sx, fh=38*sy  (sx=sy=TW/1024)
sx = TW / 1024
sy = TH / 1024
fw_a = int(55 * sx)
fh_a = int(38 * sy)
canvas_ax, canvas_ay = 755, 183
tex_ax = int(canvas_ax * sx)
tex_ay = TH - int(canvas_ay * sy)   # flip y

fw_b = int(38 * sx)  # swapped w/h for rotate90
fh_b = int(55 * sy)
canvas_bx, canvas_by = 80, 569
tex_bx = int(canvas_bx * sx)
tex_by = TH - int(canvas_by * sy)

print(f"\nFlag A (no-rot): canvas({canvas_ax},{canvas_ay}) → tex({tex_ax},{tex_ay})")
print(f"Flag B (rot90):  canvas({canvas_bx},{canvas_by}) → tex({tex_bx},{tex_by})")

# Stamp 4 variants of flag A in different spots near the actual position
# (spread out so they don't overlap and we can see each)
variants = [
    (tex_ax,        tex_ay,         fw_a, fh_a,   0, "A_rot0"),
    (tex_ax,        tex_ay + 60,    fw_a, fh_a,  90, "A_rot90CW"),
    (tex_ax,        tex_ay + 120,   fw_a, fh_a, -90, "A_rot90CCW"),
    (tex_ax,        tex_ay + 180,   fw_a, fh_a, 180, "A_rot180"),
]
for v in variants:
    stamp_flag_on_tex(*v)

# Also stamp B position with 4 variants
variants_b = [
    (tex_bx,        tex_by,         fw_b, fh_b,   0, "B_rot0"),
    (tex_bx,        tex_by + 70,    fw_b, fh_b,  90, "B_rot90CW"),
    (tex_bx,        tex_by + 140,   fw_b, fh_b, -90, "B_rot90CCW"),
    (tex_bx,        tex_by + 210,   fw_b, fh_b, 180, "B_rot180"),
]
for v in variants_b:
    stamp_flag_on_tex(*v)

# ── Save modified texture ─────────────────────────────────────────────────────
tex_img.pixels = tex_px
out_tex_path = os.path.join(OUT_DIR, "mig29_flag_test_texture.png")
tex_img.filepath_raw = out_tex_path
tex_img.file_format = "PNG"
tex_img.save()
print(f"\nModified texture saved: {out_tex_path}")

# ── Apply modified texture to the model ──────────────────────────────────────
for obj in meshes:
    for mat in obj.data.materials:
        if mat and "airframe" in mat.name.lower():
            if mat.use_nodes:
                for node in mat.node_tree.nodes:
                    if node.type == "TEX_IMAGE" and node.image:
                        node.image.filepath_raw = out_tex_path
                        node.image.reload()
            # Also directly set the image
            mat.use_nodes = True  # ensure nodes

# ── Render tail area ──────────────────────────────────────────────────────────
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.image_settings.file_format = "PNG"

# Try cycles if available, fallback to EEVEE
try:
    scene.cycles.device = "GPU"
except:
    pass

scene.world = bpy.data.worlds.new("bg_w")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.05, 0.05, 0.08, 1.0)
bg.inputs[1].default_value = 0.1

bpy.ops.object.light_add(type="SUN", location=(50, 50, 80))
sun = bpy.context.object
sun.data.energy = 3
sun.rotation_euler = (0.3, 0.2, 0.8)

# Camera looking at tail from rear-right
# Model X is nose→tail, tail is at max X
tail_x = max_x
tail_z = (min_z + max_z) / 2 + (max_z - min_z) * 0.3
cam_pos = (tail_x + 30, max_y * 0.5, tail_z + 20)
cam_target = (tail_x - 20, 0, tail_z)

bpy.ops.object.camera_add(location=cam_pos)
cam = bpy.context.object
scene.camera = cam
direction = mathutils.Vector(cam_target) - mathutils.Vector(cam_pos)
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

scene.render.filepath = os.path.join(OUT_DIR, "flag_variants_tail.png")
bpy.ops.render.render(write_still=True)
print(f"Render saved: {scene.render.filepath}")
print("=== DONE ===")
