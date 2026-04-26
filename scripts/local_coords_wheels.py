import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

for name in ["F-35C-BODY.055", "F-35C-BODY.056"]:
    obj = bpy.data.objects.get(name)
    if not obj: continue
    lv = [v.co for v in obj.data.vertices]  # LOCAL coords
    xs = sorted(v.x for v in lv)
    ys = sorted(v.y for v in lv)
    zs = sorted(v.z for v in lv)
    n  = len(lv)
    print(f"\n{name}  ({n} verts)  LOCAL coords:")
    print(f"  X: {xs[0]:.3f} → {xs[-1]:.3f}")
    print(f"  Y: {ys[0]:.3f} → {ys[-1]:.3f}")
    print(f"  Z: {zs[0]:.3f} → {zs[-1]:.3f}")

    # Histograma Y local (eje que usó el script anterior)
    ymin, ymax = ys[0], ys[-1]
    bins = 20; bw = (ymax-ymin)/bins
    hist = [0]*bins
    for y in ys:
        b = min(int((y-ymin)/bw), bins-1); hist[b] += 1
    print("  Y-local histogram (cada * ≈ 50 verts):")
    for i,h in enumerate(hist):
        lo = ymin + i*bw
        mark = '*'*(h//50)
        print(f"    {lo:+.3f} → {lo+bw:+.3f}: {mark} ({h})")
