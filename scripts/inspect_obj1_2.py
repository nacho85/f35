import bpy

GLB_IN = r"C:\devs\f35\public\F-14-iran.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

# Buscar con nombre parcial
matches = [o for o in bpy.data.objects if o.type == "MESH" and "1_2" in o.name]
print(f"\nObjetos con '1_2': {[o.name for o in matches]}")

# Buscar fuselaje
fuselaje = [o for o in bpy.data.objects if "fuselage" in o.name.lower() or "3_fuse" in o.name.lower()]
print(f"Fuselaje candidates: {[o.name for o in fuselaje]}")

# Todos los meshes para referencia
all_meshes = sorted([o.name for o in bpy.data.objects if o.type == "MESH"])
print(f"\nTodos los meshes ({len(all_meshes)}):")
for n in all_meshes:
    print(f"  {n}")
