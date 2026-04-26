"""
Second pass: splits Object_19 and Object_20 into per-side wing parts.
Object_20: vertical tails (center) vs trailing-edge strips (left/right)
Object_19: engine nozzle area (center) vs left-wing trailing-edge panels (left)

Run: blender --background --python scripts/split_f14_wing_extras2.py
"""
import bpy
import mathutils

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

PIVOT_X = 2.0   # inner glove boundary
TARGETS = ["Object_19", "Object_20"]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def centroid_x(obj):
    verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.x for v in verts) / max(len(verts), 1)

def split_object(base_name):
    base = bpy.data.objects.get(base_name)
    if base is None:
        print(f"[warn] {base_name} not found, skipping")
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
    print(f"[{base_name}] {len(pieces)} loose pieces")

    right, left, center = [], [], []
    for p in pieces:
        cx = centroid_x(p)
        if   cx >  PIVOT_X: right.append(p)
        elif cx < -PIVOT_X: left.append(p)
        else:                center.append(p)

    print(f"  right={len(right)}  left={len(left)}  center={len(center)}")

    def merge_rename(lst, new_name):
        if not lst: return
        bpy.ops.object.select_all(action="DESELECT")
        for p in lst: p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1:
            bpy.ops.object.join()
        bpy.context.active_object.name = new_name
        print(f"  → {new_name}")

    merge_rename(right,  f"{base_name}_R")
    merge_rename(left,   f"{base_name}_L")
    merge_rename(center, f"{base_name}_C")

for name in TARGETS:
    split_object(name)

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
