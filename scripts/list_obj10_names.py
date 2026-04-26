import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\F-14-iran.glb")
names = sorted(o.name for o in bpy.data.objects if "10" in o.name)
for n in names:
    obj = bpy.data.objects[n]
    verts = len(obj.data.vertices) if obj.type == "MESH" else "n/a"
    print(f"  {n:40s} {verts}")
