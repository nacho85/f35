"""
Prueba la corrección definitiva: flipH en flag A (la que mapea X-textura = vertical del timón).
Pinta UNA sola bandera con flip horizontal en la posición A y renders limpios.
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
print(f"Flag: {FW}x{FH}, Tex: {TW}x{TH}")

def get_flag_px(fx, fy):
    if 0 <= fx < FW and 0 <= fy < FH:
        idx = (fy * FW + fx) * 4
        return flag_px[idx], flag_px[idx+1], flag_px[idx+2], flag_px[idx+3]
    return 0, 0, 0, 0

def stamp(tex_cx, tex_cy, sw, sh, rot_deg=0, flip_h=False, flip_v=False):
    """
    Stamp the flag centered at (tex_cx, tex_cy) in texture pixel coords (y=0=bottom).
    rot_deg: rotation of the stamp (positive = CCW in standard math)
    flip_h: mirror horizontally (left-right)
    flip_v: mirror vertically (up-down)
    """
    ang = math.radians(-rot_deg)
    ca, sa = math.cos(ang), math.sin(ang)
    for dy in range(-sh//2, sh//2+1):
        for dx in range(-sw//2, sw//2+1):
            nx = (dx + 0.5) / sw
            ny = (dy + 0.5) / sh
            # Reverse rotation to find source UV
            src_nx =  nx * ca + ny * sa
            src_ny = -nx * sa + ny * ca
            # Apply flips
            if flip_h: src_nx = -src_nx
            if flip_v: src_ny = -src_ny
            fx = int((src_nx + 0.5) * FW)
            fy = int((src_ny + 0.5) * FH)
            r, g, b, a = get_flag_px(fx, fy)
            if a > 0.05:
                tx, ty = tex_cx + dx, tex_cy + dy
                if 0 <= tx < TW and 0 <= ty < TH:
                    idx = (ty * TW + tx) * 4
                    tex_px[idx], tex_px[idx+1], tex_px[idx+2], tex_px[idx+3] = r, g, b, 1.0

sx = TW / 1024
sy = TH / 1024

# Flag A: left fin inner face (right-facing surface)
A_cx = int(755 * sx)
A_cy = TH - int(183 * sy)  # canvas y → tex y (flip)
A_fw = int(55 * sx)
A_fh = int(38 * sy)

# Flag B: right fin (needs rotation for mirrored UV)
B_cx = int(80 * sx)
B_cy = TH - int(569 * sy)
B_fw = int(38 * sx)
B_fh = int(55 * sy)

print(f"Flag A: tex({A_cx},{A_cy}) size={A_fw}x{A_fh}")
print(f"Flag B: tex({B_cx},{B_cy}) size={B_fw}x{B_fh}")

# The fin UV has texture-X running vertically (low X → fin bottom, high X → fin top)
# Flag PNG: green on LEFT (low X), red on RIGHT (high X)
# Without fix: green → bottom, red → top (WRONG)
# Fix: flip_h=True → green goes to RIGHT (high X) → top (CORRECT)
stamp(A_cx, A_cy, A_fw, A_fh, rot_deg=0, flip_h=True, flip_v=False)

# Flag B: right fin. The right fin UV likely mirrors the left (high X → bottom).
# Try flip_h=False (no flip needed since mirroring reverses the orientation):
stamp(B_cx, B_cy, B_fw, B_fh, rot_deg=-90, flip_h=True, flip_v=False)

# Save
new_img = bpy.data.images.new("final_tex", TW, TH, alpha=True)
new_img.pixels = tex_px
out_tex = os.path.join(OUT_DIR, "final_texture.png")
new_img.filepath_raw = out_tex
new_img.file_format = "PNG"
new_img.save()
airframe_tex_node.image = new_img
print(f"Texture saved: {out_tex}")

# Lighting
bpy.ops.object.light_add(type="SUN", location=(0, -100, 100))
bpy.context.object.data.energy = 5
bpy.context.object.rotation_euler = (0.4, 0, 0.8)
bpy.ops.object.light_add(type="SUN", location=(100, 0, 100))
bpy.context.object.data.energy = 2

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("bg")
scene.world.use_nodes = False
scene.world.color = (0.04, 0.04, 0.07)

all_pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
min_x = min(v.x for v in all_pts); max_x = max(v.x for v in all_pts)
min_y = min(v.y for v in all_pts); max_y = max(v.y for v in all_pts)
min_z = min(v.z for v in all_pts); max_z = max(v.z for v in all_pts)
cy_m = (min_y + max_y) / 2
tail_x = min_x + (max_x - min_x) * 0.15
tail_z = (min_z + max_z) / 2 + (max_z - min_z) * 0.35
D = (max_x - min_x) * 0.32

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

# View from the right (inner face of left fin, where flag A is)
render("final_right.png", (tail_x, cy_m + D*1.4, tail_z + D*0.4), (tail_x, cy_m, tail_z))
# View from the left (where flag B might be visible)
render("final_left.png",  (tail_x, cy_m - D*1.4, tail_z + D*0.4), (tail_x, cy_m, tail_z))

print("=== DONE ===")
