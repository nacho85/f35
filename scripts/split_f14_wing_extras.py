"""
Splits Object_10 and Object_21 (dual-wing meshes) into per-side parts
so the wing sweep animation can move each side independently.

Parts with centroid X > PIVOT_X  → name_R  (right, will be parented to Object_27)
Parts with centroid X < -PIVOT_X → name_L  (left,  will be parented to Object_28)
Remaining (near center)          → name_C  (fixed, stays as-is)

Run: blender --background --python scripts/split_f14_wing_extras.py
"""
import bpy
import mathutils
import os

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"  # overwrite same file

PIVOT_X = 2.0          # Blender world X — inner edge of the glove
TARGETS = ["Object_10", "Object_21"]

# ── Load ──────────────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_x(obj):
    verts_world = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.x for v in verts_world) / len(verts_world)

def split_object(base_name):
    """Separate a dual-wing mesh into _R / _L / _C pieces by X centroid."""
    base = bpy.data.objects.get(base_name)
    if base is None:
        print(f"[warn] {base_name} not found, skipping")
        return

    # Select only this object and separate loose parts
    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True)
    bpy.context.view_layer.objects.active = base

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Collect all pieces that came from this object (Blender names them base_name, base_name.001, etc.)
    pieces = [o for o in bpy.context.scene.objects
              if o.type == "MESH" and o.name.startswith(base_name)]
    print(f"[{base_name}] separated into {len(pieces)} loose pieces")

    right_pieces  = []
    left_pieces   = []
    center_pieces = []

    for p in pieces:
        cx = centroid_x(p)
        if cx > PIVOT_X:
            right_pieces.append(p)
        elif cx < -PIVOT_X:
            left_pieces.append(p)
        else:
            center_pieces.append(p)

    print(f"  right={len(right_pieces)}  left={len(left_pieces)}  center={len(center_pieces)}")

    def merge_and_rename(piece_list, new_name):
        if not piece_list:
            return
        # Deselect all
        bpy.ops.object.select_all(action="DESELECT")
        for p in piece_list:
            p.select_set(True)
        bpy.context.view_layer.objects.active = piece_list[0]
        if len(piece_list) > 1:
            bpy.ops.object.join()
        bpy.context.active_object.name = new_name
        print(f"  → merged & renamed to {new_name}")

    merge_and_rename(right_pieces,  f"{base_name}_R")
    merge_and_rename(left_pieces,   f"{base_name}_L")
    merge_and_rename(center_pieces, f"{base_name}_C")

for name in TARGETS:
    split_object(name)

# ── Export ────────────────────────────────────────────────────────────────────
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
print(f"\n[done] Exported → {GLB_OUT}")
