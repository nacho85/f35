"""
Extrae de Object_10_NosePivot todos los clusters cuyo centroide tenga
  tx > 0.10  AND  tz > 6.60  (coords Three.js)
que equivale a Blender:  x > 0.10  AND  y < -6.60
y los fusiona con Object_10_ArmL.
"""
import bpy, bmesh, mathutils

GLB_IN  = r"C:\devs\f35\public\F-14-iran-v4.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v4.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

pivot = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_NosePivot"), None)
arml  = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_ArmL"), None)
if not pivot: print("[!] NosePivot no encontrado"); raise SystemExit
if not arml:  print("[!] ArmL no encontrado");      raise SystemExit

print(f"NosePivot: {len(pivot.data.vertices)} verts")
print(f"ArmL:      {len(arml.data.vertices)} verts")

M = pivot.matrix_world
bm = bmesh.new(); bm.from_mesh(pivot.data); bm.verts.ensure_lookup_table()
visited = set(); cluster_zone = {}  # vert_index -> "extract" or "keep"

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
    # centroide en Three.js: tx=x, tz=-y
    cx = sum(v.x for v in ws) / len(ws)
    cy = sum(v.y for v in ws) / len(ws)  # Blender y
    tz = -cy  # Three.js tz
    tx = cx
    zone = "extract" if (tx > 0.10 and tz > 6.60) else "keep"
    if zone == "extract":
        print(f"  extrayendo {len(comp)}v @ tx={tx:.3f} tz={tz:.3f}")
    for vi in comp:
        cluster_zone[vi] = zone
bm.free()

extract_indices = {vi for vi, z in cluster_zone.items() if z == "extract"}
print(f"Total a extraer: {len(extract_indices)} verts de NosePivot")

if not extract_indices:
    print("[!] Nada que extraer"); raise SystemExit

# Duplicar NosePivot → extraer verts del cluster
bpy.ops.object.select_all(action='DESELECT')
pivot.select_set(True); bpy.context.view_layer.objects.active = pivot
bpy.ops.object.duplicate()
extracted = bpy.context.active_object
extracted.name = "_extracted_arml_piece_"

bpy.ops.object.mode_set(mode='EDIT')
bm2 = bmesh.from_edit_mesh(extracted.data); bm2.verts.ensure_lookup_table()
to_del = [v for v in bm2.verts if v.index not in extract_indices]
bmesh.ops.delete(bm2, geom=to_del, context='VERTS')
bmesh.update_edit_mesh(extracted.data)
bpy.ops.object.mode_set(mode='OBJECT')
print(f"  extraído: {len(extracted.data.vertices)} verts")

# Quitar esos verts de NosePivot
bpy.ops.object.select_all(action='DESELECT')
pivot.select_set(True); bpy.context.view_layer.objects.active = pivot
bpy.ops.object.mode_set(mode='EDIT')
bm3 = bmesh.from_edit_mesh(pivot.data); bm3.verts.ensure_lookup_table()
to_del2 = [v for v in bm3.verts if v.index in extract_indices]
bmesh.ops.delete(bm3, geom=to_del2, context='VERTS')
bmesh.update_edit_mesh(pivot.data)
bpy.ops.object.mode_set(mode='OBJECT')
print(f"  NosePivot ahora: {len(pivot.data.vertices)} verts")

# Fusionar con ArmL
bpy.ops.object.select_all(action='DESELECT')
extracted.select_set(True)
arml.select_set(True)
bpy.context.view_layer.objects.active = arml
bpy.ops.object.join()
print(f"  ArmL fusionado: {len(arml.data.vertices)} verts")

for mesh in list(bpy.data.meshes):
    if mesh.users == 0: bpy.data.meshes.remove(mesh)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True,
)
print(f"[done] → {GLB_OUT}")
