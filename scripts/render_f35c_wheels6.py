import bpy, math
import bmesh, numpy as np

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

def paint_y_gradient(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    ys = np.array([v.co.y for v in bm.verts])
    y_min, y_max = float(ys.min()), float(ys.max())
    print(f"{obj.name}: local Y {y_min:.3f}→{y_max:.3f}")
    col = bm.loops.layers.color.new("Col")
    for face in bm.faces:
        for loop in face.loops:
            t = (loop.vert.co.y - y_min) / (y_max - y_min)
            loop[col] = (t, 0.2, 1-t, 1)
    bm.to_mesh(obj.data); bm.free()
    mat = bpy.data.materials.new("VC")
    mat.use_nodes = True
    ns = mat.node_tree.nodes; ns.clear()
    attr = ns.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
    emit = ns.new("ShaderNodeEmission"); emit.inputs[1].default_value = 1.5
    out  = ns.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(attr.outputs[0], emit.inputs[0])
    mat.node_tree.links.new(emit.outputs[0], out.inputs[0])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return y_min, y_max

targets = ["F-35C-BODY.055", "F-35C-BODY.056"]
objs = []
for n in targets:
    o = bpy.data.objects.get(n)
    if o: paint_y_gradient(o); objs.append(o)

# Calcular bbox world combinado
all_wv = []
for o in objs:
    mw = o.matrix_world
    all_wv += [mw @ v.co for v in o.data.vertices]
wxs = [v.x for v in all_wv]; wys = [v.y for v in all_wv]; wzs = [v.z for v in all_wv]
wcx = (min(wxs)+max(wxs))/2; wcy = (min(wys)+max(wys))/2; wcz = (min(wzs)+max(wzs))/2
wspan = max(max(wxs)-min(wxs), max(wys)-min(wys), max(wzs)-min(wzs))
print(f"World combined center: ({wcx:.2f},{wcy:.2f},{wcz:.2f}) span={wspan:.2f}")

# Ocultar todo menos los targets
for o in bpy.data.objects:
    if o.name not in targets: o.hide_render = True

# Cámara mirando desde -Y
cam_data = bpy.data.cameras.new("C"); cam_obj = bpy.data.objects.new("C", cam_data)
bpy.context.scene.collection.objects.link(cam_obj); bpy.context.scene.camera = cam_obj
cam_obj.location = (wcx, wcy - wspan * 2.2, wcz)
cam_obj.rotation_euler = (math.pi/2, 0, 0)
cam_data.lens = 50

bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 16
bpy.context.scene.render.resolution_x = 1400; bpy.context.scene.render.resolution_y = 700
bpy.context.scene.render.filepath = "C:/devs/f35/scripts/renders/both_wheels_ygrad.png"
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
print("[render] done")
