"""
Lista todos los clusters de Object_10_NosePivot con sus centroides en coords Three.js
para identificar cuál es la pieza que pertenece a ArmL.
"""
import bpy, bmesh, mathutils

GLB_IN = r"C:\devs\f35\public\F-14-iran-v4.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

pivot = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_NosePivot"), None)
arml  = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_ArmL"), None)
armr  = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_ArmR"), None)

print(f"\nObject_10_NosePivot: {len(pivot.data.vertices)} verts")
print(f"Object_10_ArmL:      {len(arml.data.vertices)} verts")
print(f"Object_10_ArmR:      {len(armr.data.vertices)} verts")

M = pivot.matrix_world
bm = bmesh.new()
bm.from_mesh(pivot.data)
bm.verts.ensure_lookup_table()

visited = set()
clusters = []
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
    clusters.append((len(comp), mathutils.Vector((cx, cy, cz))))
bm.free()

clusters.sort(key=lambda c: -c[0])

print(f"\nTotal clusters: {len(clusters)}")
print(f"\nTop 30 por tamaño (Three.js: tx=x, ty=z, tz=-y):")
print(f"{'verts':>7}  {'tx':>7}  {'ty':>7}  {'tz':>7}")
for n, c in clusters[:30]:
    tx, ty, tz = c.x, c.z, -c.y
    print(f"{n:>7}  {tx:>7.3f}  {ty:>7.3f}  {tz:>7.3f}")

Ma = arml.matrix_world
ws_a = [Ma @ v.co for v in arml.data.vertices]
cx_a = sum(v.x for v in ws_a)/len(ws_a)
cy_a = sum(v.y for v in ws_a)/len(ws_a)
cz_a = sum(v.z for v in ws_a)/len(ws_a)
print(f"\nArmL centroid (Three.js): tx={cx_a:.3f} ty={cz_a:.3f} tz={-cy_a:.3f}")

Mr = armr.matrix_world
ws_r = [Mr @ v.co for v in armr.data.vertices]
cx_r = sum(v.x for v in ws_r)/len(ws_r)
cy_r = sum(v.y for v in ws_r)/len(ws_r)
cz_r = sum(v.z for v in ws_r)/len(ws_r)
print(f"ArmR centroid (Three.js): tx={cx_r:.3f} ty={cz_r:.3f} tz={-cy_r:.3f}")
