"""
Trim inner-edge faces that clip through the fuselage at max sweep.
Delete faces where the face CENTROID clips (wx_after < FUSE_X).
This avoids deleting large faces that just happen to touch the boundary.
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
    bpy.ops.object.mode_set(mode="OBJECT")

    mesh = obj.data
    M = obj.matrix_world
    n_before = len(mesh.polygons)

    # Select faces where centroid clips
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")

    n_del = 0
    for poly in mesh.polygons:
        # Face centroid in world space
        verts_world = [M @ mesh.vertices[vi].co for vi in poly.vertices]
        cx = sum(v.x for v in verts_world) / len(verts_world)
        cz = sum(v.z for v in verts_world) / len(verts_world)
        wx = cx if not mirror else -cx
        wx_a = sweep_wx(wx, cz)
        if wx_a < FUSE_X:
            poly.select = True
            n_del += 1

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")

    print(f"{name}: deleted {n_del} / {n_before} faces")

trim_object("Object_27",                  mirror=False)
trim_object("Object_10_R",               mirror=False)
trim_object("Object_20_tailwing2_R_fwd", mirror=False)
trim_object("Object_28",                  mirror=True)
trim_object("Object_10_L",               mirror=True)
trim_object("Object_20_tailwing2_L_fwd", mirror=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
