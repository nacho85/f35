"""
Importa el original f-14a_tomcat_iran.glb y lo exporta como f-14a_tomcat_iran_pbr.glb
convirtiendo KHR_materials_pbrSpecularGlossiness a metallic-roughness estándar.
No toca F-14-iran.glb.
"""
import bpy

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran.glb"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_pbr.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"[done] → {GLB_OUT}")
