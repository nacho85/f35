"""
Separa de Object_6_R y Object_6_L las caras cuyo centroide está cerca del fuselaje (|cx| < 5).
Esas caras forman el rectángulo visible que no debería sweepear.
"""
import bpy, bmesh, shutil

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_BAK = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb.bak16"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

for target_name in ["Object_6_R", "Object_6_L"]:
    orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == target_name), None)
    if not orig:
        print(f"[!] {target_name} no encontrado")
        continue

    M = orig.matrix_world
    bpy.ops.object.select_all(action="DESELECT")
    orig.select_set(True)
    bpy.context.view_layer.objects.active = orig

    # Seleccionar caras cuyo centroide tiene |cx| < 5
    bpy.ops.object.mode_set(mode="OBJECT")
    for poly in orig.data.polygons:
        center = M @ poly.center
        poly.select = abs(center.x) < 5.0

    n_selected = sum(1 for p in orig.data.polygons if p.select)
    print(f"{target_name}: {n_selected} caras seleccionadas cerca del fuselaje")

    if n_selected == 0:
        print(f"  Sin caras que separar")
        continue

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")

    separated = [o for o in bpy.context.selected_objects if o.type == "MESH" and o.name != target_name]
    for s in separated:
        s.name = f"{target_name}_fixed"
        if s.data: s.data.name = f"{target_name}_fixed"
        verts = [M @ v.co for v in s.data.vertices]
        cx = sum(v.x for v in verts) / max(len(verts), 1)
        print(f"  → {s.name}  verts={len(verts)}  cx={cx:.2f}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
