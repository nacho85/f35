import bpy, math
import bmesh, numpy as np

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

# Colorear: llanta=azul, strut=rojo
colors = {
    "F-35C-BODY.055":       (0.1, 0.3, 1.0),
    "F-35C-BODY.055_strut": (1.0, 0.2, 0.1),
    "F-35C-BODY.056":       (0.1, 0.3, 1.0),
    "F-35C-BODY.056_strut": (1.0, 0.2, 0.1),
}

objs = []
for name, col in colors.items():
    o = bpy.data.objects.get(name)
    if not o: print(f"WARN: {name} not found"); continue
    mat = bpy.data.materials.new(name + "_m")
    mat.use_nodes = True
    ns = mat.node_tree.nodes; ns.clear()
    emit = ns.new("ShaderNodeEmission")
    emit.inputs[0].default_value = (*col, 1)
    emit.inputs[1].default_value = 1.2
    out = ns.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(emit.outputs[0], out.inputs[0])
    o.data.materials.clear()
    o.data.materials.append(mat)
    objs.append(o)

# Ocultar todo excepto los 4 objetos
for o in bpy.data.objects:
    if o not in objs: o.hide_render = True

# Calcular bbox combinado en world space
all_wv = []
for o in objs:
    mw = o.matrix_world
    all_wv += [mw @ v.co for v in o.data.vertices]
wxs = [v.x for v in all_wv]; wys = [v.y for v in all_wv]; wzs = [v.z for v in all_wv]
wcx = (min(wxs)+max(wxs))/2; wcy = (min(wys)+max(wys))/2; wcz = (min(wzs)+max(wzs))/2
wspan = max(max(wxs)-min(wxs), max(wys)-min(wys), max(wzs)-min(wzs))
print(f"Center: ({wcx:.2f},{wcy:.2f},{wcz:.2f}) span={wspan:.2f}")

# Cámara desde -Y
cam_data = bpy.data.cameras.new("C"); cam_obj = bpy.data.objects.new("C", cam_data)
bpy.context.scene.collection.objects.link(cam_obj); bpy.context.scene.camera = cam_obj
cam_obj.location = (wcx, wcy - wspan * 2.2, wcz)
cam_obj.rotation_euler = (math.pi/2, 0, 0); cam_data.lens = 50

bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 16
bpy.context.scene.render.resolution_x = 1400; bpy.context.scene.render.resolution_y = 700
bpy.context.scene.render.filepath = "C:/devs/f35/scripts/renders/split_result.png"
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
print("[render] done")
