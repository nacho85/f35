"""
Agrupa los loose parts de Object_16 (gear desplegado) por posición Y
para identificar los 3 grupos principales: tren nariz, tren izq, tren der.
Imprime resumen de clusters.
"""
import bpy, mathutils, sys

GLB_IN = r"C:\devs\f35\public\mig-29-iran.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj16 = bpy.data.objects.get("Object_16")
if not obj16:
    print("ERROR: Object_16 not found"); raise SystemExit

# Separar por loose parts
for o in bpy.data.objects: o.hide_set(o != obj16)
bpy.context.view_layer.objects.active = obj16
bpy.ops.object.select_all(action="DESELECT")
obj16.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.hide_set(False)

parts = [o for o in bpy.data.objects
         if o.type == "MESH" and (o.name == "Object_16" or o.name.startswith("Object_16."))]

print(f"\nTotal loose parts Object_16: {len(parts)}")

# Calcular centro de cada parte
centers = []
for o in parts:
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    cx = sum(v.x for v in bb)/8
    cy = sum(v.y for v in bb)/8
    cz = sum(v.z for v in bb)/8
    # Volumen aproximado
    xs = [v.x for v in bb]; ys = [v.y for v in bb]; zs = [v.z for v in bb]
    vol = (max(xs)-min(xs)) * (max(ys)-min(ys)) * (max(zs)-min(zs))
    centers.append((cx, cy, cz, vol, o.name))

# Ordenar por volumen desc para ver las piezas grandes primero
centers.sort(key=lambda x: -x[3])

print("\n=== TOP 30 piezas por tamaño ===")
print(f"{'nombre':<28} {'cx':>7} {'cy':>7} {'cz':>7} {'vol':>10}")
for cx,cy,cz,vol,name in centers[:30]:
    print(f"  {name:<26}  {cx:7.2f} {cy:7.2f} {cz:7.2f} {vol:10.4f}")

# Clustering simple por Y
nose  = [(cx,cy,cz,vol,n) for cx,cy,cz,vol,n in centers if abs(cy) < 5]
left  = [(cx,cy,cz,vol,n) for cx,cy,cz,vol,n in centers if cy <= -5]
right = [(cx,cy,cz,vol,n) for cx,cy,cz,vol,n in centers if cy >=  5]

def bbox_cluster(parts_list):
    if not parts_list: return None
    xs = [c[0] for c in parts_list]; ys = [c[1] for c in parts_list]; zs = [c[2] for c in parts_list]
    return (min(xs),max(xs), min(ys),max(ys), min(zs),max(zs))

print(f"\n=== CLUSTERS ===")
print(f"  Nariz   (|Y|<5):  {len(nose):4d} partes  bbox={bbox_cluster(nose)}")
print(f"  Izq     (Y<=-5):  {len(left):4d} partes  bbox={bbox_cluster(left)}")
print(f"  Der     (Y>= 5):  {len(right):4d} partes  bbox={bbox_cluster(right)}")

# Distribución Y con buckets de 5 unidades
print("\n=== Distribución Y (buckets de 5) ===")
from collections import Counter
buckets = Counter(int(cy//5)*5 for _,cy,_,_,_ in centers)
for k in sorted(buckets):
    bar = "#" * min(buckets[k], 60)
    print(f"  Y[{k:+4d}..{k+5:+4d}): {buckets[k]:4d}  {bar}")

sys.stdout.flush()
print("\n[DONE]")
