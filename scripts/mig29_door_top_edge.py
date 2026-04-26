"""
Encuentra los vértices del borde superior (max Z en Blender = max Y en Three.js)
de las partes compuerta_delantera_L en coordenadas mundo.
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

# Filtrar compuerta_delantera_L: cy>2.5, 35<cx<58, -6.5<cz<-1
door_L = []
for o in all_parts:
    cx,cy,cz = centroid(o)
    if 30 < cx < 70 and abs(cy) < 8 and cz < 0:  # zona nariz
        if 35 < cx < 58 and cy > 2.5 and -6.5 < cz < -1:
            door_L.append(o)

print(f"\nPartes compuerta_delantera_L: {len(door_L)}")

# Juntar todos los vértices en coordenadas mundo
all_verts = []
for o in door_L:
    mw = o.matrix_world
    for v in o.data.vertices:
        wv = mw @ v.co
        all_verts.append((wv.x, wv.y, wv.z, o.name))

if not all_verts:
    print("No se encontraron vértices")
    sys.exit()

# Borde superior = vértices con Z máximo (top en Blender = Y max en Three.js)
max_z = max(v[2] for v in all_verts)
THRESH = 0.05

top_verts = [v for v in all_verts if v[2] >= max_z - THRESH]

print(f"\nZ máximo (Blender): {max_z:.4f}  →  Y en Three.js: {max_z:.4f}")
print(f"Vértices en borde superior (z >= {max_z - THRESH:.3f}):")
print(f"\n{'X (Blender)':>12}  {'Y (Blender)':>12}  {'Z (Blender)':>12}  | {'X (Three)':>10}  {'Y (Three)':>10}  {'Z (Three)':>10}  objeto")

# Ordenar por X para ver el largo
top_verts.sort(key=lambda v: v[0])
for x,y,z,name in top_verts:
    # Blender→Three.js: X=X, Y=-Z, Z=Y
    tx, ty, tz = x, z, -y
    print(f"{x:12.4f}  {y:12.4f}  {z:12.4f}  | {tx:10.4f}  {ty:10.4f}  {tz:10.4f}  {name}")

# Rango del borde superior
xs = [v[0] for v in top_verts]
ys = [v[1] for v in top_verts]
print(f"\nRango X (Blender): {min(xs):.4f} → {max(xs):.4f}  largo={max(xs)-min(xs):.4f}")
print(f"Rango Y (Blender): {min(ys):.4f} → {max(ys):.4f}")
print(f"\nEn Three.js:")
print(f"  X: {min(xs):.4f} → {max(xs):.4f}")
print(f"  Y: {max_z:.4f}  (constante)")
print(f"  Z: {-max(ys):.4f} → {-min(ys):.4f}")

sys.stdout.flush()
