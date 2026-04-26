"""Prints all mesh names in the exported GLB as Blender sees them on import."""
import bpy

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

meshes = sorted([o.name for o in bpy.context.scene.objects if o.type == "MESH"])
print(f"\n=== {len(meshes)} mesh nodes in GLB ===")
for n in meshes:
    print(f"  {n}")
