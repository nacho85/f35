"""
Separa Object_14_C por Loose Parts (geometría desconectada).
Cada isla desconectada queda como su propio objeto.
Imprime nombre, vert count y centro de masa de cada parte resultante
para identificar cuál es el tren delantero y cuál es el resto.

Guarda en F-14-iran-v3.glb sin tocar el original.
"""
import bpy
from mathutils import Vector

GLB_IN  = r"C:\devs\f35\public\F-14-iran.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v3.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_14_C"), None)
if not obj:
    print("[!] Object_14_C no encontrado"); raise SystemExit

print(f"Object_14_C antes: {len(obj.data.vertices)} verts")

bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')

parts = [o for o in bpy.context.selected_objects if o.type == "MESH"]
print(f"\nPartes separadas: {len(parts)}")
print(f"{'Nombre':<35} {'Verts':>6}  {'cx':>7} {'cy':>7} {'cz':>7}")
print("-" * 65)
for p in sorted(parts, key=lambda o: len(o.data.vertices), reverse=True):
    M = p.matrix_world
    verts = [M @ v.co for v in p.data.vertices]
    cx = sum(v.x for v in verts) / len(verts)
    cy = sum(v.y for v in verts) / len(verts)
    cz = sum(v.z for v in verts) / len(verts)
    print(f"{p.name:<35} {len(p.data.vertices):>6}  {cx:>7.2f} {cy:>7.2f} {cz:>7.2f}")

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
