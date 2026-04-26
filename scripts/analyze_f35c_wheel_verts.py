import bpy, numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

for name in ["F-35C-BODY.055", "F-35C-BODY.056"]:
    obj = bpy.data.objects.get(name)
    if not obj or obj.type != 'MESH': continue
    verts = np.array([v.co for v in obj.data.vertices])
    print(f"\n=== {name} ({len(verts)} verts) ===")
    print(f"  X: {verts[:,0].min():.3f} → {verts[:,0].max():.3f}")
    print(f"  Y: {verts[:,1].min():.3f} → {verts[:,1].max():.3f}")
    print(f"  Z: {verts[:,2].min():.3f} → {verts[:,2].max():.3f}")

    # Histograma Y — ver si hay dos clusters claros
    hist, edges = np.histogram(verts[:,1], bins=20)
    print("  Y histogram:")
    for i, (h, e0, e1) in enumerate(zip(hist, edges[:-1], edges[1:])):
        bar = "#" * (h * 40 // max(hist))
        print(f"    {e0:7.3f}–{e1:7.3f}  {h:5d}  {bar}")
