"""Render specific objects alone (no background) to see their shape clearly."""
import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_solo"
os.makedirs(OUT_DIR, exist_ok=True)

OBJECTS = ["Object_17", "Object_2", "Object_19_C", "Object_20_C", "Object_16", "Object_26"]

def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

def setup():
    sc=bpy.context.scene; sc.render.engine="BLENDER_EEVEE"
    sc.render.resolution_x=640; sc.render.resolution_y=480
    sc.render.film_transparent=True; sc.eevee.taa_render_samples=8
    sun=bpy.data.lights.new("S","SUN"); sun.energy=6
    so=bpy.data.objects.new("S",sun); bpy.context.scene.collection.objects.link(so)
    so.location=(5,5,20)

def cam_ortho_top():
    cd=bpy.data.cameras.new("C"); cd.type="ORTHO"; cd.ortho_scale=12
    co=bpy.data.objects.new("C",cd); bpy.context.scene.collection.objects.link(co)
    co.location=(0,0,30); co.rotation_euler=(0,0,0)
    bpy.context.scene.camera=co

for name in OBJECTS:
    load(); setup()
    found=False
    for o in bpy.context.scene.objects:
        if o.type=="MESH":
            if o.name==name: o.hide_render=False; found=True
            else: o.hide_render=True
    if not found: print(f"[skip] {name}"); continue
    cam_ortho_top()
    bpy.context.scene.render.filepath=os.path.join(OUT_DIR,f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name}")
