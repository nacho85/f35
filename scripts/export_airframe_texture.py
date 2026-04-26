import bpy

MIG_IN   = r"C:\devs\f35\public\mig-29-clean.glb"
PNG_OUT  = r"C:\devs\f35\public\mig29_airframe_clean.png"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=MIG_IN)

img = None
for image in bpy.data.images:
    if image.size[0] > 0:
        img = image
        break

img.filepath_raw = PNG_OUT
img.file_format = "PNG"
img.save()
print(f"OK {PNG_OUT}  ({img.size[0]}x{img.size[1]})")
