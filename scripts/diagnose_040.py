import bpy, bmesh
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

obj = bpy.data.objects.get("F-35C-BODY.040")
assert obj and obj.type == 'MESH'

lv = obj.data.vertices
xs = [v.co.x for v in lv]; ys = [v.co.y for v in lv]; zs = [v.co.z for v in lv]
print(f"BODY.040  {len(lv)} verts  LOCAL:")
print(f"  X: {min(xs):.3f} → {max(xs):.3f}  span {max(xs)-min(xs):.3f}")
print(f"  Y: {min(ys):.3f} → {max(ys):.3f}  span {max(ys)-min(ys):.3f}")
print(f"  Z: {min(zs):.3f} → {max(zs):.3f}  span {max(zs)-min(zs):.3f}")

# Histograma Y local — eje más largo
ymin, ymax = min(ys), max(ys)
bins = 24; bw = (ymax-ymin)/bins
hist = [0]*bins
for y in ys:
    b = min(int((y-ymin)/bw), bins-1); hist[b] += 1
print("\n  Y-local histogram (cada * ≈ 30 verts):")
for i,h in enumerate(hist):
    lo = ymin + i*bw
    print(f"    {lo:+.3f} → {lo+bw:+.3f}: {'*'*(h//30)} ({h})")

# Componentes conexas por isla
bm = bmesh.new(); bm.from_mesh(obj.data)
bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
visited = set(); islands = []
for start in bm.verts:
    if start.index in visited: continue
    island = set(); stack = [start]
    while stack:
        v = stack.pop()
        if v.index in visited: continue
        visited.add(v.index); island.add(v.index)
        for e in v.link_edges: stack.append(e.other_vert(v))
    islands.append(island)
bm.free()

print(f"\n  Islas conexas: {len(islands)}")
for i, isl in enumerate(sorted(islands, key=len, reverse=True)[:10]):
    iverts = [obj.data.vertices[vi] for vi in isl]
    iy = [v.co.y for v in iverts]
    iz = [v.co.z for v in iverts]
    ix = [v.co.x for v in iverts]
    print(f"    isla {i+1}: {len(isl)} verts  Y:{min(iy):.3f}→{max(iy):.3f}  Z:{min(iz):.3f}→{max(iz):.3f}  X:{min(ix):.3f}→{max(ix):.3f}")
