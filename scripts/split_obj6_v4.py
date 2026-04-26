"""
Corta Object_6_R y Object_6_L con bisect en x=±4 (plano vertical en el borde del glove).
La parte interior (rect, x<4) queda como Object_6_R_fixed (fija).
La parte exterior (puntas, x>4) sigue como Object_6_R (sweepea con el ala).
"""
import bpy, shutil

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_BAK = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb.bak16"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

CUT_X = 4.0  # plano de corte: separar interior (glove fijo) del exterior (punta sweepeable)

for target_name, sign in [("Object_6_R", 1), ("Object_6_L", -1)]:
    orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == target_name), None)
    if not orig:
        print(f"[!] {target_name} no encontrado")
        continue

    bpy.ops.object.select_all(action="DESELECT")
    orig.select_set(True)
    bpy.context.view_layer.objects.active = orig

    # Duplicar para crear la parte fija (inner)
    bpy.ops.object.duplicate()
    inner = bpy.context.active_object
    inner.name = f"{target_name}_fixed"
    if inner.data: inner.data.name = f"{target_name}_fixed"

    # En inner: eliminar todo lo que está AFUERA del corte (x > CUT_X para R, x < -CUT_X para L)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in inner.data.vertices:
        v.select = (sign * v.co.x) > CUT_X
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    n_inner = len(inner.data.vertices)
    print(f"  {inner.name}: {n_inner} verts (inner/fixed)")

    # En original: eliminar todo lo que está ADENTRO del corte (x < CUT_X)
    bpy.ops.object.select_all(action="DESELECT")
    orig.select_set(True)
    bpy.context.view_layer.objects.active = orig
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in orig.data.vertices:
        v.select = (sign * v.co.x) < CUT_X
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    n_outer = len(orig.data.vertices)
    print(f"  {target_name}: {n_outer} verts (outer/sweep)")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
