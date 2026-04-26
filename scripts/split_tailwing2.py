"""
Split Object_20_tailwing2_R/L by Y centroid.
Y threshold = 0.5
- cy < 0.5  → Object_20_tailwing2_R/L_rear   (zona pliegue ala)
- cy >= 0.5 → Object_20_tailwing2_R/L_fwd    (paneles adelante)
"""
import bpy

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
Y_THRESH = 0.5

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_y(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.y for v in vs) / max(len(vs), 1)

def split(base_name):
    base = bpy.data.objects.get(base_name)
    if base is None:
        print(f"[warn] {base_name} not found"); return

    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True); bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    pieces = [o for o in bpy.context.scene.objects
              if o.type=="MESH" and o.name.startswith(base_name)]

    rear = [p for p in pieces if centroid_y(p) <  Y_THRESH]
    fwd  = [p for p in pieces if centroid_y(p) >= Y_THRESH]
    print(f"{base_name}  rear(cy<{Y_THRESH})={len(rear)}  fwd(cy>={Y_THRESH})={len(fwd)}")

    def merge_rename(lst, name):
        if not lst: print(f"  [skip] {name}"); return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1: bpy.ops.object.join()
        bpy.context.active_object.name = name
        print(f"  -> {name}")

    merge_rename(rear, base_name + "_rear")
    merge_rename(fwd,  base_name + "_fwd")

split("Object_20_tailwing2_R")
split("Object_20_tailwing2_L")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
