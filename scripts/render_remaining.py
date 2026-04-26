"""
Render remaining fixed objects top-down in context to find the 2 yellow inner wing panels.
"""
import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
OUT_DIR  = r"C:\devs\f35\scripts\f14_ctx"
os.makedirs(OUT_DIR, exist_ok=True)

# Objects not yet checked, plus center-split candidates
CANDIDATES = [
    "Object_9", "Object_22", "Object_23", "Object_24",
    "Object_10_C", "Object_21_C", "Object_19_C", "Object_20_C",
    "Object_6_C",
]

def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

def setup():
    sc=bpy.context.scene; sc.render.engine="BLENDER_EEVEE"
    sc.render.resolution_x=960; sc.render.resolution_y=640
    sc.render.film_transparent=True; sc.eevee.taa_render_samples=8
    sun=bpy.data.lights.new("S","SUN"); sun.energy=5
    so=bpy.data.objects.new("S",sun); bpy.context.scene.collection.objects.link(so)
    so.location=(0,0,30)

def cam_top():
    cd=bpy.data.cameras.new("C"); cd.type="ORTHO"; cd.ortho_scale=22
    co=bpy.data.objects.new("C",cd); bpy.context.scene.collection.objects.link(co)
    co.location=(0,2,30); co.rotation_euler=(0,0,0)
    bpy.context.scene.camera=co

for name in CANDIDATES:
    load(); setup()
    red_mat = bpy.data.materials.new("RED")
    red_mat.use_nodes=True
    red_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value=(1,0,0,1)
    grey_mat = bpy.data.materials.new("GREY")
    grey_mat.use_nodes=True
    grey_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value=(0.4,0.4,0.4,1)
    grey_mat.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value=0.25
    grey_mat.blend_method="BLEND"

    found=False
    for o in bpy.context.scene.objects:
        if o.type != "MESH": continue
        o.hide_render=False
        if o.name == name:
            o.data.materials.clear(); o.data.materials.append(red_mat); found=True
        else:
            o.data.materials.clear(); o.data.materials.append(grey_mat)
    if not found: print(f"[skip] {name}"); continue
    cam_top()
    bpy.context.scene.render.filepath=os.path.join(OUT_DIR,f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[ok] {name}")
