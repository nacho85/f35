"""
Split Object_3 (right lights) and Object_4 (left lights) by X centroid.
- Wing tip lights are at outer X (|X| > PIVOT_X)  → move with wing
- Fuselage lights are near center X                → stay fixed

Run: blender --background --python scripts/split_f14_lights.py
"""
import bpy, mathutils

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
PIVOT_X = 2.5   # pieces beyond ±2.5m = wing tip lights

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_x(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.x for v in vs) / max(len(vs), 1)

def split_lights(base_name, wing_name, fixed_name, side):
    """side='R' → wing pieces have cx > PIVOT_X; 'L' → cx < -PIVOT_X"""
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
    print(f"[{base_name}] {len(pieces)} loose pieces")

    # Print X histogram
    for p in pieces:
        cx = centroid_x(p)
        print(f"  {p.name}  cx={cx:.2f}")

    wing_pieces  = []
    fixed_pieces = []
    for p in pieces:
        cx = centroid_x(p)
        is_wing = (cx > PIVOT_X) if side == 'R' else (cx < -PIVOT_X)
        (wing_pieces if is_wing else fixed_pieces).append(p)

    print(f"  wing tip={len(wing_pieces)}  fuselage fixed={len(fixed_pieces)}")

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

split_lights("Object_3", "Object_3_wingtip", "Object_3_fuselage", "R")
split_lights("Object_4", "Object_4_wingtip", "Object_4_fuselage", "L")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
