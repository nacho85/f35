"""
Sub-splits Object_14_R and Object_14_L with a tighter X threshold (3.0)
to isolate just the outer wing panel (blue strip at X≈±3m)
from the landing gear / other inner hardware (X≈±1-2m).

Object_14_R has 13 pieces total — probably all wing panel, include directly.
Object_14_L has 281 pieces — needs tighter split to exclude gear mechanism.

Run: blender --background --python scripts/split_f14_obj14_wing.py
"""
import bpy, mathutils

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
WING_X = 2.8   # centroid must be beyond this to be counted as outer wing panel

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_x(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.x for v in vs) / max(len(vs), 1)

def split_wing_panel(base_name, wing_name, inner_name, side):
    """side='R' → wing pieces have cx > WING_X; 'L' → cx < -WING_X"""
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

    # Print X histogram
    hist = {}
    for p in pieces:
        b = round(centroid_x(p) * 2) / 2
        hist[b] = hist.get(b, 0) + 1
    print("  X hist:", dict(sorted(hist.items())))

    wing_pieces  = []
    inner_pieces = []
    for p in pieces:
        cx = centroid_x(p)
        is_wing = (cx > WING_X) if side == 'R' else (cx < -WING_X)
        (wing_pieces if is_wing else inner_pieces).append(p)

    print(f"  wing={len(wing_pieces)}  inner(fixed)={len(inner_pieces)}")

    def merge_rename(lst, name):
        if not lst: print(f"  [skip] → {name}"); return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1: bpy.ops.object.join()
        bpy.context.active_object.name = name
        print(f"  → {name}")

    merge_rename(wing_pieces,  wing_name)
    merge_rename(inner_pieces, inner_name)

split_wing_panel("Object_14_R", "Object_14_wingpanel_R", "Object_14_inner_R", "R")
split_wing_panel("Object_14_L", "Object_14_wingpanel_L", "Object_14_inner_L", "L")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
