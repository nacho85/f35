"""
Separa Object_9_Strut en 2:
  Object_9_Strut   → cuerpo principal (tx <= 0.25)
  Object_9_StrutL  → pieza suelta izquierda (tx > 0.25, tz ≈ 7.6)
"""
import bpy, bmesh

GLB_IN  = r"C:\devs\f35\public\F-14-iran-v4.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v4.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_9_Strut"), None)
if not orig:
    print("[!] Object_9_Strut no encontrado"); raise SystemExit

orig.name = "_strut_src_"; orig.data.name = "_strut_src_mesh_"
M = orig.matrix_world
print(f"Object_9_Strut: {len(orig.data.vertices)} verts")

bm = bmesh.new(); bm.from_mesh(orig.data); bm.verts.ensure_lookup_table()
visited = set(); zone_for_vert = {}

for start in bm.verts:
    if start.index in visited: continue
    comp = []; stack = [start]
    while stack:
        v = stack.pop()
        if v.index in visited: continue
        visited.add(v.index); comp.append(v.index)
        for e in v.link_edges:
            nb = e.other_vert(v)
            if nb.index not in visited: stack.append(nb)
    ws  = [M @ orig.data.vertices[vi].co for vi in comp]
    tx  = sum(v.x for v in ws) / len(ws)
    zone = "StrutL" if tx > 0.25 else "Strut"
    for vi in comp: zone_for_vert[vi] = zone

bm.free()

for z, label in [("Strut", "Strut"), ("StrutL", "StrutL")]:
    n = sum(1 for v in zone_for_vert.values() if v == z)
    print(f"  {label}: {n} verts")
    if n == 0: continue
    bpy.ops.object.select_all(action='DESELECT')
    orig.select_set(True); bpy.context.view_layer.objects.active = orig
    bpy.ops.object.duplicate()
    new_obj = bpy.context.active_object
    new_obj.name = f"Object_9_{label}"; new_obj.data.name = f"Object_9_{label}_mesh"
    bpy.ops.object.mode_set(mode='EDIT')
    bm2 = bmesh.from_edit_mesh(new_obj.data); bm2.verts.ensure_lookup_table()
    to_del = [v for v in bm2.verts if zone_for_vert.get(v.index) != z]
    bmesh.ops.delete(bm2, geom=to_del, context='VERTS')
    bmesh.update_edit_mesh(new_obj.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    print(f"  → {new_obj.name}: {len(new_obj.data.vertices)} verts")

bpy.data.objects.remove(orig, do_unlink=True)
for mesh in list(bpy.data.meshes):
    if mesh.users == 0: bpy.data.meshes.remove(mesh)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True,
)
print(f"[done] → {GLB_OUT}")
