"""
Renders Object_7, Object_10_C, Object_21_C, Object_19_C, Object_20_tail_R
from above to identify remaining fixed wing pieces.
"""
import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_remaining2"

# Also render full plane + just the "already animated" pieces for comparison
OBJECTS = [
    "Object_7",
    "Object_10_C",
    "Object_21_C",
    "Object_19_C",
    "Object_19_R",
    "Object_20_tail_R",
    "Object_20_tail_L",
]

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
    cx=sum(v.x for v in cs)/len(cs); cy=sum(v.y for v in cs)/len(cs); cz=sum(v.z for v in cs)/len(cs)
    half=max(max(abs(v.x-cx) for v in cs),max(abs(v.y-cy) for v in cs),2)*1.8
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

# Also render all the "fixed" objects together (everything except the animated wings)
# to see the full picture of what stays fixed
load(); setup()
ANIMATED = {"Object_27","Object_28","Object_10_R","Object_10_L",
            "Object_21_R","Object_21_L","Object_19_L",
            "Object_20_wingflap_R","Object_20_wingflap_L"}
fixed_objs = []
for o in bpy.context.scene.objects:
    if o.type=="MESH":
        if o.name in ANIMATED: o.hide_render=True
        else:
            o.hide_render=False
            fixed_objs.append(o)
if fixed_objs:
    cam(fixed_objs)
    bpy.context.scene.render.filepath=os.path.join(OUT_DIR,"ALL_FIXED.png")
    bpy.ops.render.render(write_still=True)
    print("[ok] ALL_FIXED")
