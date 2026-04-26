"""
Re-splits Object_20_wingstrip_R and Object_20_wingstrip_L using Z-HEIGHT criterion.
Vertical tails are tall (Z_height > HEIGHT_THRESH) → stays fixed.
Trailing-edge strips are flat (Z_height <= HEIGHT_THRESH) → sweeps with wing.

Run: blender --background --python scripts/split_f14_wing_extras4.py
"""
import bpy
import mathutils

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

HEIGHT_THRESH = 1.0   # pieces taller than 1m = vertical tail, flatter = wing strip

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def piece_z_height(obj):
    zs = [(obj.matrix_world @ v.co).z for v in obj.data.vertices]
    return max(zs) - min(zs) if zs else 0

def re_split_by_height(base_name, strip_name, tail_name):
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
    print(f"[{base_name}] {len(pieces)} pieces — checking Z height...")

    strip_pieces = []
    tail_pieces  = []
    for p in pieces:
        h = piece_z_height(p)
        (tail_pieces if h > HEIGHT_THRESH else strip_pieces).append(p)
        if h > HEIGHT_THRESH:
            print(f"    TAIL  {p.name}  h={h:.2f}")

    print(f"  strip={len(strip_pieces)}  tail={len(tail_pieces)}")

    def merge_rename(lst, new_name):
        if not lst: return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1: bpy.ops.object.join()
        bpy.context.active_object.name = new_name
        print(f"  → {new_name}")

    merge_rename(strip_pieces, strip_name)
    merge_rename(tail_pieces,  tail_name)

re_split_by_height("Object_20_wingstrip_R", "Object_20_strip_R", "Object_20_vtail_R")
re_split_by_height("Object_20_wingstrip_L", "Object_20_strip_L", "Object_20_vtail_L")

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
