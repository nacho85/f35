"""
Split Object_20_tail_R and Object_20_tail_L by Y centroid.
- Y < 3.0  → wing panel area  → Object_20_tailwing_R/L  (will move with wings)
- Y >= 3.0 → tail area        → Object_20_tailfixed_R/L (stays fixed)
There is a clear gap between Y≈1.74 and Y≈4.79 so 3.0 is a safe threshold.
"""
import bpy, mathutils

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
Y_THRESH = 3.0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_y(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.y for v in vs) / max(len(vs), 1)

def split(base_name, wing_name, fixed_name):
    base = bpy.data.objects.get(base_name)
    if base is None:
        print(f"[warn] {base_name} not found"); return

    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True)
    bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    pieces = [o for o in bpy.context.scene.objects
              if o.type == "MESH" and o.name.startswith(base_name)]
    print(f"[{base_name}] {len(pieces)} pieces")

    wing_pieces  = [p for p in pieces if centroid_y(p) < Y_THRESH]
    fixed_pieces = [p for p in pieces if centroid_y(p) >= Y_THRESH]
    print(f"  wing (Y<{Y_THRESH}): {len(wing_pieces)}   fixed (Y>={Y_THRESH}): {len(fixed_pieces)}")

    def merge_rename(lst, name):
        if not lst: print(f"  [skip] nothing for {name}"); return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1: bpy.ops.object.join()
        bpy.context.active_object.name = name
        print(f"  -> {name}")

    merge_rename(wing_pieces,  wing_name)
    merge_rename(fixed_pieces, fixed_name)

split("Object_20_tail_R", "Object_20_tailwing_R", "Object_20_tailfixed_R")
split("Object_20_tail_L", "Object_20_tailwing_L", "Object_20_tailfixed_L")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
