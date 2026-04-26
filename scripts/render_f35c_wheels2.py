import bpy, math, numpy as np

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

targets = ["F-35C-BODY.055", "F-35C-BODY.056"]

# Ocultar todo excepto los targets
for o in bpy.data.objects:
    vis = o.name in targets
    o.hide_render   = not vis
    o.hide_viewport = not vis

# Calcular bounding box combinado
all_verts = []
for name in targets:
    o = bpy.data.objects.get(name)
    if o and o.type == 'MESH':
        mw = o.matrix_world
        all_verts += [mw @ v.co for v in o.data.vertices]

if not all_verts:
    print("ERROR: no verts found"); import sys; sys.exit(1)

xs = [v.x for v in all_verts]
ys = [v.y for v in all_verts]
zs = [v.z for v in all_verts]
cx, cy, cz = sum(xs)/len(xs), sum(ys)/len(ys), sum(zs)/len(zs)
span = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))
print(f"Center: ({cx:.3f}, {cy:.3f}, {cz:.3f})  span={span:.3f}")

# Crear cámara mirando desde +Z hacia el centro
cam_data = bpy.data.cameras.new("Cam")
cam_obj  = bpy.data.objects.new("Cam", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj
cam_obj.location = (cx, cy - span * 2, cz)
cam_obj.rotation_euler = (math.pi/2, 0, 0)
cam_data.lens = 50

# Luz
light_data = bpy.data.lights.new("L", type="SUN")
light_data.energy = 5
light_obj = bpy.data.objects.new("L", light_data)
bpy.context.scene.collection.objects.link(light_obj)
light_obj.location = (cx, cy - span*3, cz + span*2)
light_obj.rotation_euler = (math.pi/4, 0, 0)

# Fondo gris

bpy.context.scene.render.engine = "BLENDER_WORKBENCH"
bpy.context.scene.display.shading.light = "STUDIO"
bpy.context.scene.display.shading.color_type = "MATERIAL"
bpy.context.scene.render.resolution_x = 1400
bpy.context.scene.render.resolution_y = 700
bpy.context.scene.render.filepath = "C:/devs/f35/scripts/renders/f35c_wheels2.png"
bpy.context.scene.render.image_settings.file_format = "PNG"

import os; os.makedirs("C:/devs/f35/scripts/renders", exist_ok=True)
bpy.ops.render.render(write_still=True)
print("[render] done")
