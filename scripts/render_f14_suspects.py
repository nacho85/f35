"""
Renders each "suspect" object in isolation (top view) to identify what they are.
Run with: blender --background --python scripts/render_f14_suspects.py
"""
import bpy
import mathutils
import os

GLB_PATH  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR   = r"C:\devs\f35\scripts\f14_suspects"

SUSPECTS  = ["Object_6", "Object_7", "Object_10", "Object_19", "Object_20", "Object_21",
             "Object_3", "Object_4"]

os.makedirs(OUT_DIR, exist_ok=True)

def load_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

def setup_render():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = 800
    sc.render.resolution_y = 600
    sc.render.film_transparent = True
    sc.eevee.taa_render_samples = 4

def place_camera_top(objects):
    """Put camera above centroid looking down."""
    all_corners = []
    for obj in objects:
        for c in obj.bound_box:
            all_corners.append(obj.matrix_world @ mathutils.Vector(c))
    cx = sum(v.x for v in all_corners) / len(all_corners)
    cy = sum(v.y for v in all_corners) / len(all_corners)
    cz = sum(v.z for v in all_corners) / len(all_corners)
    mx = max(abs(v.x - cx) for v in all_corners)
    my = max(abs(v.y - cy) for v in all_corners)
    dist = max(mx, my) * 2.5 + 2

    cam_data = bpy.data.cameras.new("TopCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(mx, my) * 2.5
    cam_obj = bpy.data.objects.new("TopCam", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    cam_obj.location = (cx, cy, cz + dist)
    cam_obj.rotation_euler = (0, 0, 0)
    bpy.context.scene.camera = cam_obj

    sun = bpy.data.lights.new("Sun", "SUN")
    sun_obj = bpy.data.objects.new("Sun", sun)
    bpy.context.scene.collection.objects.link(sun_obj)
    sun_obj.location = (cx + 5, cy + 5, cz + 20)

for name in SUSPECTS:
    load_scene()
    setup_render()

    # Hide all objects except the suspect
    target = None
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            if obj.name == name:
                target = obj
                obj.hide_render = False
            else:
                obj.hide_render = True

    if target is None:
        print(f"[skip] {name} not found")
        continue

    place_camera_top([target])

    out_path = os.path.join(OUT_DIR, f"{name}.png")
    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name} → {out_path}")

print("Done.")
