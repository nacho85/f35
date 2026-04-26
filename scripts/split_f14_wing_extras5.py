"""
Final split of Object_20_strip_R and Object_20_strip_L using Y centroid.
Trailing-edge strip pieces: Y centroid ≈ 1.5-2.5  →  Object_20_wingflap_R/L (sweeps with wing)
Vertical tail pieces:       Y centroid ≈ 6.8-7.5  →  Object_20_vtail_R/L (stays fixed)

Run: blender --background --python scripts/split_f14_wing_extras5.py
"""
import bpy
import mathutils

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

Y_THRESH = 4.0   # pieces with cy > Y_THRESH are vertical tail

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_y(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.y for v in vs) / max(len(vs), 1)

def re_split_by_y(base_name, flap_name, vtail_name):
    base = bpy.data.objects.get(base_name)
    if base is None:
        print(f"[warn] {base_name} not found")
        return

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

    flap_pieces  = []
    vtail_pieces = []
    for p in pieces:
        cy = centroid_y(p)
        (vtail_pieces if cy > Y_THRESH else flap_pieces).append(p)

    print(f"  flap(wing)={len(flap_pieces)}  vtail(fixed)={len(vtail_pieces)}")

    def merge_rename(lst, new_name):
        if not lst:
            print(f"  [skip] empty → {new_name}")
            return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1: bpy.ops.object.join()
        bpy.context.active_object.name = new_name
        print(f"  → {new_name}")

    merge_rename(flap_pieces,  flap_name)
    merge_rename(vtail_pieces, vtail_name)

re_split_by_y("Object_20_strip_R", "Object_20_wingflap_R", "Object_20_vtail_R")
re_split_by_y("Object_20_strip_L", "Object_20_wingflap_L", "Object_20_vtail_L")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format="GLB",
    use_selection=False,
    export_apply=False,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_yup=True,
)
print(f"\n[done] → {GLB_OUT}")
