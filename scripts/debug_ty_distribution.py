"""
Muestra la distribución de ty en la zona tz>6.55 de NosePivot (bak_armlb).
Para entender dónde cortar la capa NosePivot (ty≈-0.28) de los brazos (ty≈-0.27 y -0.29).
"""
import bpy, bmesh

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\F-14-iran-v4.glb")

pivot = next(o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_NosePivot")
M = pivot.matrix_world

# Recolectar verts en zona tz > 6.55
upper_pos = []  # tx > 0.05
upper_neg = []  # tx < -0.05
for v in pivot.data.vertices:
    w = M @ v.co
    tx, ty, tz = w.x, w.z, -w.y  # Three.js
    if tz > 6.55:
        if tx > 0.05:
            upper_pos.append(ty)
        elif tx < -0.05:
            upper_neg.append(ty)

upper_pos.sort()
upper_neg.sort()

def histogram(vals, label):
    from collections import Counter
    buckets = Counter(round(v, 2) for v in vals)
    print(f"\n{label} ({len(vals)} verts, tz>6.55):")
    for k in sorted(buckets):
        print(f"  ty={k:>6.2f}  n={buckets[k]:>4}  {'|'*buckets[k]}")

histogram(upper_pos, "tx > +0.05 (zona ArmL)")
histogram(upper_neg, "tx < -0.05 (zona ArmR / NosePivot izq)")

# También mostrar la distribución de ty en la pieza central (|tx| < 0.05)
central = []
for v in pivot.data.vertices:
    w = M @ v.co
    tx, ty, tz = w.x, w.z, -w.y
    if abs(tx) < 0.05:
        central.append(ty)
central.sort()
print(f"\nCentral |tx|<0.05 ({len(central)} verts):")
from collections import Counter
bc = Counter(round(v, 2) for v in central)
for k in sorted(bc):
    print(f"  ty={k:>6.2f}  n={bc[k]:>4}")
