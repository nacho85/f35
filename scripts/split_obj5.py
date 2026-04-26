"""
Separa todos los objetos cuyo nombre empieza con "Object_5" en sus loose parts.
Renombra cada pieza resultante como Object_5_00, Object_5_01, ... con centroide impreso.
"""
import bpy, shutil

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_BAK = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb.bak15"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

# Solo el vidrio original, no los Object_5_12 etc ya separados
originals = [o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_5"]
print(f"\nObject_5* encontrados: {[o.name for o in originals]}\n")

all_pieces = []

for orig in originals:
    bpy.ops.object.select_all(action="DESELECT")
    orig.select_set(True)
    bpy.context.view_layer.objects.active = orig
    bpy.ops.object.duplicate()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    pieces = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    all_pieces.extend(pieces)
    # Eliminar original
    bpy.ops.object.select_all(action="DESELECT")
    orig.select_set(True)
    bpy.ops.object.delete()

# Calcular centroides e imprimir
results = []
for p in all_pieces:
    M = p.matrix_world
    verts = [M @ v.co for v in p.data.vertices]
    cx = sum(v.x for v in verts) / len(verts)
    cy = sum(v.y for v in verts) / len(verts)
    cz = sum(v.z for v in verts) / len(verts)
    results.append((p, cx, cy, cz, len(verts)))

results.sort(key=lambda r: r[2])  # ordenar por Y (nariz→cola)

print(f"{'#':<4} {'Nombre temporal':<30} {'X':>8} {'Y':>8} {'Z':>8}  {'Verts':>6}")
print("-" * 70)
for i, (p, cx, cy, cz, nv) in enumerate(results):
    new_name = f"Object_5_glass_{i:02d}"
    p.name = new_name
    if p.data: p.data.name = new_name
    print(f"{i:<4} {new_name:<30} {cx:>8.3f} {cy:>8.3f} {cz:>8.3f}  {nv:>6}")

print(f"\nTotal piezas: {len(results)}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"[done] → {GLB_OUT}")
