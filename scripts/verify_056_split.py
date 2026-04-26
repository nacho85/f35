import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

colors = {
    "F-35C-BODY.056":       (0.1, 0.4, 1.0),
    "F-35C-BODY.056_strut": (1.0, 0.2, 0.1),
}
objs = []
for name, col in colors.items():
    o = bpy.data.objects.get(name)
    if not o: print(f"WARN: {name} not found"); continue
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    ns = mat.node_tree.nodes; ns.clear()
    emit = ns.new("ShaderNodeEmission")
    emit.inputs[0].default_value = (*col, 1)
    emit.inputs[1].default_value = 1.4
    out = ns.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(emit.outputs[0], out.inputs[0])
    o.data.materials.clear(); o.data.materials.append(mat)
    objs.append(o)
    print(f"  {name}: {len(o.data.vertices)} verts")

for o in bpy.data.objects:
    if o not in objs: o.hide_render = True

all_wv = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
wxs=[v.x for v in all_wv]; wys=[v.y for v in all_wv]; wzs=[v.z for v in all_wv]
wcx=(min(wxs)+max(wxs))/2; wcy=(min(wys)+max(wys))/2; wcz=(min(wzs)+max(wzs))/2
wspan=max(max(wxs)-min(wxs),max(wys)-min(wys),max(wzs)-min(wzs))

cam_data=bpy.data.cameras.new("C"); cam_obj=bpy.data.objects.new("C",cam_data)
bpy.context.scene.collection.objects.link(cam_obj); bpy.context.scene.camera=cam_obj
cam_obj.location=(wcx,wcy-wspan*2,wcz); cam_obj.rotation_euler=(math.pi/2,0,0); cam_data.lens=60

bpy.context.scene.render.engine="CYCLES"
bpy.context.scene.cycles.samples=16
bpy.context.scene.render.resolution_x=800; bpy.context.scene.render.resolution_y=800
bpy.context.scene.render.filepath="C:/devs/f35/scripts/renders/verify_056_split.png"
bpy.context.scene.render.image_settings.file_format="PNG"
bpy.ops.render.render(write_still=True)
print("[render] done")
