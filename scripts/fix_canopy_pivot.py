"""
Mueve el origin de Object_5 (canopy) al punto de bisagra correcto.

El modelo tiene nariz apuntando hacia -Y:
  Y=-8.5583 = frente (nariz)
  Y=-2.2530 = trasero (bisagra)

Superficie del fuselaje en Y≈-2.25:
  Object_12 max Z = 0.8722  ← punto de apoyo del canopy

Nuevo pivot: (0, -2.2530, 0.87)
"""
import bpy, shutil
from mathutils import Vector

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_BAK = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb.bak10"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = bpy.data.objects.get("Object_5")
if not obj:
    print("Object_5 no encontrado"); raise SystemExit

hinge_world = Vector((0.0, -2.2530, 0.87))
bpy.context.scene.cursor.location = hinge_world

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")

print(f"→ Object_5 origin movido a {hinge_world}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"[done] → {GLB_OUT}")
