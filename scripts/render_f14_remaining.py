"""
Renders all mesh objects together but highlighted individually to find the remaining
fixed wing pieces. Also renders Object_19 and the _C center pieces from the split.
Run with: blender --background --python scripts/render_f14_remaining.py
"""
import bpy
import mathutils
import os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_suspects2"

# Objects to inspect individually
SUSPECTS = [
    "Object_19",
    "Object_10_C", "Object_10_R", "Object_10_L",
    "Object_21_C", "Object_21_R", "Object_21_L",
    "Object_20",
]

os.makedirs(OUT_DIR, exist_ok=True)

def load_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

def setup_render():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = 960
    sc.render.resolution_y = 640
    sc.render.film_transparent = True
    sc.eevee.taa_render_samples = 4

def add_lights():
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 5
    sun_obj = bpy.data.objects.new("Sun", sun)
    bpy.context.scene.collection.objects.link(sun_obj)
    sun_obj.location = (10, 10, 20)

def place_top_camera(objects):
    corners = []
    for obj in objects:
        for c in obj.bound_box:
            corners.append(obj.matrix_world @ mathutils.Vector(c))
    if not corners:
        return
    cx = sum(v.x for v in corners) / len(corners)
    cy = sum(v.y for v in corners) / len(corners)
    cz = sum(v.z for v in corners) / len(corners)
    mx = max(abs(v.x - cx) for v in corners)
    my = max(abs(v.y - cy) for v in corners)
    half = max(mx, my, 3) * 1.4

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = half * 2
    cam_obj = bpy.data.objects.new("Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    cam_obj.location = (cx, cy, cz + 30)
    cam_obj.rotation_euler = (0, 0, 0)
    bpy.context.scene.camera = cam_obj

for name in SUSPECTS:
    load_scene()
    setup_render()
    add_lights()

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

    place_top_camera([target])
    out_path = os.path.join(OUT_DIR, f"{name}.png")
    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name} → {out_path}")

# Also render a combined view: show all objects that should sweep (Object_27/28 + extras) vs the rest
print("\nDone.")
