"""
Renombra Object_20_nozzle_C → Object_20_cockpit_frame en el GLB.
El nombre original era incorrecto — ese bucket no es la tobera sino
el marco frontal del cockpit (14 loose parts, centroide ~Y≈-4.4, Z>1.0, |X|<0.5).
"""
import bpy, shutil, os

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_BAK = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb.bak7"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = bpy.data.objects.get("Object_20_nozzle_C")
if not obj:
    print("Object_20_nozzle_C no encontrado"); raise SystemExit

obj.name = "Object_20_cockpit_frame"
if obj.data:
    obj.data.name = "Object_20_cockpit_frame"
print("→ renombrado a Object_20_cockpit_frame")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"[done] → {GLB_OUT}")
