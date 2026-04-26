"""
Analyze F-14 GLB to find all objects and their X extents,
to identify which ones are wing panels staying fixed.
Run with: blender --background --python scripts/analyze_f14_wings.py
"""
import bpy
import json
import mathutils

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.wm.read_factory_settings(use_empty=True)

bpy.ops.import_scene.gltf(filepath=GLB_PATH)

results = []
for obj in bpy.context.scene.objects:
    if obj.type != "MESH":
        continue

    # World-space bounding box
    corners = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]

    min_x, max_x = min(xs), max(xs)
    center_x = (min_x + max_x) / 2
    span_x = max_x - min_x

    # Vertex count on each side
    mesh = obj.data
    neg_verts = sum(1 for v in mesh.vertices if (obj.matrix_world @ v.co).x < -0.5)
    pos_verts = sum(1 for v in mesh.vertices if (obj.matrix_world @ v.co).x >  0.5)

    results.append({
        "name": obj.name,
        "min_x": round(min_x, 3),
        "max_x": round(max_x, 3),
        "center_x": round(center_x, 3),
        "span_x": round(span_x, 3),
        "z_range": (round(min(zs),3), round(max(zs),3)),
        "neg_verts": neg_verts,
        "pos_verts": pos_verts,
        "total_verts": len(mesh.vertices),
    })

# Sort by span_x descending (biggest spanners first)
results.sort(key=lambda r: -r["span_x"])

print("\n=== F-14 mesh objects by X span ===")
print(f"{'Name':<20} {'minX':>7} {'maxX':>7} {'ctrX':>7} {'spanX':>7} {'negV':>7} {'posV':>7} {'total':>7}")
print("-" * 80)
for r in results:
    print(f"{r['name']:<20} {r['min_x']:>7.2f} {r['max_x']:>7.2f} {r['center_x']:>7.2f} {r['span_x']:>7.2f} {r['neg_verts']:>7} {r['pos_verts']:>7} {r['total_verts']:>7}")

print("\n=== Objects spanning both sides (center_x near 0, span > 4) ===")
for r in results:
    if r["span_x"] > 4 and abs(r["center_x"]) < 2:
        print(f"  {r['name']}: X[{r['min_x']:.2f}, {r['max_x']:.2f}]  neg={r['neg_verts']} pos={r['pos_verts']} total={r['total_verts']}")

print("\n=== Right-wing candidates (center_x > 3) ===")
for r in results:
    if r["center_x"] > 3:
        print(f"  {r['name']}: X[{r['min_x']:.2f}, {r['max_x']:.2f}]  neg={r['neg_verts']} pos={r['pos_verts']} total={r['total_verts']}")

print("\n=== Left-wing candidates (center_x < -3) ===")
for r in results:
    if r["center_x"] < -3:
        print(f"  {r['name']}: X[{r['min_x']:.2f}, {r['max_x']:.2f}]  neg={r['neg_verts']} pos={r['pos_verts']} total={r['total_verts']}")
