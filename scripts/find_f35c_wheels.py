import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")
print("=== All objects with 055 or 056 ===")
for o in sorted(bpy.data.objects, key=lambda x: x.name):
    n = o.name.upper()
    if "055" in n or "056" in n:
        verts = len(o.data.vertices) if o.type == 'MESH' else '-'
        print(f"  obj='{o.name}'  data='{o.data.name if o.data else '-'}'  type={o.type}  verts={verts}")

print("=== All mesh data with 055 or 056 ===")
for m in bpy.data.meshes:
    if "055" in m.name.upper() or "056" in m.name.upper():
        print(f"  mesh='{m.name}'  verts={len(m.vertices)}")
