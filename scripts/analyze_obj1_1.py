"""
Analiza Object_1_1: separa por loose parts e imprime centroide de cada pieza.
No modifica el GLB.
"""
import bpy

GLB_IN = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = bpy.data.objects.get("Object_1")
if not obj:
    print("Object_1_1 no encontrado"); raise SystemExit

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.duplicate()
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

pieces = [o for o in bpy.context.selected_objects if o.type == "MESH"]
results = []
for p in pieces:
    M = p.matrix_world
    verts = [M @ v.co for v in p.data.vertices]
    cx = sum(v.x for v in verts) / len(verts)
    cy = sum(v.y for v in verts) / len(verts)
    cz = sum(v.z for v in verts) / len(verts)
    results.append((cx, cy, cz, len(verts), len(p.data.polygons)))

results.sort(key=lambda r: r[1])  # ordenar por Y (nariz→cola)

print(f"\nObject_1_1 → {len(results)} loose parts\n")
print(f"{'#':<4} {'X':>8} {'Y':>8} {'Z':>8}  {'Verts':>6}  {'Faces':>6}")
print("-" * 55)
for i, (cx, cy, cz, nv, nf) in enumerate(results):
    print(f"{i:<4} {cx:>8.3f} {cy:>8.3f} {cz:>8.3f}  {nv:>6}  {nf:>6}")
print("[done — GLB no modificado]")
