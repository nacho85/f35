"""
Renders each candidate from a perspective similar to the user's screenshot:
slightly above and from the side, looking at the upper wing surface near the root.
Wings are in swept position (rotation applied manually to Object_27/28).
"""
import bpy, mathutils, math, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_wing_persp"
os.makedirs(OUT_DIR, exist_ok=True)

CANDIDATES = [
    "Object_14_wingpanel_R", "Object_14_wingpanel_L",
    "Object_14_inner_L",
    "Object_10_C", "Object_21_C", "Object_19_C",
    "Object_17", "Object_16", "Object_15",
]

SWEEP = math.radians(40)  # simulate swept wings

def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

def setup():
    sc=bpy.context.scene; sc.render.engine="BLENDER_EEVEE"
    sc.render.resolution_x=960; sc.render.resolution_y=640
    sc.render.film_transparent=True; sc.eevee.taa_render_samples=8
    sun=bpy.data.lights.new("S","SUN"); sun.energy=5
    so=bpy.data.objects.new("S",sun); bpy.context.scene.collection.objects.link(so)
    so.location=(5, -5, 20)
    sun2=bpy.data.lights.new("S2","SUN"); sun2.energy=2
    so2=bpy.data.objects.new("S2",sun2); bpy.context.scene.collection.objects.link(so2)
    so2.location=(-5, 5, 15)

def cam_wing():
    """Perspective from above-rear-left, looking at inner wing area"""
    cd=bpy.data.cameras.new("C"); cd.lens=50
    co=bpy.data.objects.new("C",cd); bpy.context.scene.collection.objects.link(co)
    # Position: above, slightly to left side, looking at wing root area
    co.location=(-4, -8, 8)
    # Point camera toward wing root area
    direction = mathutils.Vector((2, 3, -4)).normalized()
    rot = direction.to_track_quat('-Z', 'Y')
    co.rotation_euler = rot.to_euler()
    bpy.context.scene.camera=co

def apply_sweep():
    for o in bpy.context.scene.objects:
        if o.name == "Object_27": o.rotation_euler.z =  SWEEP
        if o.name == "Object_28": o.rotation_euler.z = -SWEEP

red_mat  = None
grey_mat = None

def get_mats():
    global red_mat, grey_mat
    red_mat = bpy.data.materials.new("RED")
    red_mat.use_nodes=True
    red_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value=(1,0,0,1)

    grey_mat = bpy.data.materials.new("GREY")
    grey_mat.use_nodes=True
    grey_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value=(0.35,0.35,0.35,1)
    grey_mat.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value=0.3
    grey_mat.blend_method="BLEND"

for name in CANDIDATES:
    load(); setup(); apply_sweep(); get_mats()
    found=False
    for o in bpy.context.scene.objects:
        if o.type != "MESH": continue
        o.hide_render=False
        if o.name == name:
            o.data.materials.clear()
            o.data.materials.append(red_mat)
            found=True
        else:
            o.data.materials.clear()
            o.data.materials.append(grey_mat)
    if not found: print(f"[skip] {name}"); continue
    cam_wing()
    bpy.context.scene.render.filepath=os.path.join(OUT_DIR,f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name}")
