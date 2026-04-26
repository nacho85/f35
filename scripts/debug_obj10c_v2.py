import bpy, bmesh
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\F-14-iran-v4.glb")
orig = bpy.data.objects.get("Object_10_C")
if not orig:
    print("[!] no encontrado"); raise SystemExit
M = orig.matrix_world
print(f"Object_10_C: {len(orig.data.vertices)} verts")
bm = bmesh.new()
bm.from_mesh(orig.data)
bm.verts.ensure_lookup_table()
visited = set()
clusters = []
for start in bm.verts:
    if start.index in visited:
        continue
    comp = []
    stack = [start]
    while stack:
        v = stack.pop()
        if v.index in visited:
            continue
        visited.add(v.index)
        comp.append(v.index)
        for e in v.link_edges:
            nb = e.other_vert(v)
            if nb.index not in visited:
                stack.append(nb)
    ws = [M @ orig.data.vertices[vi].co for vi in comp]
    cx = sum(v.x for v in ws)/len(ws)
    cy = sum(v.y for v in ws)/len(ws)
    cz = sum(v.z for v in ws)/len(ws)
    clusters.append((len(comp), cx, cz, -cy))
bm.free()
clusters.sort(key=lambda r: -r[0])
print(f"Total clusters: {len(clusters)}")
print(f"{'#verts':>7}  {'tx':>8}  {'ty(h)':>8}  {'tz(nose)':>9}")
for n, tx, ty, tz in clusters[:20]:
    print(f"{n:>7}  {tx:>8.3f}  {ty:>8.3f}  {tz:>9.3f}")
