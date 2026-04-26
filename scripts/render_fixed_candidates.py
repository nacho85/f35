"""
Renders each 'fixed' mesh (not already in EXTRAS, not wing pivots)
with the full plane visible for context, to identify floating rectangular panels.
"""
import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_fixed_candidates"
os.makedirs(OUT_DIR, exist_ok=True)

# Already animated or known fixed fuselage
SKIP = {
    "Object_27","Object_28",                   # wing pivots
    "Object_10_R","Object_10_L","Object_10_C",
    "Object_21_R","Object_21_L","Object_21_C",
    "Object_19_L","Object_19_R","Object_19_C",
    "Object_20_wingflap_R","Object_20_wingflap_L",
    "Object_20_tail_R","Object_20_tail_L",
    "Object_20_vtail_R","Object_20_vtail_L","Object_20_C",
    "Object_6_R","Object_6_L","Object_6_C",
    "Object_7_wing_R","Object_7_wing_L","Object_7_C",
    "Object_7_nozzle_R","Object_7_nozzle_L",
    "Object_3_wingtip","Object_3_fuselage",
    "Object_4_wingtip","Object_4_fuselage",
    "Object_5",                                # canopy
}

def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

def setup():
    sc=bpy.context.scene; sc.render.engine="BLENDER_EEVEE"
    sc.render.resolution_x=960; sc.render.resolution_y=640
    sc.render.film_transparent=True; sc.eevee.taa_render_samples=8
    for pos,energy in [((5,5,20),4),((-5,5,15),2),((0,-8,10),2)]:
        sun=bpy.data.lights.new("S","SUN"); sun.energy=energy
        so=bpy.data.objects.new("S",sun); bpy.context.scene.collection.objects.link(so)
        so.location=pos

def cam_top():
    cd=bpy.data.cameras.new("C"); cd.type="ORTHO"; cd.ortho_scale=22
    co=bpy.data.objects.new("C",cd); bpy.context.scene.collection.objects.link(co)
    co.location=(0,2,30); co.rotation_euler=(0,0,0)
    bpy.context.scene.camera=co

def bbox_max_abs_x(obj):
    return max(abs((obj.matrix_world @ mathutils.Vector(c)).x) for c in obj.bound_box)

load()
# Collect candidates: fixed objects that reach outer wing zone (|X|>2m)
candidates = []
for o in bpy.context.scene.objects:
    if o.type != "MESH": continue
    if o.name in SKIP: continue
    if bbox_max_abs_x(o) > 2.0:
        candidates.append(o.name)
        print(f"  candidate: {o.name}  maxX={bbox_max_abs_x(o):.2f}")

print(f"\n{len(candidates)} candidates")

for name in candidates:
    load(); setup()
    highlight = None
    for o in bpy.context.scene.objects:
        if o.type != "MESH": continue
        if o.name == name:
            highlight = o; o.hide_render = False
        else:
            o.hide_render = True
    if highlight is None: continue
    cam_top()
    bpy.context.scene.render.filepath = os.path.join(OUT_DIR, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name}")
