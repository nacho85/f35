"""
Split Object_19_R_wing by Y centroid.
- Y < 0  → Object_19_R_triangle  (the tiny isolated triangle, moves with wing)
- Y >= 0 → Object_19_R_glove     (the rest, stays fixed)
"""
import bpy, mathutils

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_y(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.y for v in vs) / max(len(vs), 1)

base = bpy.data.objects.get("Object_19_R_wing")
if base is None:
    print("[warn] Object_19_R_wing not found")
else:
    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True); bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    pieces = [o for o in bpy.context.scene.objects
              if o.type=="MESH" and o.name.startswith("Object_19_R_wing")]

    tri_pieces   = [p for p in pieces if centroid_y(p) < 0]
    glove_pieces = [p for p in pieces if centroid_y(p) >= 0]
    print(f"triangle (Y<0): {len(tri_pieces)}   glove fixed (Y>=0): {len(glove_pieces)}")

    def merge_rename(lst, name):
        if not lst: print(f"  [skip] {name}"); return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1: bpy.ops.object.join()
        bpy.context.active_object.name = name
        print(f"  -> {name}")

    merge_rename(tri_pieces,   "Object_19_R_triangle")
    merge_rename(glove_pieces, "Object_19_R_glove")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
