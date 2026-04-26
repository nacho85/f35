"""
Re-split Object_19_L_wing by Y centroid.
The isolated cluster (Y≈0.0) should stay fixed; the consecutive wing clusters (Y≈1.0-2.0) move.
Y threshold = 0.5
"""
import bpy, mathutils

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
Y_THRESH = 0.5

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_y(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.y for v in vs) / max(len(vs), 1)

base = bpy.data.objects.get("Object_19_L_wing")
if base is None:
    print("[warn] Object_19_L_wing not found")
else:
    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True); bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    pieces = [o for o in bpy.context.scene.objects
              if o.type=="MESH" and o.name.startswith("Object_19_L_wing")]

    wing_pieces  = [p for p in pieces if centroid_y(p) >= Y_THRESH]
    fixed_pieces = [p for p in pieces if centroid_y(p) <  Y_THRESH]
    print(f"Object_19_L_wing  wing(Y>={Y_THRESH})={len(wing_pieces)}  fixed(Y<{Y_THRESH})={len(fixed_pieces)}")

    def merge_rename(lst, name):
        if not lst: print(f"  [skip] {name}"); return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1: bpy.ops.object.join()
        bpy.context.active_object.name = name
        print(f"  -> {name}")

    merge_rename(wing_pieces,  "Object_19_L_wing2")
    merge_rename(fixed_pieces, "Object_19_L_fixed2")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
