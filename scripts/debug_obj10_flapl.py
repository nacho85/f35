"""Analiza los clusters dentro de la zona FlapL (tx>3.5, tz<0.5) para identificar flap vs spoiler."""
import bpy, bmesh

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\F-14-iran.glb")

orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10"), None)
M = orig.matrix_world

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
    clusters.append((len(comp), cx, cz, -cy))  # (n, tx, ty_altura, tz)

bm.free()

# Solo zona FlapL: tx>3.5, tz<0.5
flapl = [(n, tx, ty, tz) for n, tx, ty, tz in clusters if tx > 3.5 and tz < 0.5]
flapl.sort(key=lambda r: -r[0])

print(f"\nClusters zona FlapL (tx>3.5, tz<0.5): {len(flapl)} clusters, {sum(n for n,*_ in flapl)} verts")
print(f"{'#verts':>7}  {'tx':>7}  {'ty(h)':>7}  {'tz':>8}")
for n, tx, ty, tz in flapl[:50]:
    print(f"{n:>7}  {tx:>7.3f}  {ty:>7.3f}  {tz:>8.3f}")

# Resumen por tz (tz negativo = más hacia atrás)
print(f"\nDistribución por tz:")
tz_vals = [tz for _, _, _, tz in flapl]
print(f"  tz min={min(tz_vals):.3f}  max={max(tz_vals):.3f}")
# Buscar gap
tz_sorted = sorted(set(round(tz,1) for _,_,_,tz in flapl))
print(f"  tz deciles: {tz_sorted[:10]} ...")

# Distribución por tx
tx_vals = [tx for _, tx, _, _ in flapl]
print(f"  tx min={min(tx_vals):.3f}  max={max(tx_vals):.3f}")
