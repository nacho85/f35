"""
Renders each F-14 part from a consistent 3/4 perspective angle.
"""
import bpy, mathutils, math, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_parts"
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

meshes = sorted([o for o in bpy.context.scene.objects if o.type == "MESH"], key=lambda o: o.name)

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "FLAT"
scene.display.shading.color_type = "MATERIAL"
scene.render.resolution_x = 640
scene.render.resolution_y = 480
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("bg")
scene.world.use_nodes = False
scene.world.color = (0.12, 0.12, 0.15)

def hsv_color(i, n):
    c = mathutils.Color()
    c.hsv = (i / n, 0.9, 1.0)
    return (c.r, c.g, c.b, 1.0)

for i, obj in enumerate(meshes):
    mat = bpy.data.materials.new(f"p{i}")
    mat.use_nodes = False
    mat.diffuse_color = hsv_color(i, len(meshes))
    obj.data.materials.clear()
    obj.data.materials.append(mat)

bpy.ops.object.camera_add(location=(0, -30, 15))
cam = bpy.context.object
cam.data.type = "PERSP"
cam.data.lens = 50
scene.camera = cam

def frame_object(obj):
    bb = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    cx = sum(v.x for v in bb) / 8
    cy = sum(v.y for v in bb) / 8
    cz = sum(v.z for v in bb) / 8
    span = max(
        max(v.x for v in bb) - min(v.x for v in bb),
        max(v.y for v in bb) - min(v.y for v in bb),
        max(v.z for v in bb) - min(v.z for v in bb),
        0.5
    )
    # 3/4 view: from front-left-above
    dist = span * 2.5
    cam.location = mathutils.Vector((cx + dist*0.6, cy - dist, cz + dist*0.5))
    direction = mathutils.Vector((cx, cy, cz)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

print("\n=== RENDERING PARTS ===")
for i, target in enumerate(meshes):
    for obj in meshes:
        obj.hide_render = (obj != target)
        obj.hide_viewport = (obj != target)

    frame_object(target)
    dims = target.dimensions
    scene.render.filepath = f"{OUT_DIR}\part_{i:02d}_{target.name}.png"
    bpy.ops.render.render(write_still=True)
    print(f"  [{i:02d}] {target.name}  dims=({dims.x:.2f}, {dims.y:.2f}, {dims.z:.2f})")

# Full model colored overview — 3/4 perspective
for obj in meshes:
    obj.hide_render = False
    obj.hide_viewport = False

all_bb = [obj.matrix_world @ mathutils.Vector(c) for obj in meshes for c in obj.bound_box]
cx = sum(v.x for v in all_bb) / len(all_bb)
cy = sum(v.y for v in all_bb) / len(all_bb)
cz = sum(v.z for v in all_bb) / len(all_bb)
span = max(
    max(v.x for v in all_bb) - min(v.x for v in all_bb),
    max(v.y for v in all_bb) - min(v.y for v in all_bb),
    max(v.z for v in all_bb) - min(v.z for v in all_bb),
)
dist = span * 1.1
cam.location = mathutils.Vector((cx + dist*0.5, cy - dist, cz + dist*0.5))
direction = mathutils.Vector((cx, cy, cz)) - cam.location
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.filepath = f"{OUT_DIR}\overview_colored.png"
bpy.ops.render.render(write_still=True)

print(f"\nAll renders → {OUT_DIR}")
print("=== DONE ===\n")
