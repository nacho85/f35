"""
Renders fixed objects that have bbox reaching X > 4m (outer wing zone).
These are the candidates for the panels the user circled in yellow on the wing surface.
"""
import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_wing_surface"
os.makedirs(OUT_DIR, exist_ok=True)

ANIMATED = {
    "Object_27","Object_28",
    "Object_10_R","Object_10_L",
    "Object_21_R","Object_21_L",
    "Object_19_L",
    "Object_20_wingflap_R","Object_20_wingflap_L",
    "Object_6_R","Object_6_L",
    "Object_7_wing_R","Object_7_wing_L",
}

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
    # Ortho 20 units wide, centered on plane
    cd=bpy.data.cameras.new("C"); cd.type="ORTHO"; cd.ortho_scale=20
    co=bpy.data.objects.new("C",cd); bpy.context.scene.collection.objects.link(co)
    co.location=(0,2,30); co.rotation_euler=(0,0,0); bpy.context.scene.camera=co

def bbox_max_abs_x(obj):
    return max(abs((obj.matrix_world @ mathutils.Vector(c)).x) for c in obj.bound_box)

# Find all fixed objects with significant wing-span reach
load()
candidates = []
for o in bpy.context.scene.objects:
    if o.type != "MESH": continue
    if o.name in ANIMATED: continue
    if bbox_max_abs_x(o) > 4.0:  # outer wing zone
        candidates.append(o.name)
        print(f"  candidate: {o.name}  max|X|={bbox_max_abs_x(o):.2f}")

print(f"\n{len(candidates)} candidates with |X|>4m")

for name in candidates:
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
