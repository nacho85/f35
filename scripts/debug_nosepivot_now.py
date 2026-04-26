import bpy, bmesh
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\F-14-iran-v4.glb")
pivot = next(o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_NosePivot")
M = pivot.matrix_world
print(f"NosePivot: {len(pivot.data.vertices)} verts")
bm = bmesh.new(); bm.from_mesh(pivot.data); bm.verts.ensure_lookup_table()
visited = set(); clusters = []
for start in bm.verts:
    if start.index in visited: continue
    comp = []; stack = [start]
    while stack:
        v = stack.pop()
        if v.index in visited: continue
        visited.add(v.index); comp.append(v.index)
        for e in v.link_edges:
            nb = e.other_vert(v)
            if nb.index not in visited: stack.append(nb)
    ws = [M @ pivot.data.vertices[vi].co for vi in comp]
    cx = sum(v.x for v in ws)/len(ws)
    cy = sum(v.y for v in ws)/len(ws)
    cz = sum(v.z for v in ws)/len(ws)
    clusters.append((len(comp), cx, cz, -cy))
bm.free()
clusters.sort(key=lambda c: -c[0])
print(f"Clusters: {len(clusters)}")
print(f"{'verts':>6}  {'tx':>7}  {'ty':>7}  {'tz':>7}")
for n, tx, ty, tz in clusters[:40]:
    print(f"{n:>6}  {tx:>7.3f}  {ty:>7.3f}  {tz:>7.3f}")
