import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

meshes = sorted([o.name for o in bpy.context.scene.objects if o.type == "MESH"])
print(f"\n{len(meshes)} mesh objects:\n")
for name in meshes:
    print(f"  {name}")
