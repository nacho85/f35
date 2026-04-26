"""
Encuentra los vértices del borde superior real de compuerta_delantera_L.
La compuerta es un plano inclinado — buscamos la arista con Z más alto por X.
"""
import bpy, mathutils, sys

GLB_IN = r"C:\devs\f35\public\mig-29-iran.glb"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj16 = bpy.data.objects.get("Object_16")
for o in bpy.data.objects: o.hide_set(o != obj16)
bpy.context.view_layer.objects.active = obj16
bpy.ops.object.select_all(action="DESELECT")
obj16.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.hide_set(False)

all_parts = [o for o in bpy.data.objects
             if o.type == "MESH" and (o.name == "Object_16" or o.name.startswith("Object_16."))]

def bbox(o):
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
    return min(xs),max(xs), min(ys),max(ys), min(zs),max(zs)

def centroid(o):
    x0,x1,y0,y1,z0,z1 = bbox(o)
    return (x0+x1)/2, (y0+y1)/2, (z0+z1)/2

door_L = []
for o in all_parts:
    cx,cy,cz = centroid(o)
    if 30 < cx < 70 and abs(cy) < 8 and cz < 0:
        if 35 < cx < 58 and cy > 2.5 and -6.5 < cz < -1:
            door_L.append(o)

print(f"Partes compuerta_delantera_L: {len(door_L)}")

# Todos los vértices en world space
all_verts = []
for o in door_L:
    mw = o.matrix_world
    for v in o.data.vertices:
        wv = mw @ v.co
        all_verts.append((wv.x, wv.y, wv.z))

# Deduplicate (aprox)
unique = []
for v in all_verts:
    if not any(abs(v[0]-u[0])<0.001 and abs(v[1]-u[1])<0.001 and abs(v[2]-u[2])<0.001 for u in unique):
        unique.append(v)

unique.sort(key=lambda v: v[0])  # sort por X

print(f"\nTotal vértices únicos: {len(unique)}")
print(f"\n{'X (Blender)':>12}  {'Y (Blender)':>12}  {'Z (Blender)':>12}  | {'X (3js)':>10}  {'Y (3js)':>10}  {'Z (3js)':>10}")
for x,y,z in unique:
    tx,ty,tz = x, z, -y
    print(f"{x:12.4f}  {y:12.4f}  {z:12.4f}  | {tx:10.4f}  {ty:10.4f}  {tz:10.4f}")

# Por cada X aproximado, encontrar el vértice con Z más alto (= tope del plano inclinado)
print("\n=== Vértices con Z máximo por banda de X (el borde superior) ===")
x_min = min(v[0] for v in unique)
x_max = max(v[0] for v in unique)
bands = 12
band_w = (x_max - x_min) / bands
top_edge = []
for i in range(bands):
    x0 = x_min + i * band_w
    x1 = x0 + band_w
    band = [v for v in unique if x0 <= v[0] < x1]
    if band:
        top = max(band, key=lambda v: v[2])
        top_edge.append(top)
        tx,ty,tz = top[0], top[2], -top[1]
        print(f"  X={top[0]:.3f}  Y={top[1]:.3f}  Z={top[2]:.3f}  →  Three.js ({tx:.3f}, {ty:.3f}, {tz:.3f})")

sys.stdout.flush()
