"""
Mueve Object_6_R_fixed y Object_6_L_fixed +0.3 en Z (Blender) = +0.3 en Y (Three.js).
"""
import bpy, shutil

GLB_IN  = r"C:\devs\f35\public\F-14-iran.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

for name in ["Object_6_R_fixed", "Object_6_L_fixed"]:
    obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == name), None)
    if not obj:
        print(f"[!] {name} no encontrado")
        continue
    obj.location.z += 0.3
    print(f"  {name}: z += 0.3 → {obj.location.z:.3f}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
