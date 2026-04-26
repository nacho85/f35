import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_current_state"
OBJECTS  = ["Object_20_strip_R", "Object_20_tail_R",
            "Object_20_strip_L", "Object_20_tail_L",
            "Object_20_vtail_R", "Object_20_vtail_L"]

os.makedirs(OUT_DIR, exist_ok=True)

def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)
    # Print all Object_20* names in the scene
    names = [o.name for o in bpy.context.scene.objects if "20" in o.name and o.type=="MESH"]
    print("Object_20* meshes in scene:", names)

def setup():
    sc=bpy.context.scene; sc.render.engine="BLENDER_EEVEE"
    sc.render.resolution_x=800; sc.render.resolution_y=600
    sc.render.film_transparent=True; sc.eevee.taa_render_samples=4
    sun=bpy.data.lights.new("S","SUN"); sun.energy=5
    so=bpy.data.objects.new("S",sun); bpy.context.scene.collection.objects.link(so)
    so.location=(10,10,20)

def cam(objs):
    cs=[obj.matrix_world @ mathutils.Vector(c) for obj in objs for c in obj.bound_box]
    if not cs: return
    cx=sum(v.x for v in cs)/len(cs); cy=sum(v.y for v in cs)/len(cs); cz=sum(v.z for v in cs)/len(cs)
    half=max(max(abs(v.x-cx) for v in cs),max(abs(v.y-cy) for v in cs),2)*1.6
    cd=bpy.data.cameras.new("C"); cd.type="ORTHO"; cd.ortho_scale=half*2
    co=bpy.data.objects.new("C",cd); bpy.context.scene.collection.objects.link(co)
    co.location=(cx,cy,cz+30); co.rotation_euler=(0,0,0); bpy.context.scene.camera=co

for name in OBJECTS:
    load(); setup()
    t=None
    for o in bpy.context.scene.objects:
        if o.type=="MESH":
            if o.name==name: t=o; o.hide_render=False
            else: o.hide_render=True
    if t is None: print(f"[skip] {name}"); continue
    cam([t])
    bpy.context.scene.render.filepath=os.path.join(OUT_DIR,f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name}")
