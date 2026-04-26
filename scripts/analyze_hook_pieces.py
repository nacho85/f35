"""
Imprime posición de todos los Object_hook_xx del GLB actual.
Útil para identificar cuáles son pétalos de tobera vs. gancho real.
"""
import bpy

GLB_IN = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

results = []
for obj in bpy.data.objects:
    if not obj.name.startswith("Object_hook_") or obj.type != "MESH":
        continue
    M = obj.matrix_world
    verts = [M @ v.co for v in obj.data.vertices]
    cx = sum(v.x for v in verts) / len(verts)
    cy = sum(v.y for v in verts) / len(verts)
    cz = sum(v.z for v in verts) / len(verts)
    results.append((obj.name, cx, cy, cz, len(verts)))

results.sort(key=lambda r: abs(r[1]), reverse=True)  # ordenar por |X| desc

print(f"\n{len(results)} Object_hook_xx pieces\n")
print(f"{'Name':<20} {'X':>8} {'Y':>8} {'Z':>8}  {'Verts':>6}")
print("-" * 58)
for name, cx, cy, cz, nv in results:
    marker = " <-- NOZZLE?" if abs(cx) > 0.8 else ""
    print(f"{name:<20} {cx:>8.3f} {cy:>8.3f} {cz:>8.3f}  {nv:>6}{marker}")
print("[done]")
