import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_centers"
OBJECTS  = ["Object_7_C", "Object_6_C", "Object_10_C", "Object_21_C"]

os.makedirs(OUT_DIR, exist_ok=True)

def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

def setup():
    sc=bpy.context.scene; sc.render.engine="BLENDER_EEVEE"
    sc.render.resolution_x=960; sc.render.resolution_y=640
    sc.render.film_transparent=True; sc.eevee.taa_render_samples=4
    sun=bpy.data.lights.new("S","SUN"); sun.energy=6
    so=bpy.data.objects.new("S",sun); bpy.context.scene.collection.objects.link(so)
    so.location=(5,5,20)

def cam(objs):
    cs=[obj.matrix_world @ mathutils.Vector(c) for obj in objs for c in obj.bound_box]
    if not cs: return
    # Use full-plane camera so we can see where these pieces sit relative to the plane
    half = 12
    cx_v = sum(v.x for v in cs)/len(cs); cy_v = sum(v.y for v in cs)/len(cs); cz_v = sum(v.z for v in cs)/len(cs)
    cd=bpy.data.cameras.new("C"); cd.type="ORTHO"; cd.ortho_scale=half*2
    co=bpy.data.objects.new("C",cd); bpy.context.scene.collection.objects.link(co)
    co.location=(0, 2, cz_v+30); co.rotation_euler=(0,0,0); bpy.context.scene.camera=co

def cam_tight(objs):
    cs=[obj.matrix_world @ mathutils.Vector(c) for obj in objs for c in obj.bound_box]
    if not cs: return
    cx_v=sum(v.x for v in cs)/len(cs); cy_v=sum(v.y for v in cs)/len(cs); cz_v=sum(v.z for v in cs)/len(cs)
    half=max(max(abs(v.x-cx_v) for v in cs),max(abs(v.y-cy_v) for v in cs),2)*1.8
    cd=bpy.data.cameras.new("C"); cd.type="ORTHO"; cd.ortho_scale=half*2
    co=bpy.data.objects.new("C",cd); bpy.context.scene.collection.objects.link(co)
    co.location=(cx_v,cy_v,cz_v+30); co.rotation_euler=(0,0,0); bpy.context.scene.camera=co

for name in OBJECTS:
    load(); setup()
    t=None
    for o in bpy.context.scene.objects:
        if o.type=="MESH":
            if o.name==name: t=o; o.hide_render=False
            else: o.hide_render=True
    if t is None: print(f"[skip] {name}"); continue
    # Wide camera to see position relative to whole plane
    cam([t])
    bpy.context.scene.render.filepath=os.path.join(OUT_DIR,f"{name}_wide.png")
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name}")
