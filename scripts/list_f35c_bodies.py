import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")
for o in sorted(bpy.data.objects, key=lambda x: x.name):
    if "BODY05" in o.name.upper():
        print(f"  '{o.name}'  type={o.type}  verts={len(o.data.vertices) if o.type=='MESH' else '-'}")
