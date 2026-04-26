import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb.bak_presplit")

for name in ["F-35C-BODY.055", "F-35C-BODY.056"]:
    o = bpy.data.objects.get(name)
    if not o: continue
    print(f"\n{name}:")
    print(f"  modifiers: {[m.type for m in o.modifiers]}")
    print(f"  vertex_groups: {[vg.name for vg in o.vertex_groups[:5]]}{'...' if len(o.vertex_groups)>5 else ''}")
    print(f"  parent: {o.parent.name if o.parent else None}")
    print(f"  shape_keys: {o.data.shape_keys is not None}")
    # Ver si tiene skin weights
    has_weights = any(len(o.data.vertices[0].groups) > 0 for v in o.data.vertices[:5] for _ in [1])
    print(f"  has skin weights: {has_weights}")
