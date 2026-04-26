"""
Trim inner-edge faces that clip through the fuselage at max sweep.
For each object, delete faces where ALL verts satisfy:
  sweep_wx(wx, wz) < FUSE_X  at SWEEP_MAX
"""
import bpy, math

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

PIVOT_X  = 2.290
PIVOT_Z  = 0.600
FUSE_X   = 2.287
SWEEP    = math.radians(48)

def sweep_wx(wx, wz):
    return PIVOT_X + math.cos(SWEEP)*(wx - PIVOT_X) - math.sin(SWEEP)*(wz - PIVOT_Z)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def trim_object(name, mirror=False):
    obj = bpy.data.objects.get(name)
    if obj is None:
        print(f"[warn] {name} not found"); return

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")

    mesh = obj.data
    n_before = len(mesh.polygons)

    # Mark verts that clip
    clips = set()
    for v in mesh.vertices:
        wv = obj.matrix_world @ v.co
        wx, wz = wv.x, wv.z
        if mirror:
            wx = -wx  # mirror: use absolute X
        wx_a = sweep_wx(wx, wz)
        if wx_a < FUSE_X:
            clips.add(v.index)

    # Select faces where ALL verts clip
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")

    n_del = 0
    for poly in mesh.polygons:
        if all(vi in clips for vi in poly.vertices):
            poly.select = True
            n_del += 1

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")

    print(f"{name}: deleted {n_del} / {n_before} faces  (clipping verts: {len(clips)})")

# Right side
trim_object("Object_27",                  mirror=False)
trim_object("Object_10_R",               mirror=False)
trim_object("Object_20_tailwing2_R_fwd", mirror=False)

# Left side (mirrored)
trim_object("Object_28",                  mirror=True)
trim_object("Object_10_L",               mirror=True)
trim_object("Object_20_tailwing2_L_fwd", mirror=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
