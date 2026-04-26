"""
Pinta 4 variantes de la bandera iraní en el timón izquierdo (flag A position)
y renderiza para ver cuál queda con rayas horizontales y verde arriba.

Cada variante se pinta ligeramente desplazada en el UV para poder compararlas.
Variante 1: rot=0    (original sin rotación)
Variante 2: rot=90   (90° CW)
Variante 3: rot=-90  (90° CCW)
Variante 4: rot=180  (flip completo)
"""
import bpy, mathutils, os, math

GLB_PATH  = r"C:\devs\f35\public\mig-29.glb"
FLAG_PATH = r"C:\devs\f35\public\iranian_flag.png"
OUT_DIR   = r"C:\devs\f35\scripts\mig29_parts"
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

# Find airframe texture
airframe_tex_node = None
for o in meshes:
    for mat in o.data.materials:
        if mat and "airframe" in mat.name.lower() and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    airframe_tex_node = node
                    break
        if airframe_tex_node: break
    if airframe_tex_node: break

orig_img = airframe_tex_node.image
TW, TH = orig_img.size
tex_px = list(orig_img.pixels)

flag_img = bpy.data.images.load(FLAG_PATH)
flag_img.pack()
FW, FH = flag_img.size
flag_px = list(flag_img.pixels)
print(f"Flag: {FW}x{FH}, Texture: {TW}x{TH}")

def get_flag_px(fx, fy):
    if 0 <= fx < FW and 0 <= fy < FH:
        idx = (fy * FW + fx) * 4
        return flag_px[idx], flag_px[idx+1], flag_px[idx+2], flag_px[idx+3]
    return 0, 0, 0, 0

def stamp(tex_cx, tex_cy, sw, sh, rot_deg):
    ang = math.radians(-rot_deg)
    ca, sa = math.cos(ang), math.sin(ang)
    for dy in range(-sh//2, sh//2+1):
        for dx in range(-sw//2, sw//2+1):
            nx = (dx + 0.5) / sw
            ny = (dy + 0.5) / sh
            src_nx =  nx * ca + ny * sa
            src_ny = -nx * sa + ny * ca
            fx = int((src_nx + 0.5) * FW)
            fy = int((src_ny + 0.5) * FH)
            r, g, b, a = get_flag_px(fx, fy)
            if a > 0.05:
                tx, ty = tex_cx + dx, tex_cy + dy
                if 0 <= tx < TW and 0 <= ty < TH:
                    idx = (ty * TW + tx) * 4
                    tex_px[idx], tex_px[idx+1], tex_px[idx+2], tex_px[idx+3] = r, g, b, 1.0

# Flag A position: canvas(755, 183) → tex pixel (y=0=bottom)
sx = TW / 1024
A_cx = int(755 * sx)
sy = TH / 1024
A_cy = TH - int(183 * sy)
A_fw = int(55 * sx)
A_fh = int(38 * TH / 1024)

# 4 variants stacked vertically in UV, each separated by ~50 pixels in texture V
# The fin UV region is near (755, 841) in tex coords (y=0=bottom)
# Spread vertically so all 4 are visible on the fin face
offsets_v = [+70, +20, -30, -80]  # offset from center in texture pixels (positive = up)
rotations = [0, 90, -90, 180]
labels    = ["rot=0", "rot=90CW", "rot=90CCW", "rot=180"]

for i, (ov, rot, lbl) in enumerate(zip(offsets_v, rotations, labels)):
    cx = A_cx
    cy = A_cy + ov
    print(f"  Variant {i+1} ({lbl}): tex({cx},{cy})")
    stamp(cx, cy, A_fw, A_fh, rot)

# Apply modified texture
new_img = bpy.data.images.new("mod_tex", TW, TH, alpha=True)
new_img.pixels = tex_px
out_tex = os.path.join(OUT_DIR, "4variants_texture.png")
new_img.filepath_raw = out_tex
new_img.file_format = "PNG"
new_img.save()
airframe_tex_node.image = new_img
print(f"Texture saved: {out_tex}")

# Lighting
bpy.ops.object.light_add(type="SUN", location=(0, -100, 100))
bpy.context.object.data.energy = 5
bpy.context.object.rotation_euler = (0.5, 0, 1.0)

# Scene
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("bg")
scene.world.use_nodes = False
scene.world.color = (0.05, 0.05, 0.08)

# Find tail area: look at model bounds
all_pts = []
for o in meshes:
    for c in o.bound_box:
        all_pts.append(o.matrix_world @ mathutils.Vector(c))
min_x = min(v.x for v in all_pts); max_x = max(v.x for v in all_pts)
min_y = min(v.y for v in all_pts); max_y = max(v.y for v in all_pts)
min_z = min(v.z for v in all_pts); max_z = max(v.z for v in all_pts)
cx_m = (min_x + max_x) / 2
cy_m = (min_y + max_y) / 2
cz_m = (min_z + max_z) / 2

# Tail is at low X (min_x side), based on earlier analysis nose=right=max_x
tail_x = min_x + (max_x - min_x) * 0.15
tail_z = cz_m + (max_z - min_z) * 0.4
D = (max_x - min_x) * 0.35

def render(name, cam_loc, target):
    bpy.ops.object.camera_add(location=cam_loc)
    cam = bpy.context.object
    scene.camera = cam
    d = mathutils.Vector(target) - mathutils.Vector(cam_loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT_DIR, name)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print(f"Saved: {name}")

# Left-side view (looking from -Y toward +Y, tail of aircraft)
render("4v_left.png",   (tail_x, cy_m - D*1.5, tail_z + D*0.3), (tail_x, cy_m, tail_z))
render("4v_right.png",  (tail_x, cy_m + D*1.5, tail_z + D*0.3), (tail_x, cy_m, tail_z))

print("=== DONE ===")
