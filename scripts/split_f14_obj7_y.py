"""
Sub-splits Object_7_R and Object_7_L by Y centroid:
  Y <= Y_THRESH  → wing leading-edge strips  (sweep with wing)
  Y >  Y_THRESH  → nozzle rays               (stay fixed)

Run: blender --background --python scripts/split_f14_obj7_y.py
"""
import bpy, mathutils

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
Y_THRESH = 4.0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_y(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.y for v in vs) / max(len(vs), 1)

def split_by_y(base_name, wing_name, nozzle_name):
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
              if o.type == "MESH" and o.name.startswith(base_name)]
    print(f"[{base_name}] {len(pieces)} pieces")

    # Print Y distribution to understand the split
    ys = sorted([centroid_y(p) for p in pieces])
    hist = {}
    for y in ys:
        b = round(y * 2) / 2
        hist[b] = hist.get(b, 0) + 1
    print("  Y histogram:", {k: v for k, v in sorted(hist.items())})

    wing_pieces   = [p for p in pieces if centroid_y(p) <= Y_THRESH]
    nozzle_pieces = [p for p in pieces if centroid_y(p) >  Y_THRESH]
    print(f"  wing={len(wing_pieces)}  nozzle(fixed)={len(nozzle_pieces)}")

    def merge_rename(lst, name):
        if not lst: print(f"  [skip] empty → {name}"); return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1: bpy.ops.object.join()
        bpy.context.active_object.name = name
        print(f"  → {name}")

    merge_rename(wing_pieces,   wing_name)
    merge_rename(nozzle_pieces, nozzle_name)

split_by_y("Object_7_R", "Object_7_wing_R", "Object_7_nozzle_R")
split_by_y("Object_7_L", "Object_7_wing_L", "Object_7_nozzle_L")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
