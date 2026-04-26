"""
Pinta 4 variantes de la bandera en la textura del MiG-29 y renderiza la cola.
Usa un enfoque más directo: bake sobre la textura y override material.
"""
import bpy, mathutils, os, math

GLB_PATH  = r"C:\devs\f35\public\mig-29.glb"
FLAG_PATH = r"C:\devs\f35\public\iranian_flag.png"
OUT_DIR   = r"C:\devs\f35\scripts\mig29_parts"
os.makedirs(OUT_DIR, exist_ok=True)

# ── Clean & import ────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
meshes.sort(key=lambda o: o.name)

# ── Find model bounds ─────────────────────────────────────────────────────────
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
cx = (min_x + max_x) / 2
cy = (min_y + max_y) / 2
cz = (min_z + max_z) / 2
size = max(max_x-min_x, max_y-min_y, max_z-min_z)

print(f"Bounds: X=[{min_x:.1f},{max_x:.1f}] Y=[{min_y:.1f},{max_y:.1f}] Z=[{min_z:.1f},{max_z:.1f}]")

# ── Find airframe mesh and its texture ───────────────────────────────────────
airframe_mat = None
airframe_tex_node = None
for o in meshes:
    for mat in o.data.materials:
        if mat and "airframe" in mat.name.lower() and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    airframe_mat = mat
                    airframe_tex_node = node
                    break
        if airframe_tex_node:
            break
    if airframe_tex_node:
        break

if airframe_tex_node:
    orig_img = airframe_tex_node.image
    print(f"Found texture: {orig_img.name}  size={orig_img.size[:]}")
else:
    print("ERROR: no airframe texture found!")
    raise SystemExit(1)

TW, TH = orig_img.size
tex_px = list(orig_img.pixels)  # RGBA float, row0=BOTTOM

# ── Load flag image ───────────────────────────────────────────────────────────
flag_img = bpy.data.images.load(FLAG_PATH)
flag_img.pack()
FW, FH = flag_img.size
flag_px = list(flag_img.pixels)
print(f"Flag image size: {FW}x{FH}")

def get_flag_pixel(fx, fy):
    if fx < 0 or fx >= FW or fy < 0 or fy >= FH:
        return (0, 0, 0, 0)
    idx = (fy * FW + fx) * 4
    return (flag_px[idx], flag_px[idx+1], flag_px[idx+2], flag_px[idx+3])

def stamp_flag(tex_cx, tex_cy, stamp_w, stamp_h, rotation_deg=0):
    """Stamp flag at (tex_cx, tex_cy) in texture pixel coords (y=0=BOTTOM)."""
    for dy in range(-stamp_h//2, stamp_h//2 + 1):
        for dx in range(-stamp_w//2, stamp_w//2 + 1):
            nx = (dx + 0.5) / stamp_w
            ny = (dy + 0.5) / stamp_h
            ang = math.radians(-rotation_deg)
            cos_a, sin_a = math.cos(ang), math.sin(ang)
            src_nx = nx * cos_a + ny * sin_a
            src_ny = -nx * sin_a + ny * cos_a
            src_x = int((src_nx + 0.5) * FW)
            src_y = int((src_ny + 0.5) * FH)
            r, g, b, a = get_flag_pixel(src_x, src_y)
            if a > 0.05:
                tx = tex_cx + dx
                ty = tex_cy + dy
                if 0 <= tx < TW and 0 <= ty < TH:
                    idx = (ty * TW + tx) * 4
                    tex_px[idx]   = r
                    tex_px[idx+1] = g
                    tex_px[idx+2] = b
                    tex_px[idx+3] = 1.0

# ── Stamp flag variants at the two cola positions ─────────────────────────────
# Canvas coords from code → texture pixel (y flipped because Blender row0=bottom)
sx = TW / 1024
sy = TH / 1024

# Position A: canvas(755, 183), flag size fw=55*sx x fh=38*sy
# Currently in code: no rotation
A_cx = int(755 * sx)
A_cy = TH - int(183 * sy)   # canvas top → texture bottom → flip
A_fw = int(55 * sx)
A_fh = int(38 * sy)
print(f"\nPosition A: tex pixel ({A_cx},{A_cy}), stamp {A_fw}x{A_fh}")

# Position B: canvas(80, 569), flag size fh=38*sy x fw=55*sy (swapped in code)
# Currently in code: rotate90=true
B_cx = int(80 * sx)
B_cy = TH - int(569 * sy)
B_fw = int(38 * sx)  # swapped
B_fh = int(55 * sy)
print(f"Position B: tex pixel ({B_cx},{B_cy}), stamp {B_fw}x{B_fh}")

# Stamp position A with rotation=90 CCW (to get green on top)
# The flag PNG has green on LEFT → after 90 CCW → green on TOP
stamp_flag(A_cx, A_cy, A_fw, A_fh, rotation_deg=90)    # 90 CCW in our function = pass 90

# Stamp position B with rotation=-90 CW = 90 CCW
# Right fin UV might be mirrored → try -90
stamp_flag(B_cx, B_cy, B_fw, B_fh, rotation_deg=-90)

# ── Create new image with modified pixels ─────────────────────────────────────
new_img = bpy.data.images.new("airframe_modified", TW, TH, alpha=True)
new_img.pixels = tex_px
out_tex = os.path.join(OUT_DIR, "airframe_with_flags.png")
new_img.filepath_raw = out_tex
new_img.file_format = "PNG"
new_img.save()
print(f"Saved modified texture: {out_tex}")

# ── Override the airframe texture with modified image ─────────────────────────
airframe_tex_node.image = new_img
print("Texture overridden in material.")

# ── Lighting ──────────────────────────────────────────────────────────────────
bpy.ops.object.light_add(type="SUN", location=(0, 100, 100))
sun = bpy.context.object
sun.data.energy = 4
sun.rotation_euler = (0.5, 0, 0.5)

bpy.ops.object.light_add(type="SUN", location=(0, -100, 100))
sun2 = bpy.context.object
sun2.data.energy = 2
sun2.rotation_euler = (2.6, 0, 0.5)

# ── Scene settings ────────────────────────────────────────────────────────────
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.image_settings.file_format = "PNG"

scene.world = bpy.data.worlds.new("bg_w")
scene.world.use_nodes = False
scene.world.color = (0.05, 0.05, 0.08)

def add_camera(location, target, filepath):
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.object
    direction = mathutils.Vector(target) - mathutils.Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print(f"Saved: {filepath}")

# Tail fin area is near min_x (tail)
# Camera from behind+right+above looking at tail fins
tail_cx = min_x + (max_x - min_x) * 0.25  # 25% from tail end
tail_cz = cz + (max_z - min_z) * 0.3

D = size * 0.4

# View 1: from behind the tail (max_y direction, since Y seems to be lateral)
add_camera(
    (tail_cx, cy - D*1.5, tail_cz + D*0.8),
    (tail_cx, cy, tail_cz),
    os.path.join(OUT_DIR, "tail_rear.png")
)

# View 2: right side of tail
add_camera(
    (tail_cx, cy + D*1.2, tail_cz + D*0.5),
    (tail_cx, cy, tail_cz),
    os.path.join(OUT_DIR, "tail_right.png")
)

# View 3: left side of tail
add_camera(
    (tail_cx, cy - D*1.2, tail_cz + D*0.5),
    (tail_cx, cy, tail_cz),
    os.path.join(OUT_DIR, "tail_left.png")
)

print("=== ALL DONE ===")
