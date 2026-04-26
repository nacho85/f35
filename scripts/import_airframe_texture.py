import bpy

MIG_IN   = r"C:\devs\f35\public\mig-29-clean.glb"
PNG_IN   = r"C:\devs\f35\public\mig29_airframe_clean.png"
GLB_OUT  = r"C:\devs\f35\public\mig-29-clean.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=MIG_IN)

img = None
for image in bpy.data.images:
    if image.size[0] > 0:
        img = image
        break

new_img = bpy.data.images.load(PNG_IN)
new_img.colorspace_settings.name = "sRGB"

# Copy pixels into the existing image (preserves all UV/metadata)
import numpy as np
src = np.array(new_img.pixels[:], dtype=np.float32)
img.pixels = src.tolist()
img.pack()

bpy.data.images.remove(new_img)

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_image_format="AUTO")
print(f"OK {GLB_OUT}")
