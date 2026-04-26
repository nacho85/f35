import bpy, numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

for obj_name in ["F-35C-BODY.055", "F-35C-BODY.056"]:
    obj = bpy.data.objects.get(obj_name)
    if not obj or obj.type != 'MESH': continue

    # Usar bmesh para acceder a la geometría real (con modificadores aplicados)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    verts = np.array([v.co for v in bm.verts])
    bm.free()

    print(f"\n=== {obj_name} ({len(verts)} verts) ===")
    print(f"  X: {verts[:,0].min():.3f} → {verts[:,0].max():.3f}")
    print(f"  Y: {verts[:,1].min():.3f} → {verts[:,1].max():.3f}")
    print(f"  Z: {verts[:,2].min():.3f} → {verts[:,2].max():.3f}")

    # Histograma Y con más bins
    hist, edges = np.histogram(verts[:,1], bins=30)
    maxh = max(hist)
    print("  Y histogram (eje vertical en Blender = altura en GLB):")
    for h, e0, e1 in zip(hist, edges[:-1], edges[1:]):
        bar = "#" * (h * 50 // maxh)
        print(f"    {e0:7.3f}–{e1:7.3f}  {h:5d}  {bar}")

    # Buscar gap natural (bin casi vacío) — ahí está el corte strut/llanta
    gaps = [(i, h) for i, h in enumerate(hist) if h < maxh * 0.05]
    print(f"  Posibles cortes: {[(f'{edges[i]:.3f}–{edges[i+1]:.3f}', h) for i, h in gaps]}")
