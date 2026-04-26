import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_glove"
# Candidates with |X| between 2-5m that might be the glove panels
OBJECTS  = ["Object_14_R", "Object_14_L", "Object_14_C",
            "Object_12", "Object_11", "Object_26"]

os.makedirs(OUT_DIR, exist_ok=True)

def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

def setup():
    sc=bpy.context.scene; sc.render.engine="BLENDER_EEVEE"
    sc.render.resolution_x=960; sc.render.resolution_y=640
    sc.render.film_transparent=True; sc.eevee.taa_render_samples=8
    sun=bpy.data.lights.new("S","SUN"); sun.energy=6
    so=bpy.data.objects.new("S",sun); bpy.context.scene.collection.objects.link(so)
    so.location=(5,5,20)

def cam_wide():
    cd=bpy.data.cameras.new("C"); cd.type="ORTHO"; cd.ortho_scale=18
    co=bpy.data.objects.new("C",cd); bpy.context.scene.collection.objects.link(co)
    co.location=(0,2,30); co.rotation_euler=(0,0,0); bpy.context.scene.camera=co

for name in OBJECTS:
    load(); setup()
    t=None
    for o in bpy.context.scene.objects:
        if o.type=="MESH":
            if o.name==name: t=o; o.hide_render=False
            else: o.hide_render=True
    if t is None: print(f"[skip] {name}"); continue
    cam_wide()
    bpy.context.scene.render.filepath=os.path.join(OUT_DIR,f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name}")
