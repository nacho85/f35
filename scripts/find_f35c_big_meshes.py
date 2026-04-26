import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

# Buscar objetos con ~14000-16000 verts (los dos meshes de rueda trasera)
print("=== Objetos con 10k-20k verts ===")
for o in sorted(bpy.data.objects, key=lambda x: x.name):
    if o.type != 'MESH': continue
    n = len(o.data.vertices)
    if 10000 < n < 20000:
        print(f"  '{o.name}'  mesh='{o.data.name}'  verts={n}")

# También listar todos los objetos tipo MESH con nombre que contenga números >050
print("\n=== Objetos MESH con '05' en el nombre ===")
for o in sorted(bpy.data.objects, key=lambda x: x.name):
    if o.type != 'MESH': continue
    if '05' in o.name:
        print(f"  '{o.name}'  verts={len(o.data.vertices)}")
