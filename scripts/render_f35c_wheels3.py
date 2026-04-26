import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

# Solo BODY.056 (la de perfil), coloreada para ver strut vs llanta
for o in bpy.data.objects:
    o.hide_render = True

obj = bpy.data.objects.get("F-35C-BODY.056")
obj.hide_render = False

# Colorear verts por Y: rojo=alto (strut?) verde=bajo (llanta?)
import bmesh, numpy as np
bm = bmesh.new()
bm.from_mesh(obj.data)
bm.verts.ensure_lookup_table()
ys = np.array([v.co.y for v in bm.verts])
y_min, y_max = ys.min(), ys.max()

color_layer = bm.loops.layers.color.new("Col")
for face in bm.faces:
    for loop in face.loops:
        t = (loop.vert.co.y - y_min) / (y_max - y_min)
        # rojo = alto Y, azul = bajo Y
        loop[color_layer] = (t, 0.1, 1-t, 1)

bm.to_mesh(obj.data)
bm.free()

# Material vertex color
mat = bpy.data.materials.new("VertCol")
mat.use_nodes = True
nodes = mat.node_tree.nodes
nodes.clear()
attr = nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
emit = nodes.new("ShaderNodeEmission")
out  = nodes.new("ShaderNodeOutputMaterial")
mat.node_tree.links.new(attr.outputs[0], emit.inputs[0])
mat.node_tree.links.new(emit.outputs[0], out.inputs[0])
obj.data.materials.clear()
obj.data.materials.append(mat)

# Cámara desde el frente
cx, cy, cz = 2.6, 2.74, 2.59
cam_data = bpy.data.cameras.new("C"); cam_obj = bpy.data.objects.new("C", cam_data)
bpy.context.scene.collection.objects.link(cam_obj); bpy.context.scene.camera = cam_obj
cam_obj.location = (cx - 2, cy, cz); cam_obj.rotation_euler = (math.pi/2, 0, -math.pi/2)
cam_data.lens = 80

bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 32
bpy.context.scene.render.resolution_x = 800; bpy.context.scene.render.resolution_y = 800
bpy.context.scene.render.filepath = "C:/devs/f35/scripts/renders/f35c_wheel056_ycolor.png"
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
print("[render] done")
