import bpy
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\F-14-iran.glb")

obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10"), None)
if not obj:
    print("NOT FOUND"); raise SystemExit

M = obj.matrix_world
print(f"Object_10: {len(obj.data.vertices)} verts")

# Bucket vertices by zone using loose parts info
# Three.js: x=Bx, y=Bz, z=-By
# Print overall bounds first
mn = Vector((float('inf'),)*3)
mx = Vector((float('-inf'),)*3)
for v in obj.data.vertices:
    w = M @ v.co
    mn.x = min(mn.x, w.x); mn.y = min(mn.y, w.y); mn.z = min(mn.z, w.z)
    mx.x = max(mx.x, w.x); mx.y = max(mx.y, w.y); mx.z = max(mx.z, w.z)

print(f"Blender  x=[{mn.x:.2f},{mx.x:.2f}]  y=[{mn.y:.2f},{mx.y:.2f}]  z=[{mn.z:.2f},{mx.z:.2f}]")
print(f"Three.js x=[{mn.x:.2f},{mx.x:.2f}]  y=[{mn.z:.2f},{mx.z:.2f}]  z=[{-mx.y:.2f},{-mn.y:.2f}]")

# Separate by loose parts and report each cluster
import bmesh
bm = bmesh.new()
bm.from_mesh(obj.data)
bm.verts.ensure_lookup_table()
bm.edges.ensure_lookup_table()

# Find connected components
visited = set()
clusters = []
for start in bm.verts:
    if start.index in visited:
        continue
    cluster = []
    stack = [start]
    while stack:
        v = stack.pop()
        if v.index in visited:
            continue
        visited.add(v.index)
        cluster.append(v.index)
        for e in v.link_edges:
            other = e.other_vert(v)
            if other.index not in visited:
                stack.append(other)
    clusters.append(cluster)

bm.free()

print(f"\nLoose parts: {len(clusters)}")
print(f"{'#':>3}  {'verts':>6}  {'Bx':>7}  {'By':>7}  {'Bz':>7}  (Three.js: {'tx':>7} {'ty':>7} {'tz':>7})")
for i, cl in enumerate(sorted(clusters, key=len, reverse=True)):
    vx = [M @ obj.data.vertices[vi].co for vi in cl]
    cx = sum(v.x for v in vx)/len(vx)
    cy = sum(v.y for v in vx)/len(vx)
    cz = sum(v.z for v in vx)/len(vx)
    print(f"{i:>3}  {len(cl):>6}  {cx:>7.2f}  {cy:>7.2f}  {cz:>7.2f}   → tx={cx:>6.2f} ty={cz:>6.2f} tz={-cy:>6.2f}")
