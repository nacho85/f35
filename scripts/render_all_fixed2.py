"""Renders everything that stays fixed (all except the animated wing pieces)."""
import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT      = r"C:\devs\f35\scripts\f14_fixed2\ALL_FIXED.png"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

sc=bpy.context.scene; sc.render.engine="BLENDER_EEVEE"
sc.render.resolution_x=960; sc.render.resolution_y=800
sc.render.film_transparent=True; sc.eevee.taa_render_samples=4
sun=bpy.data.lights.new("S","SUN"); sun.energy=6
so=bpy.data.objects.new("S",sun); bpy.context.scene.collection.objects.link(so)
so.location=(5,5,20)

ANIMATED = {
    "Object_27","Object_28",
    "Object_10_R","Object_10_L",
    "Object_21_R","Object_21_L",
    "Object_19_L",
    "Object_20_wingflap_R","Object_20_wingflap_L",
    "Object_7_R","Object_7_L",
}

fixed_objs = []
for o in bpy.context.scene.objects:
    if o.type != "MESH": continue
    if o.name in ANIMATED:
        o.hide_render = True
    else:
        o.hide_render = False
        fixed_objs.append(o)
        print(f"  fixed: {o.name}")

cs=[obj.matrix_world @ mathutils.Vector(c) for obj in fixed_objs for c in obj.bound_box]
cx=sum(v.x for v in cs)/len(cs); cy=sum(v.y for v in cs)/len(cs); cz=sum(v.z for v in cs)/len(cs)
half=max(max(abs(v.x-cx) for v in cs),max(abs(v.y-cy) for v in cs),2)*1.2
cd=bpy.data.cameras.new("C"); cd.type="ORTHO"; cd.ortho_scale=half*2
co=bpy.data.objects.new("C",cd); bpy.context.scene.collection.objects.link(co)
co.location=(cx,cy,cz+30); co.rotation_euler=(0,0,0); bpy.context.scene.camera=co

bpy.context.scene.render.filepath=OUT
bpy.ops.render.render(write_still=True)
print(f"[done] {OUT}")
