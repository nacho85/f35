"""
NosePivot: elimina todos los clusters excepto la barra central (|tx| < 0.05).
La barra central es el conector horizontal en tx≈0, ty≈-0.288, tz≈6.622.
"""
import bpy, bmesh

GLB_IN  = r"C:\devs\f35\public\F-14-iran-v4.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v4.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

pivot = next(o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_NosePivot")
M = pivot.matrix_world
print(f"NosePivot antes: {len(pivot.data.vertices)} verts")

bm = bmesh.new(); bm.from_mesh(pivot.data); bm.verts.ensure_lookup_table()
visited = set(); vert_keep = {}

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
    ws = [M @ pivot.data.vertices[vi].co for vi in comp]
    cx = sum(v.x for v in ws) / len(ws)
    keep = abs(cx) < 0.05
    label = "KEEP" if keep else "del"
    print(f"  {label}  {len(comp):>4}v  tx={cx:>7.3f}  tz={(-sum(v.y for v in ws)/len(ws)):>7.3f}")
    for vi in comp:
        vert_keep[vi] = keep
bm.free()

bpy.ops.object.select_all(action='DESELECT')
pivot.select_set(True); bpy.context.view_layer.objects.active = pivot
bpy.ops.object.mode_set(mode='EDIT')
bm2 = bmesh.from_edit_mesh(pivot.data); bm2.verts.ensure_lookup_table()
to_del = [v for v in bm2.verts if not vert_keep.get(v.index, False)]
bmesh.ops.delete(bm2, geom=to_del, context='VERTS')
bmesh.update_edit_mesh(pivot.data)
bpy.ops.object.mode_set(mode='OBJECT')
print(f"NosePivot después: {len(pivot.data.vertices)} verts")

for mesh in list(bpy.data.meshes):
    if mesh.users == 0: bpy.data.meshes.remove(mesh)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True,
)
print(f"[done] → {GLB_OUT}")
