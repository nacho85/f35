"""Split temporal de Object_14_C en 3 grupos para debug visual."""
import bpy, bmesh

GLB_IN  = r"C:\devs\f35\public\F-14-iran-v4.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v4.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

src = bpy.data.objects.get("Object_14_C")
if not src:
    print("[!] Object_14_C no encontrado"); raise SystemExit

M = src.matrix_world
print(f"Object_14_C: {len(src.data.vertices)} verts")

bm = bmesh.new()
bm.from_mesh(src.data)
bm.verts.ensure_lookup_table()

visited = set()
zfv = {}

for start in bm.verts:
    if start.index in visited:
        continue
    comp = []
    stack = [start]
    while stack:
        v = stack.pop()
        if v.index in visited:
            continue
        visited.add(v.index)
        comp.append(v.index)
        for e in v.link_edges:
            nb = e.other_vert(v)
            if nb.index not in visited:
                stack.append(nb)
    ws  = [M @ src.data.vertices[vi].co for vi in comp]
    cx  = sum(v.x for v in ws) / len(ws)
    cy  = sum(v.y for v in ws) / len(ws)
    cz  = sum(v.z for v in ws) / len(ws)
    ty  = cz
    tz  = -cy
    if ty > -0.05:
        zone = "A"
    elif tz < 6.5:
        zone = "C"
    else:
        zone = "B"
    for vi in comp:
        zfv[vi] = zone

bm.free()

for z in ["A", "B", "C"]:
    n = sum(1 for v in zfv.values() if v == z)
    if n == 0:
        continue
    bpy.ops.object.select_all(action='DESELECT')
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.duplicate()
    dup = bpy.context.active_object
    dup.name = f"_dbg14_{z}"
    dup.data.name = f"_dbg14_{z}_mesh"
    bpy.ops.object.mode_set(mode='EDIT')
    bm2 = bmesh.from_edit_mesh(dup.data)
    bm2.verts.ensure_lookup_table()
    to_del = [v for v in bm2.verts if zfv.get(v.index) != z]
    bmesh.ops.delete(bm2, geom=to_del, context='VERTS')
    bmesh.update_edit_mesh(dup.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    print(f"  -> _dbg14_{z}: {len(dup.data.vertices)} verts")

bpy.data.objects.remove(src, do_unlink=True)
for mesh in list(bpy.data.meshes):
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True,
)
print(f"[done] -> {GLB_OUT}")
