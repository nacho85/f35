import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

# Ocultar todo excepto BODY.055 y BODY.056
for o in bpy.data.objects:
    o.hide_render = True
    o.hide_viewport = True

targets = ["F-35C-BODY.055", "F-35C-BODY.056"]
for name in targets:
    o = bpy.data.objects.get(name)
    if o:
        o.hide_render = False
        o.hide_viewport = False

# Cámara — centrada entre ambos objetos
cam_data = bpy.data.cameras.new("Cam")
cam_obj  = bpy.data.objects.new("Cam", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# Centrar en el medio del grupo (aprox)
# BODY.055 está en ~(0.4, 2.6, 2.6), BODY.056 en ~(2.6, 2.7, 2.6)
cam_obj.location = (1.5, 0.5, 5.5)
cam_obj.rotation_euler = (0, 0, 0)
cam_data.lens = 80

# Luz
light_data = bpy.data.lights.new("Light", type="SUN")
light_data.energy = 3
light_obj  = bpy.data.objects.new("Light", light_data)
bpy.context.scene.collection.objects.link(light_obj)
light_obj.location = (5, 5, 10)

# Render
bpy.context.scene.render.engine = "BLENDER_WORKBENCH"
bpy.context.scene.render.resolution_x = 1200
bpy.context.scene.render.resolution_y = 600
bpy.context.scene.render.filepath = "C:/devs/f35/scripts/renders/f35c_wheels.png"
bpy.context.scene.render.image_settings.file_format = "PNG"

import os; os.makedirs("C:/devs/f35/scripts/renders", exist_ok=True)
bpy.ops.render.render(write_still=True)
print("[render] done → C:/devs/f35/scripts/renders/f35c_wheels.png")
