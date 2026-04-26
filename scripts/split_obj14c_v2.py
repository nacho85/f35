"""
Separa de Object_14_C los clusters que NO son tren delantero:
  - Frame ventanas:      wco.z > 1.2
  - Toma de aire dcha:   wco.x < -0.5 AND wco.y < -3
  - Rect. derecho:       wco.x < -2.5
  - Rect. izquierdo:     wco.x > 2.5

Guarda en un archivo NUEVO sin tocar F-14-iran.glb hasta confirmar.
"""
import bpy, bmesh, shutil

GLB_IN  = r"C:\devs\f35\public\F-14-iran.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v2.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_14_C"), None)
if not obj:
    print("[!] Object_14_C no encontrado"); exit()

M = obj.matrix_world
bm = bmesh.new()
bm.from_mesh(obj.data)
bm.verts.ensure_lookup_table()

to_delete = []
for v in bm.verts:
    w = M @ v.co
    is_stray = (
        w.z > 1.2 or
        (w.x < -0.5 and w.y < -3) or
        w.x < -2.5 or
        w.x > 2.5
    )
    if is_stray:
        to_delete.append(v)

print(f"Verts a eliminar: {len(to_delete)} / {len(bm.verts)}")
bmesh.ops.delete(bm, geom=to_delete, context='VERTS')
bm.to_mesh(obj.data)
bm.free()
obj.data.update()
print(f"Verts restantes (nose gear): {len(obj.data.vertices)}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"[done] → {GLB_OUT}")
