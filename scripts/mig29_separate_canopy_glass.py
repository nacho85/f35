"""
Separate Object_6 (canopy) into glass and frame as two distinct objects,
then export back to mig-29-clean.glb.
"""
import bpy

MIG_IN  = r"C:\devs\f35\public\mig-29-super-clean.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-anim.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=MIG_IN)

# Find Object_6
obj6 = next((o for o in bpy.context.scene.objects if o.name == "Object_6"), None)
if not obj6:
    print("ERROR: Object_6 not found")
    raise SystemExit

print(f"Object_6 materials: {[m.name for m in obj6.data.materials]}")

# Select only Object_6
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = obj6
obj6.select_set(True)

# Enter Edit Mode and separate by material
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

# Log resulting objects
for o in bpy.context.scene.objects:
    if o.type == "MESH":
        mats = [m.name for m in o.data.materials]
        print(f"  {o.name}: {mats}")

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_image_format="AUTO")
print(f"\nOK {GLB_OUT}")
