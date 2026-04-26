"""
Analiza Object_11: separa por loose parts e imprime el centroide de cada pieza.
Así identificamos cuáles son el marco del canopy vs. el resto del fuselaje.
No modifica el GLB.
"""
import bpy
from mathutils import Vector

GLB_IN = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = bpy.data.objects.get("Object_11")
if not obj:
    print("Object_11 no encontrado")
    raise SystemExit

# Duplicar para no modificar el original
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.duplicate()
dup = bpy.context.active_object

# Separar por loose parts
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

# Recopilar piezas separadas
pieces = [o for o in bpy.context.selected_objects if o.type == "MESH"]
print(f"\nObject_11 → {len(pieces)} loose parts\n")
print(f"{'#':<4} {'Centroide X':>12} {'Centroide Y':>12} {'Centroide Z':>12}  {'Verts':>6}  {'Faces':>6}")
print("-" * 70)

results = []
for p in pieces:
    M = p.matrix_world
    verts = [M @ v.co for v in p.data.vertices]
    cx = sum(v.x for v in verts) / len(verts)
    cy = sum(v.y for v in verts) / len(verts)
    cz = sum(v.z for v in verts) / len(verts)
    results.append((cx, cy, cz, len(p.data.vertices), len(p.data.polygons)))

results.sort(key=lambda r: r[0])  # ordenar por X

for i, (cx, cy, cz, nv, nf) in enumerate(results):
    print(f"{i:<4} {cx:>12.4f} {cy:>12.4f} {cz:>12.4f}  {nv:>6}  {nf:>6}")

print(f"\nTotal piezas: {len(results)}")
print("[done — GLB no modificado]")
