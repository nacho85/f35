"""
Separate the canopy frame from Object_4 (MiG-29-airframe).
Seeds from the clicked world position, selects linked geometry, separates.
"""
import bpy
import bmesh
import mathutils

MIG_IN  = r"C:\devs\f35\public\mig-29-clean.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-clean.glb"

# World position clicked on the canopy frame
SEED_WORLD = mathutils.Vector((63.54, 9.41, -4.12))

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=MIG_IN)

obj4 = next(o for o in bpy.context.scene.objects if o.name == "Object_4")
bpy.context.view_layer.objects.active = obj4
obj4.select_set(True)

# Convert seed to local space
seed_local = obj4.matrix_world.inverted() @ SEED_WORLD

bpy.ops.object.mode_set(mode="EDIT")
bm = bmesh.from_edit_mesh(obj4.data)
bm.verts.ensure_lookup_table()

# Find closest vertex to seed
best = min(bm.verts, key=lambda v: (v.co - seed_local).length)
print(f"Seed vertex: {best.co}, dist: {(best.co - seed_local).length:.3f}")

# Deselect all, then select linked from seed
bpy.ops.mesh.select_all(action="DESELECT")
bm.verts.ensure_lookup_table()
best.select = True
bmesh.update_edit_mesh(obj4.data)
bpy.ops.mesh.select_linked()

# Count selected
sel = sum(1 for v in bm.verts if v.select)
print(f"Selected {sel} vertices")

# Separate
bpy.ops.mesh.separate(type="SELECTED")
bpy.ops.object.mode_set(mode="OBJECT")

# Rename new object
for o in bpy.context.scene.objects:
    if o.type == "MESH" and o.name not in [
        "Object_4","Object_6","Object_6.001","Object_8","Object_10",
        "Object_12","Object_14","Object_16","Object_18","Object_20"
    ] and "airframe" in (o.data.materials[0].name if o.data.materials else ""):
        o.name = "Object_canopy_frame"
        print(f"Renamed to: {o.name}")

for o in bpy.context.scene.objects:
    if o.type == "MESH":
        print(f"  {o.name}: {[m.name for m in o.data.materials]}")

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_image_format="AUTO")
print(f"\nOK {GLB_OUT}")
