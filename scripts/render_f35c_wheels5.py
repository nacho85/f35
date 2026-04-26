import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

import bmesh, numpy as np

obj = bpy.data.objects.get("F-35C-BODY.055")

bm = bmesh.new()
bm.from_mesh(obj.data)
bm.verts.ensure_lookup_table()
ys = np.array([v.co.y for v in bm.verts])
y_min, y_max = float(ys.min()), float(ys.max())
print(f"BODY.055 local Y: {y_min:.3f} → {y_max:.3f}")

col_layer = bm.loops.layers.color.new("Col")
for face in bm.faces:
    for loop in face.loops:
        t = (loop.vert.co.y - y_min) / (y_max - y_min)
        loop[col_layer] = (t, 0.2, 1-t, 1)
bm.to_mesh(obj.data); bm.free()

mat = bpy.data.materials.new("VC")
mat.use_nodes = True
nodes = mat.node_tree.nodes; nodes.clear()
attr = nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
bsdf = nodes.new("ShaderNodeBsdfDiffuse")
out  = nodes.new("ShaderNodeOutputMaterial")
mat.node_tree.links.new(attr.outputs[0], bsdf.inputs[0])
mat.node_tree.links.new(bsdf.outputs[0], out.inputs[0])
obj.data.materials.clear()
obj.data.materials.append(mat)

mw = obj.matrix_world
world_verts = [mw @ v.co for v in obj.data.vertices]
wxs = [v.x for v in world_verts]; wys = [v.y for v in world_verts]; wzs = [v.z for v in world_verts]
wcx = (min(wxs)+max(wxs))/2; wcy = (min(wys)+max(wys))/2; wcz = (min(wzs)+max(wzs))/2
wspan = max(max(wxs)-min(wxs), max(wys)-min(wys), max(wzs)-min(wzs))

cam_data = bpy.data.cameras.new("C"); cam_obj = bpy.data.objects.new("C", cam_data)
bpy.context.scene.collection.objects.link(cam_obj); bpy.context.scene.camera = cam_obj
cam_obj.location = (wcx - wspan*1.8, wcy, wcz)
cam_obj.rotation_euler = (math.pi/2, 0, -math.pi/2)
cam_data.lens = 55

for o in bpy.data.objects:
    if o != obj and o != cam_obj: o.hide_render = True

bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 64
bpy.context.scene.render.resolution_x = 900; bpy.context.scene.render.resolution_y = 900
bpy.context.scene.render.filepath = "C:/devs/f35/scripts/renders/wheel055_ygrad.png"
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
print("[render] done")
