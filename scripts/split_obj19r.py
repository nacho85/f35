"""
Split Object_19_R by X centroid.
- cx <= 2.3  → Object_19_R_fixed  (inner cluster near glove, stays fixed)
- cx >  2.3  → Object_19_R_wing   (outer wing slat, moves with wing)

Same for Object_19_L:
- cx >= -2.3 → Object_19_L_fixed  (isolated inner cluster)
- cx <  -2.3 → Object_19_L_wing   (outer wing slat, moves with wing)
"""
import bpy, mathutils

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
X_THRESH = 2.3

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_x(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.x for v in vs) / max(len(vs), 1)

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

    wing_pieces  = []
    fixed_pieces = []
    for p in pieces:
        cx = centroid_x(p)
        is_wing = (cx > X_THRESH) if side == 'R' else (cx < -X_THRESH)
        (wing_pieces if is_wing else fixed_pieces).append(p)

    print(f"[{base_name}]  wing={len(wing_pieces)}  fixed={len(fixed_pieces)}")

    def merge_rename(lst, name):
        if not lst: print(f"  [skip] {name}"); return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1: bpy.ops.object.join()
        bpy.context.active_object.name = name
        print(f"  -> {name}")

    merge_rename(wing_pieces,  wing_name)
    merge_rename(fixed_pieces, fixed_name)

split("Object_19_R", "Object_19_R_wing", "Object_19_R_fixed", "R")
split("Object_19_L", "Object_19_L_wing", "Object_19_L_fixed", "L")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
