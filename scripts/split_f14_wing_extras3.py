"""
Re-splits Object_20_R and Object_20_L.
Each contains a vertical tail (centroid X near ±2m) + a wing trailing-edge strip (centroid X near ±5m).
Using threshold X=3.5 separates them cleanly.

Results:
  Object_20_wingstrip_R  → will be parented to Object_27 (right wing sweep)
  Object_20_tail_R       → stays fixed
  Object_20_wingstrip_L  → will be parented to Object_28 (left wing sweep)
  Object_20_tail_L       → stays fixed

Run: blender --background --python scripts/split_f14_wing_extras3.py
"""
import bpy
import mathutils

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_x(obj):
    verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.x for v in verts) / max(len(verts), 1)

def re_split(base_name, wing_threshold, wing_name, tail_name):
    """Separate base_name loose parts, classify by |centroid_x| vs threshold."""
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

    # For right objects: wing pieces have centroid_x > threshold
    # For left objects:  wing pieces have centroid_x < -threshold
    is_right = wing_threshold > 0
    wing_pieces = []
    tail_pieces = []
    for p in pieces:
        cx = centroid_x(p)
        if is_right:
            (wing_pieces if cx > wing_threshold else tail_pieces).append(p)
        else:
            (wing_pieces if cx < wing_threshold else tail_pieces).append(p)

    print(f"  wing={len(wing_pieces)}  tail/fixed={len(tail_pieces)}")

    def merge_rename(lst, new_name):
        if not lst:
            print(f"  [skip] no pieces for {new_name}")
            return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1:
            bpy.ops.object.join()
        bpy.context.active_object.name = new_name
        print(f"  → {new_name}")

    merge_rename(wing_pieces, wing_name)
    merge_rename(tail_pieces, tail_name)

re_split("Object_20_R", 3.5,  "Object_20_wingstrip_R", "Object_20_tail_R")
re_split("Object_20_L", -3.5, "Object_20_wingstrip_L", "Object_20_tail_L")

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
