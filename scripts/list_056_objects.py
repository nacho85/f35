import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")
for o in bpy.data.objects:
    if "056" in o.name:
        print(f"  '{o.name}'  type={o.type}  verts={len(o.data.vertices) if o.type=='MESH' else '-'}")
