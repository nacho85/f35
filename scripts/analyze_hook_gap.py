"""
Imprime centroide X e Y de los Object_hook_xx del GLB actual,
ordenados por Y, para ver si hay un gap entre gancho y tobera.
"""
import bpy

GLB_IN = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

results = []
for obj in bpy.data.objects:
    # ignorar duplicados .001
    if not obj.name.startswith("Object_hook_") or "." in obj.name or obj.type != "MESH":
        continue
    M = obj.matrix_world
    verts = [M @ v.co for v in obj.data.vertices]
    cx = sum(v.x for v in verts) / len(verts)
    cy = sum(v.y for v in verts) / len(verts)
    cz = sum(v.z for v in verts) / len(verts)
    results.append((obj.name, cx, cy, cz, len(verts)))

# Separar en dos grupos por |X|
hook_group   = [(n, cx, cy, cz, nv) for n, cx, cy, cz, nv in results if abs(cx) <= 0.15]
nozzle_group = [(n, cx, cy, cz, nv) for n, cx, cy, cz, nv in results if abs(cx) >  0.15]

print(f"\nHOOK group  ({len(hook_group)} piezas): X range [{min(abs(r[1]) for r in hook_group):.3f}, {max(abs(r[1]) for r in hook_group):.3f}]  Y range [{min(r[2] for r in hook_group):.3f}, {max(r[2] for r in hook_group):.3f}]")
print(f"NOZZLE group({len(nozzle_group)} piezas): X range [{min(abs(r[1]) for r in nozzle_group):.3f}, {max(abs(r[1]) for r in nozzle_group):.3f}]  Y range [{min(r[2] for r in nozzle_group):.3f}, {max(r[2] for r in nozzle_group):.3f}]")

# Hay overlap de Y?
hook_ymin, hook_ymax   = min(r[2] for r in hook_group),   max(r[2] for r in hook_group)
noz_ymin,  noz_ymax    = min(r[2] for r in nozzle_group), max(r[2] for r in nozzle_group)
overlap = not (hook_ymax < noz_ymin or noz_ymax < hook_ymin)
print(f"\nY overlap entre grupos: {'SI' if overlap else 'NO'}")
if overlap:
    print(f"  hook Y: [{hook_ymin:.3f}, {hook_ymax:.3f}]  nozzle Y: [{noz_ymin:.3f}, {noz_ymax:.3f}]")

print("\nNozzle pieces (|X|>0.15):")
nozzle_group.sort(key=lambda r: r[2])
for n, cx, cy, cz, nv in nozzle_group:
    print(f"  {n:<22}  X={cx:>7.3f}  Y={cy:>7.3f}  Z={cz:>7.3f}  verts={nv}")
print("[done]")
