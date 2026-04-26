"""
Renders the F-14 with each mesh in a unique color + text label.
Outputs: top, side, front, and perspective views as PNGs.
"""
import bpy, mathutils, math

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_parts"

# ── 1. Clean scene ──────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)

# ── 2. Import GLB ───────────────────────────────────────────────────────────
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
meshes.sort(key=lambda o: o.name)

# ── 3. Distinct colors (HSV rainbow) ────────────────────────────────────────
def hsv_color(i, n):
    h = i / n
    c = mathutils.Color()
    c.hsv = (h, 0.9, 1.0)
    return (c.r, c.g, c.b, 1.0)

for i, obj in enumerate(meshes):
    color = hsv_color(i, len(meshes))
    mat = bpy.data.materials.new(name=f"part_{i}")
    mat.use_nodes = False
    mat.diffuse_color = color
    obj.data.materials.clear()
    obj.data.materials.append(mat)

# ── 4. Add text labels at each mesh center ───────────────────────────────────
for i, obj in enumerate(meshes):
    center = obj.location.copy()
    # offset slightly above bounding box top
    bb_top = max((obj.matrix_world @ mathutils.Vector(c)).z for c in obj.bound_box)
    bpy.ops.object.text_add(location=(center.x, center.y, bb_top + 0.3))
    txt = bpy.context.object
    txt.data.body = obj.name.replace("Object_", "")
    txt.data.size = 0.35
    txt.data.align_x = "CENTER"
    mat_t = bpy.data.materials.new(f"txt_{i}")
    mat_t.use_nodes = False
    mat_t.diffuse_color = hsv_color(i, len(meshes))
    txt.data.materials.clear()
    txt.data.materials.append(mat_t)

# ── 5. Lighting ──────────────────────────────────────────────────────────────
bpy.ops.object.light_add(type="SUN", location=(0, 0, 50))
sun = bpy.context.object
sun.data.energy = 3

# ── 6. Render setup ──────────────────────────────────────────────────────────
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("bg")
scene.world.use_nodes = False
scene.world.color = (0.05, 0.05, 0.08)

# bounding box of whole model
all_verts = []
for obj in meshes:
    for c in obj.bound_box:
        all_verts.append(obj.matrix_world @ mathutils.Vector(c))
min_v = mathutils.Vector((min(v.x for v in all_verts), min(v.y for v in all_verts), min(v.z for v in all_verts)))
max_v = mathutils.Vector((max(v.x for v in all_verts), max(v.y for v in all_verts), max(v.z for v in all_verts)))
center = (min_v + max_v) / 2
size   = max((max_v - min_v).length, 1)

# ── 7. Camera helper ─────────────────────────────────────────────────────────
def render_view(name, location, point_at):
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.object
    scene.camera = cam
    direction = mathutils.Vector(point_at) - mathutils.Vector(location)
    rot_quat  = direction.to_track_quat("-Z", "Y")
    cam.rotation_euler = rot_quat.to_euler()
    scene.render.filepath = f"{OUT_DIR}\{name}.png"
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)

D = size * 1.4
C = center

render_view("top",  (C.x,      C.y,      C.z + D*1.1), C[:])
render_view("side", (C.x + D,  C.y,      C.z + D*0.3), C[:])
render_view("front",(C.x,      C.y - D,  C.z + D*0.2), C[:])
render_view("persp",(C.x + D*0.7, C.y - D*0.7, C.z + D*0.6), C[:])

# ── 8. Print legend ──────────────────────────────────────────────────────────
print("\n=== F-14 PART MAP ===")
for i, obj in enumerate(meshes):
    dims = obj.dimensions
    print(f"  [{i:02d}] {obj.name:12s}  dims=({dims.x:.2f}, {dims.y:.2f}, {dims.z:.2f})")
print(f"\nRenders saved to: {OUT_DIR}")
print("=== END ===\n")
