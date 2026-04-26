"""
Encuentra los vértices del borde superior real de compuerta_delantera_R.
R = cy < -2.5 (Blender Y negativo → Three.js Z positivo)
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

# R = cy < -2.5  (espejo de L que es cy > 2.5)
door_R = []
for o in all_parts:
    cx,cy,cz = centroid(o)
    if 30 < cx < 70 and abs(cy) < 8 and cz < 0:
        if 35 < cx < 58 and cy < -2.5 and -6.5 < cz < -1:
            door_R.append(o)

print(f"Partes compuerta_delantera_R: {len(door_R)}")

all_verts = []
for o in door_R:
    mw = o.matrix_world
    for v in o.data.vertices:
        wv = mw @ v.co
        all_verts.append((wv.x, wv.y, wv.z))

unique = []
for v in all_verts:
    if not any(abs(v[0]-u[0])<0.001 and abs(v[1]-u[1])<0.001 and abs(v[2]-u[2])<0.001 for u in unique):
        unique.append(v)

unique.sort(key=lambda v: v[0])

print(f"\nTotal vértices únicos: {len(unique)}")

# Borde superior = vértice con Z máximo en Blender (= Y máximo en Three.js) por banda de X
print("\n=== Vértices con Z máximo por banda de X (borde superior) ===")
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

# Extremos del borde
if top_edge:
    s = top_edge[0];  e = top_edge[-1]
    print(f"\nHINGE_R_START (Three.js): ({s[0]:.3f}, {s[2]:.3f}, {-s[1]:.3f})")
    print(f"HINGE_R_END   (Three.js): ({e[0]:.3f}, {e[2]:.3f}, {-e[1]:.3f})")

sys.stdout.flush()
