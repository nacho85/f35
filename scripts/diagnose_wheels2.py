import bpy, mathutils
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

# BODY056 — ver distribución de Z (world) para encontrar corte tire/strut
for name in ["F-35C-BODY.056", "F-35C-BODY.055"]:
    obj = bpy.data.objects.get(name)
    if not obj: continue
    wv = [obj.matrix_world @ v.co for v in obj.data.vertices]
    zs = sorted(v.z for v in wv)
    n  = len(zs)
    print(f"\n{name}  ({n} verts)")
    print(f"  Z percentiles: ", end="")
    for p in [0,10,20,30,40,50,60,70,80,90,100]:
        idx = min(int(p/100*n), n-1)
        print(f"p{p}={zs[idx]:.3f}", end="  ")
    print()

    # Histograma Z con 20 bins
    zmin, zmax = zs[0], zs[-1]
    bins = 20
    bw   = (zmax - zmin) / bins
    hist = [0]*bins
    for z in zs:
        b = min(int((z-zmin)/bw), bins-1)
        hist[b] += 1
    print("  Z histogram (each * = ~50 verts):")
    for i,h in enumerate(hist):
        lo = zmin + i*bw
        print(f"    {lo:.3f}-{lo+bw:.3f}: {'*'*(h//50)} ({h})")
