"""
Separa Object_27 y Object_28 en sus loose parts.
Renombra las piezas como Object_27_00, Object_27_01, ... y Object_28_00, Object_28_01, ...
con centroide impreso para identificar el rectángulo aislado.
"""
import bpy, shutil

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_BAK = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb.bak16"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

for target_name in ["Object_27", "Object_28"]:
    orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == target_name), None)
    if not orig:
        print(f"[!] {target_name} no encontrado")
        continue

    bpy.ops.object.select_all(action="DESELECT")
    orig.select_set(True)
    bpy.context.view_layer.objects.active = orig
    bpy.ops.object.duplicate()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    pieces = [o for o in bpy.context.selected_objects if o.type == "MESH"]

    # Eliminar original
    bpy.ops.object.select_all(action="DESELECT")
    orig.select_set(True)
    bpy.ops.object.delete()

    # Calcular centroides
    results = []
    for p in pieces:
        M = p.matrix_world
        verts = [M @ v.co for v in p.data.vertices]
        cx = sum(v.x for v in verts) / len(verts)
        cy = sum(v.y for v in verts) / len(verts)
        cz = sum(v.z for v in verts) / len(verts)
        results.append((p, cx, cy, cz, len(verts)))

    results.sort(key=lambda r: r[1])  # ordenar por X

    print(f"\n--- {target_name} → {len(results)} piezas ---")
    print(f"{'#':<4} {'Nombre':<25} {'X':>8} {'Y':>8} {'Z':>8}  {'Verts':>6}")
    print("-" * 65)
    for i, (p, cx, cy, cz, nv) in enumerate(results):
        new_name = f"{target_name}_{i:02d}"
        p.name = new_name
        if p.data: p.data.name = new_name
        print(f"{i:<4} {new_name:<25} {cx:>8.3f} {cy:>8.3f} {cz:>8.3f}  {nv:>6}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
