"""Debug: lista los clusters dentro del NoseGear zone para identificar la compuerta."""
import bpy, bmesh
from mathutils import Vector

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
    clusters.append((len(comp), cx, cy, cz))

bm.free()

# Mostrar todos los clusters con sus coordenadas (Three.js)
# Solo los que podrían ser nosegear (tz > 3) ordenados por tx
nosegear_zone = [(n, cx, cy, cz) for n, cx, cy, cz in clusters if -cy > 3.0]
nosegear_zone.sort(key=lambda r: r[1])  # ordenar por tx

print(f"\nClusters con tz>3 (zona nariz), {len(nosegear_zone)} total:")
print(f"{'#verts':>7}  {'tx=Bx':>7}  {'ty=Bz':>7}  {'tz=-By':>7}")
for n, cx, cy, cz in nosegear_zone:
    print(f"{n:>7}  {cx:>7.2f}  {cz:>7.2f}  {-cy:>7.2f}")
