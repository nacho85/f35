"""
Re-split Object_20_tailwing_R/L by |X| centroid.
Pieces too close to center (|cx| <= 2.4) are inside the pivot radius and
will clip the fuselage when swept — move them to tailfixed.
Keep only outer pieces (|cx| > 2.4) in the wing EXTRAS.
"""
import bpy, mathutils

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
X_THRESH = 2.4   # pieces beyond ±2.4m = outer wing panel

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    n = max(len(vs), 1)
    return sum(v.x for v in vs)/n, sum(v.y for v in vs)/n

def split(base_name, wing_name, fixed_name, side):
    base = bpy.data.objects.get(base_name)
    if base is None: print(f"[warn] {base_name} not found"); return

    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True); bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    pieces = [o for o in bpy.context.scene.objects
              if o.type=="MESH" and o.name.startswith(base_name)]
    print(f"[{base_name}] {len(pieces)} pieces")

    wing_pieces  = []
    fixed_pieces = []
    for p in pieces:
        cx, cy = centroid(p)
        is_outer = (cx > X_THRESH) if side == 'R' else (cx < -X_THRESH)
        (wing_pieces if is_outer else fixed_pieces).append(p)

    print(f"  outer wing (|cx|>{X_THRESH}): {len(wing_pieces)}   inner fixed: {len(fixed_pieces)}")

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

split("Object_20_tailwing_R", "Object_20_tailwing2_R", "Object_20_tailinner_R", "R")
split("Object_20_tailwing_L", "Object_20_tailwing2_L", "Object_20_tailinner_L", "L")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
