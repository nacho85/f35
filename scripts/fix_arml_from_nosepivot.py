"""
Extrae de Object_10_NosePivot el cluster más cercano a (tx=0.12, ty=-0.31, tz=6.61)
y lo fusiona con Object_10_ArmL.
Punto de referencia en coords Three.js → Blender: (x=0.12, y=-6.61, z=-0.31)
"""
import bpy, bmesh, mathutils

GLB_IN  = r"C:\devs\f35\public\F-14-iran-v4.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v4.glb"

# Punto de referencia en coords Blender (Three.js: tx=0.12, ty=-0.31, tz=6.61)
REF = mathutils.Vector((0.12, -6.61, -0.31))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

pivot = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_NosePivot"), None)
arml  = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_ArmL"), None)
if not pivot: print("[!] Object_10_NosePivot no encontrado"); raise SystemExit
if not arml:  print("[!] Object_10_ArmL no encontrado");    raise SystemExit

M = pivot.matrix_world
print(f"Object_10_NosePivot: {len(pivot.data.vertices)} verts")
print(f"Object_10_ArmL:      {len(arml.data.vertices)} verts")

# BFS clusters en NosePivot
bm = bmesh.new()
bm.from_mesh(pivot.data)
bm.verts.ensure_lookup_table()

visited = set()
clusters = []
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
    cx = sum(v.x for v in ws)/len(ws)
    cy = sum(v.y for v in ws)/len(ws)
    cz = sum(v.z for v in ws)/len(ws)
    clusters.append((comp, mathutils.Vector((cx, cy, cz))))
bm.free()

print(f"Clusters en NosePivot: {len(clusters)}")

# Encontrar cluster más cercano al punto de referencia
closest = min(clusters, key=lambda c: (c[1] - REF).length)
dist = (closest[1] - REF).length
# Three.js coords del centroide
c = closest[1]
print(f"Cluster más cercano: {len(closest[0])} verts | dist={dist:.4f} | Three.js tx={c.x:.3f} ty={c.z:.3f} tz={-c.y:.3f}")

# Separar ese cluster de NosePivot
verts_to_extract = set(closest[0])
verts_to_keep    = set(range(len(pivot.data.vertices))) - verts_to_extract
print(f"  NosePivot quedará con {len(verts_to_keep)} verts, extrayendo {len(verts_to_extract)} verts")

# Crear nuevo objeto con el cluster extraído
bpy.ops.object.select_all(action='DESELECT')
pivot.select_set(True); bpy.context.view_layer.objects.active = pivot
bpy.ops.object.duplicate()
extracted = bpy.context.active_object
extracted.name = "_extracted_arml_piece_"

bpy.ops.object.mode_set(mode='EDIT')
bm2 = bmesh.from_edit_mesh(extracted.data); bm2.verts.ensure_lookup_table()
to_del = [v for v in bm2.verts if v.index not in verts_to_extract]
bmesh.ops.delete(bm2, geom=to_del, context='VERTS')
bmesh.update_edit_mesh(extracted.data)
bpy.ops.object.mode_set(mode='OBJECT')
print(f"  Extraído: {len(extracted.data.vertices)} verts")

# Quitar el cluster de NosePivot original
bpy.ops.object.select_all(action='DESELECT')
pivot.select_set(True); bpy.context.view_layer.objects.active = pivot
bpy.ops.object.mode_set(mode='EDIT')
bm3 = bmesh.from_edit_mesh(pivot.data); bm3.verts.ensure_lookup_table()
to_del2 = [v for v in bm3.verts if v.index in verts_to_extract]
bmesh.ops.delete(bm3, geom=to_del2, context='VERTS')
bmesh.update_edit_mesh(pivot.data)
bpy.ops.object.mode_set(mode='OBJECT')
print(f"  NosePivot ahora: {len(pivot.data.vertices)} verts")

# Fusionar extracted con ArmL usando join
bpy.ops.object.select_all(action='DESELECT')
extracted.select_set(True)
arml.select_set(True)
bpy.context.view_layer.objects.active = arml
bpy.ops.object.join()
print(f"  Object_10_ArmL fusionado: {len(arml.data.vertices)} verts")

# Limpiar meshes huérfanos
for mesh in list(bpy.data.meshes):
    if mesh.users == 0: bpy.data.meshes.remove(mesh)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True,
)
print(f"[done] → {GLB_OUT}")
