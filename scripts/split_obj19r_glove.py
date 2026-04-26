"""
Split Object_19_R_glove by X centroid.
- cx <= 3.5 → Object_19_R_glove_inner  (near glove, likely fixed)
- cx >  3.5 → Object_19_R_glove_outer  (outer wing, likely moves)
"""
import bpy

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
X_THRESH = 3.5

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_x(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.x for v in vs) / max(len(vs), 1)

base = bpy.data.objects.get("Object_19_R_glove")
if base is None:
    print("[warn] Object_19_R_glove not found")
else:
    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True); bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    pieces = [o for o in bpy.context.scene.objects
              if o.type=="MESH" and o.name.startswith("Object_19_R_glove")]

    inner = [p for p in pieces if centroid_x(p) <= X_THRESH]
    outer = [p for p in pieces if centroid_x(p) >  X_THRESH]
    print(f"inner (cx<={X_THRESH}): {len(inner)}   outer (cx>{X_THRESH}): {len(outer)}")

    def merge_rename(lst, name):
        if not lst: print(f"  [skip] {name}"); return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1: bpy.ops.object.join()
        bpy.context.active_object.name = name
        print(f"  -> {name}")

    merge_rename(inner, "Object_19_R_glove_inner")
    merge_rename(outer, "Object_19_R_glove_outer")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
