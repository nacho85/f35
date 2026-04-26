"""
Re-split Object_20_tailwing2_L_fwd by Y=1.1
- cy < 1.1  → merge with Object_20_tailwing2_L_rear → Object_20_tailwing2_L_rear
- cy >= 1.1 → Object_20_tailwing2_L_fwd (rename in place)
"""
import bpy

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
Y_THRESH = 1.1

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_y(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.y for v in vs) / max(len(vs), 1)

# Split _fwd
fwd = bpy.data.objects.get("Object_20_tailwing2_L_fwd")
if fwd is None:
    print("[warn] Object_20_tailwing2_L_fwd not found")
else:
    bpy.ops.object.select_all(action="DESELECT")
    fwd.select_set(True); bpy.context.view_layer.objects.active = fwd
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    pieces = [o for o in bpy.context.scene.objects
              if o.type=="MESH" and o.name.startswith("Object_20_tailwing2_L_fwd")]

    low  = [p for p in pieces if centroid_y(p) <  Y_THRESH]
    high = [p for p in pieces if centroid_y(p) >= Y_THRESH]
    print(f"_fwd split: low(cy<{Y_THRESH})={len(low)}  high(cy>={Y_THRESH})={len(high)}")

    def merge_rename(lst, name):
        if not lst: print(f"  [skip] {name}"); return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1: bpy.ops.object.join()
        bpy.context.active_object.name = name
        print(f"  -> {name}")

    merge_rename(high, "Object_20_tailwing2_L_fwd_new")

    # Merge low with existing _rear
    rear = bpy.data.objects.get("Object_20_tailwing2_L_rear")
    if rear and low:
        all_rear = low + [rear]
        bpy.ops.object.select_all(action="DESELECT")
        for p in all_rear: p.select_set(True)
        bpy.context.view_layer.objects.active = rear
        bpy.ops.object.join()
        bpy.context.active_object.name = "Object_20_tailwing2_L_rear"
        print(f"  -> merged {len(low)} pieces into Object_20_tailwing2_L_rear")
    else:
        merge_rename(low, "Object_20_tailwing2_L_rear_extra")

    # Rename _fwd_new → _fwd
    obj = bpy.data.objects.get("Object_20_tailwing2_L_fwd_new")
    if obj:
        obj.name = "Object_20_tailwing2_L_fwd"
        print("  -> renamed to Object_20_tailwing2_L_fwd")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
