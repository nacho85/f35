import bpy, numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

# Listar todos los objetos con 055 o 056 y su mesh data
for o in bpy.data.objects:
    if ("055" in o.name or "056" in o.name) and o.type == 'MESH':
        m = o.data
        verts = np.array([v.co for v in m.vertices])
        print(f"\n=== obj='{o.name}'  mesh='{m.name}'  {len(verts)} verts ===")
        if len(verts) < 10:
            print("  (muy pocos verts — objeto incorrecto)")
            continue
        print(f"  X: {verts[:,0].min():.3f} → {verts[:,0].max():.3f}")
        print(f"  Y: {verts[:,1].min():.3f} → {verts[:,1].max():.3f}")
        print(f"  Z: {verts[:,2].min():.3f} → {verts[:,2].max():.3f}")
        hist, edges = np.histogram(verts[:,1], bins=20)
        print("  Y histogram:")
        for h, e0, e1 in zip(hist, edges[:-1], edges[1:]):
            bar = "#" * (h * 40 // max(hist, default=1))
            print(f"    {e0:7.3f}–{e1:7.3f}  {h:5d}  {bar}")

# También buscar por mesh data name
print("\n=== Meshes Plane.056 y Plane.057 directamente ===")
for mname in ["Plane.056", "Plane.057"]:
    m = bpy.data.meshes.get(mname)
    if not m: continue
    verts = np.array([v.co for v in m.vertices])
    print(f"\n  mesh='{mname}'  {len(verts)} verts")
    print(f"  X: {verts[:,0].min():.3f} → {verts[:,0].max():.3f}")
    print(f"  Y: {verts[:,1].min():.3f} → {verts[:,1].max():.3f}")
    print(f"  Z: {verts[:,2].min():.3f} → {verts[:,2].max():.3f}")
    hist, edges = np.histogram(verts[:,1], bins=20)
    print("  Y histogram:")
    for h, e0, e1 in zip(hist, edges[:-1], edges[1:]):
        bar = "#" * (h * 40 // max(hist, default=1))
        print(f"    {e0:7.3f}–{e1:7.3f}  {h:5d}  {bar}")
