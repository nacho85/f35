import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_obj34"
# Also render with the main wings (27/28) for reference context
OBJECTS = ["Object_3", "Object_4", "Object_15", "Object_16", "Object_17", "Object_18",
           "Object_25", "Object_22", "Object_23"]
os.makedirs(OUT_DIR, exist_ok=True)

def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

def setup():
    sc=bpy.context.scene; sc.render.engine="BLENDER_EEVEE"
    sc.render.resolution_x=960; sc.render.resolution_y=640
    sc.render.film_transparent=True; sc.eevee.taa_render_samples=16
    # Multiple lights for better visibility
    for pos in [(8,8,15),(-8,8,15),(0,-10,10)]:
        sun=bpy.data.lights.new("S","SUN"); sun.energy=3
        so=bpy.data.objects.new("S",sun); bpy.context.scene.collection.objects.link(so)
        so.location=pos

def cam_3q():
    """3/4 perspective view — good for seeing surface panels"""
    cam=bpy.data.cameras.new("C"); cam.lens=35
    co=bpy.data.objects.new("C",cam); bpy.context.scene.collection.objects.link(co)
    co.location=(14, -10, 10); co.rotation_euler=(1.1, 0, 0.8)
    bpy.context.scene.camera=co

for name in OBJECTS:
    load(); setup()
    t=None
    for o in bpy.context.scene.objects:
        if o.type=="MESH":
            if o.name==name: t=o; o.hide_render=False
            else: o.hide_render=True
    if t is None: print(f"[skip] {name}"); continue
    cam_3q()
    bpy.context.scene.render.filepath=os.path.join(OUT_DIR,f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name}")
