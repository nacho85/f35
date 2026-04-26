"""
Reemplaza Object_14_C en F-14-iran.glb con Object_14 del original f-14a_tomcat_iran_pbr.glb.
"""
import bpy, shutil

GLB_ORIG = r"C:\devs\f35\public\f-14a_tomcat_iran_pbr.glb"
GLB_CURR = r"C:\devs\f35\public\F-14-iran.glb"
GLB_BAK  = r"C:\devs\f35\public\F-14-iran.glb.bak"
GLB_OUT  = r"C:\devs\f35\public\F-14-iran.glb"

shutil.copy2(GLB_CURR, GLB_BAK)
print(f"Backup → {GLB_BAK}")

# 1) Importar el original y extraer Object_14
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_ORIG)

orig14 = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_14"), None)
if not orig14:
    print("[!] Object_14 no encontrado en original"); exit()

print(f"Object_14 original: {len(orig14.data.vertices)} verts  {len(orig14.data.materials)} mats")

# Guardar referencia al mesh y materiales del original
orig_mesh = orig14.data
orig_mats = list(orig14.data.materials)

# 2) Importar el modelo actual
bpy.ops.import_scene.gltf(filepath=GLB_CURR)

curr14c = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_14_C"), None)
if not curr14c:
    print("[!] Object_14_C no encontrado en current"); exit()

print(f"Object_14_C current: {len(curr14c.data.vertices)} verts  {len(curr14c.data.materials)} mats")

# 3) Reemplazar el mesh de Object_14_C con el de Object_14
old_mesh = curr14c.data
curr14c.data = orig_mesh.copy()
curr14c.data.name = "Object_14_C"
bpy.data.meshes.remove(old_mesh)

# Asignar materiales del original
curr14c.data.materials.clear()
for mat in orig_mats:
    curr14c.data.materials.append(mat)

print(f"Reemplazo OK: {len(curr14c.data.vertices)} verts  {len(curr14c.data.materials)} mats")

# 4) Eliminar los objetos del original de la escena (para no exportarlos doble)
for o in list(bpy.data.objects):
    if o.name == "Object_14" or (o != curr14c and "Object_14" in o.name and ".001" in o.name):
        bpy.data.objects.remove(o, do_unlink=True)

# 5) Exportar
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"[done] → {GLB_OUT}")
