"""
Renders each F-14 mesh isolated (all others hidden), saves numbered PNGs.
Uses Workbench renderer for fast flat-shaded output.
"""
import bpy, mathutils, math, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_parts"
os.makedirs(OUT_DIR, exist_ok=True)

# ── Clean & import ───────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

meshes = sorted([o for o in bpy.context.scene.objects if o.type == "MESH"], key=lambda o: o.name)

# ── Scene setup ──────────────────────────────────────────────────────────────
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "FLAT"
scene.display.shading.color_type = "MATERIAL"
scene.render.resolution_x = 640
scene.render.resolution_y = 400
scene.render.image_settings.file_format = "PNG"

# White background
scene.world = bpy.data.worlds.new("bg")
scene.world.use_nodes = False
scene.world.color = (1, 1, 1)

# Assign bright distinct colors
def hsv_color(i, n):
    c = mathutils.Color()
    c.hsv = (i / n, 0.85, 0.95)
    return (c.r, c.g, c.b, 1.0)

for i, obj in enumerate(meshes):
    mat = bpy.data.materials.new(f"p{i}")
    mat.use_nodes = False
    mat.diffuse_color = hsv_color(i, len(meshes))
    obj.data.materials.clear()
    obj.data.materials.append(mat)

# Camera
bpy.ops.object.camera_add(location=(0, -60, 8))
cam = bpy.context.object
scene.camera = cam
cam.data.type = "ORTHO"

# ── Render each part isolated ────────────────────────────────────────────────
print("\n=== RENDERING PARTS ===")
for i, target in enumerate(meshes):
    # Show only this object
    for obj in meshes:
        obj.hide_render = (obj != target)
        obj.hide_viewport = (obj != target)

    # Frame camera on this object
    bb = [target.matrix_world @ mathutils.Vector(c) for c in target.bound_box]
    cx = sum(v.x for v in bb) / 8
    cy = sum(v.y for v in bb) / 8
    cz = sum(v.z for v in bb) / 8
    size = max(
        max(v.x for v in bb) - min(v.x for v in bb),
        max(v.y for v in bb) - min(v.y for v in bb),
        max(v.z for v in bb) - min(v.z for v in bb),
    )
    cam.location = (cx, cy - max(size * 2, 5), cz)
    cam.data.ortho_scale = max(size * 1.5, 1.0)
    cam.rotation_euler = (math.pi/2, 0, 0)

    scene.render.filepath = f"{OUT_DIR}\part_{i:02d}_{target.name}.png"
    bpy.ops.render.render(write_still=True)
    dims = target.dimensions
    print(f"  [{i:02d}] {target.name}  dims=({dims.x:.2f}, {dims.y:.2f}, {dims.z:.2f})")

# Also do a full-model top view with all parts colored
for obj in meshes:
    obj.hide_render = False
    obj.hide_viewport = False

# Recalculate overall bounding box
all_bb = [obj.matrix_world @ mathutils.Vector(c) for obj in meshes for c in obj.bound_box]
cx = sum(v.x for v in all_bb) / len(all_bb)
cy = sum(v.y for v in all_bb) / len(all_bb)
cz = sum(v.z for v in all_bb) / len(all_bb)
span = max(
    max(v.x for v in all_bb) - min(v.x for v in all_bb),
    max(v.z for v in all_bb) - min(v.z for v in all_bb),
)

scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
cam.location = (cx, cy, cz + span * 1.2)
cam.data.ortho_scale = span * 1.1
cam.rotation_euler = (0, 0, 0)
scene.render.filepath = f"{OUT_DIR}\overview_top_colored.png"
bpy.ops.render.render(write_still=True)

# Side view
cam.location = (cx + span * 1.2, cy, cz)
cam.data.ortho_scale = span * 0.9
cam.rotation_euler = (math.pi/2, 0, math.pi/2)
scene.render.filepath = f"{OUT_DIR}\overview_side_colored.png"
bpy.ops.render.render(write_still=True)

print(f"\nAll renders saved to: {OUT_DIR}")
print("=== DONE ===\n")
