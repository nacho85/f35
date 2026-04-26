"""
El material [0] de Object_3_fuselage tiene baseColorFactor=[0,0,0,0.5] (negro semitransparente).
Lo reseteamos a [1,1,1,1] para que Three.js lo renderice blanco/neutro como el original.
"""
import bpy, shutil

GLB_IN  = r"C:\devs\f35\public\F-14-iran.glb"
GLB_BAK = r"C:\devs\f35\public\F-14-iran.glb.bak"
GLB_OUT = r"C:\devs\f35\public\F-14-iran.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_3_fuselage"), None)
if not obj:
    print("[!] no encontrado"); exit()

mat = obj.data.materials[0]
print(f"Material: {mat.name}")

if mat.use_nodes:
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            node.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1.0)
            node.inputs['Alpha'].default_value = 1.0
            print("  BaseColor → (1,1,1,1)  Alpha → 1.0")

mat.blend_method = 'OPAQUE'

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
