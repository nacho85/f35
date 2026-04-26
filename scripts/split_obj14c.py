"""
Elimina de Object_14_C los clusters de geometría espuria:
  - Canopy area:        cz > 1.2  (componentes 11 y 12, 76 verts c/u)
  - Right air intake:   cx > 1.4  (componentes 563 y 706, 4 y 3 verts)

El resto del mesh corresponde al tren delantero (nose gear) y se conserva.
"""
import bpy, bmesh, shutil

GLB_IN  = r"C:\devs\f35\public\F-14-iran.glb"
GLB_BAK = r"C:\devs\f35\public\F-14-iran.glb.bak"
GLB_OUT = r"C:\devs\f35\public\F-14-iran.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_14_C"), None)
if not obj:
    print("[!] Object_14_C no encontrado"); exit()

M = obj.matrix_world

# Usar BMesh para eliminar vértices espurios directamente (sin pasar por modo edición)
bm = bmesh.new()
bm.from_mesh(obj.data)
bm.verts.ensure_lookup_table()

to_delete = []
for v in bm.verts:
    wco = M @ v.co
    is_canopy = wco.z > 1.2
    is_intake = wco.x > 1.4
    if is_canopy or is_intake:
        to_delete.append(v)

print(f"Vértices espurios a eliminar: {len(to_delete)} / {len(bm.verts)}")
bmesh.ops.delete(bm, geom=to_delete, context='VERTS')
bm.to_mesh(obj.data)
bm.free()
obj.data.update()

print(f"Object_14_C verts restantes: {len(obj.data.vertices)}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
