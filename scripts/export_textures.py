import bpy, os

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\F-14-iran.glb")

out_dir = r"C:\devs\f35\public\textures_debug"
os.makedirs(out_dir, exist_ok=True)

for img in bpy.data.images:
    if img.size[0] == 0: continue
    path = os.path.join(out_dir, img.name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    print(f"Saved: {path}  ({img.size[0]}x{img.size[1]})")
