"""
Renders all fixed objects individually (not in ANIMATED set) to identify
which ones have geometry at wing-span positions (|X| > 3).
"""
import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_fixed_final"
os.makedirs(OUT_DIR, exist_ok=True)

ANIMATED = {
    "Object_27","Object_28",
    "Object_10_R","Object_10_L",
    "Object_21_R","Object_21_L",
    "Object_19_L",
    "Object_20_wingflap_R","Object_20_wingflap_L",
    "Object_7_R","Object_7_L",
    "Object_6_R","Object_6_L",
}

def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

def setup():
    sc=bpy.context.scene; sc.render.engine="BLENDER_EEVEE"
    sc.render.resolution_x=960; sc.render.resolution_y=700
    sc.render.film_transparent=True; sc.eevee.taa_render_samples=4
    sun=bpy.data.lights.new("S","SUN"); sun.energy=6
    so=bpy.data.objects.new("S",sun); bpy.context.scene.collection.objects.link(so)
    so.location=(5,5,20)

def cam_wide(cz=0):
    """Fixed wide camera centered on plane, ortho scale 24 (full span)."""
    cd=bpy.data.cameras.new("C"); cd.type="ORTHO"; cd.ortho_scale=24
    co=bpy.data.objects.new("C",cd); bpy.context.scene.collection.objects.link(co)
    co.location=(0, 2, cz+30); co.rotation_euler=(0,0,0)
    bpy.context.scene.camera=co

# First: render all fixed together
load(); setup()
fixed=[]
for o in bpy.context.scene.objects:
    if o.type!="MESH": continue
    if o.name in ANIMATED: o.hide_render=True
    else: o.hide_render=False; fixed.append(o)
cam_wide()
bpy.context.scene.render.filepath=os.path.join(OUT_DIR,"_ALL_FIXED.png")
bpy.ops.render.render(write_still=True)
print(f"[ok] _ALL_FIXED ({len(fixed)} objects)")

# Render each fixed object individually in wide view
# (only those that might have wing-span material, i.e. bbox |X|>3)
def bbox_max_x(obj):
    return max(abs((obj.matrix_world @ mathutils.Vector(c)).x) for c in obj.bound_box)

load(); setup()
candidates = []
for o in bpy.context.scene.objects:
    if o.type!="MESH": continue
    if o.name in ANIMATED: continue
    if bbox_max_x(o) > 3:
        candidates.append(o.name)

print(f"\nFixed objects with |X|>3: {candidates}")
for name in candidates:
    load(); setup()
    t=None
    for o in bpy.context.scene.objects:
        if o.type=="MESH":
            if o.name==name: t=o; o.hide_render=False
            else: o.hide_render=True
    if t is None: continue
    cam_wide()
    bpy.context.scene.render.filepath=os.path.join(OUT_DIR,f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name}")
