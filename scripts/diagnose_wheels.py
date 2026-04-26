import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

for name in ["F-35C-BODY055", "F-35C-BODY.055", "F-35C-BODY056", "F-35C-BODY.056", "F-35C-BODY040", "F-35C-BODY.040"]:
    obj = bpy.data.objects.get(name)
    if not obj or obj.type != 'MESH':
        continue
    verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    xs = [v.x for v in verts]; ys = [v.y for v in verts]; zs = [v.z for v in verts]
    print(f"\n{name}:")
    print(f"  X: {min(xs):.3f} → {max(xs):.3f}  (span {max(xs)-min(xs):.3f})")
    print(f"  Y: {min(ys):.3f} → {max(ys):.3f}  (span {max(ys)-min(ys):.3f})")
    print(f"  Z: {min(zs):.3f} → {max(zs):.3f}  (span {max(zs)-min(zs):.3f})")
    print(f"  verts: {len(verts)}")
