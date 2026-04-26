"""
Blender headless: separa el gancho de arresto del F/A-18 del mesh F18-airframe,
crea un nuevo objeto F18-hook, y exporta el GLB resultante.

Usa bmesh puro (sin bpy.ops.mesh.separate) para evitar problemas de contexto
headless en Blender 5.x.

Uso:
  blender --background --python scripts/separate-f18-hook.py

Resultado: public/F-18-hook-sep.glb  (renombrar a F-18.glb si todo OK)
"""

import bpy, bmesh, sys, os
from collections import deque

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GLB_IN  = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-18.glb.bak2"))  # original pre-separación
GLB_OUT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-18-hook-sep.glb"))

# ── Centroides excluidos (GLTF model space — copiados de F18.jsx) ─────────────
EXCLUDED = [
    (-46.2,-3.6, 0.0), (-46.1,-3.1, 0.0),
    (-45.9,-2.9, 0.0),                    (-38.4,-6.2,-0.4),
    (-46.3,-2.0, 0.0), (-42.0,-3.7,-0.4), (-46.0,-2.9,-0.4), (-44.4,-4.0, 0.0),
    (-37.9,-6.2,-0.6), (-37.0,-6.7, 0.0), (-42.0,-3.7, 0.4), (-46.0,-2.9, 0.4),
    (-37.9,-6.2, 0.6), (-45.4,-3.4, 0.2), (-45.9,-2.7, 0.0), (-45.4,-3.7, 0.0),
    (-45.4,-3.4,-0.2), (-36.6,-7.1,-0.1), (-37.0,-7.1,-0.1), (-35.9,-8.0,-0.7),
    (-36.4,-7.9,-0.8), (-36.2,-8.0, 0.0), (-35.9,-8.0, 0.7), (-36.6,-7.1, 0.1),
    (-36.4,-7.9, 0.8), (-37.0,-7.1, 0.1),
    (-40.9,-5.9, 0.0),
    (-45.9,-2.0,-1.1), (-45.9,-2.0, 1.1),
    (-56.1,-0.2, 1.8), (-56.1,-0.2,-1.8),
    (-53.2,-0.5, 1.4), (-53.2,-0.5,-1.4), (-53.3,-0.7,-1.6),
    (-46.7,-1.8,-0.3), (-46.7,-1.8, 0.3),
    (-49.3,-0.1, 0.0),
    (-55.6,-0.5, 2.0), (-55.6,-0.5,-2.0),
    (-40.0,-6.3, 0.7), (-40.0,-6.3,-0.7),
    (-33.9,-6.0, 0.5), (-33.9,-6.0,-0.5),
    (-36.2,-7.9, 1.0), (-36.2,-7.9,-1.0),
    (-35.8,-8.1, 1.8), (-35.8,-8.1,-1.8),
    (-30.8,-6.2, 0.0),
    (-41.4,-4.2, 0.4), (-41.4,-4.2,-0.4),
    (-44.7,-3.0,-0.4), (-44.7,-3.0, 0.4),
    (-45.5,-3.2, 0.4), (-45.5,-3.2,-0.4),
    (-49.4,-1.3,-1.3), (-49.4,-1.3, 1.3),
    (-52.6,-0.7, 1.4), (-52.6,-0.7,-1.4),
    (-50.2,-0.5, 1.1), (-50.2,-0.5,-1.1),
    (-52.3,-0.5,-1.3), (-52.3,-0.5, 1.3),
    (-37.4,-5.3,-0.5), (-37.4,-5.3, 0.5),
    (-40.1,-4.3,-0.5), (-40.1,-4.3, 0.5),
    (-41.1,-5.2,-0.4), (-41.1,-5.2, 0.4),
    (-36.8,-7.8, 0.2), (-36.8,-7.8,-0.2),
    (-46.4,-2.0,-0.3), (-46.4,-2.0, 0.3),
    (-43.9,-3.0,-1.5), (-43.9,-3.0, 1.5),
    (-42.6,-4.0,-0.4), (-42.6,-4.0, 0.4),
    (-43.8,-3.5,-0.4), (-43.8,-3.5, 0.4),
    (-38.1,-6.8, 0.0),
    (-35.6,-8.1,-1.5), (-35.6,-8.1, 1.5),
    (-53.1,-0.8,-1.5), (-53.1,-0.8, 1.5),
    (-53.3,-0.7, 1.6),
    (-39.9,-3.6, 0.0),
    (-53.3,-1.3, 2.1), (-53.3,-1.3,-2.1),
    (-53.3,-2.0, 2.8), (-53.3,-2.0,-2.8),
    (-56.1,-1.5, 2.9), (-56.1,-1.5,-2.9),
]

def is_excluded(gx, gy, gz):
    return any((gx-ex)**2 + (gy-ey)**2 + (gz-ez)**2 < 0.04 for ex, ey, ez in EXCLUDED)

def to_gltf(co):
    """Blender local → GLTF model space: GLTF_x=B_x, GLTF_y=B_z, GLTF_z=-B_y"""
    return co.x, co.z, -co.y

def in_ring(gx, gy, gz):
    return (
        (-44 <= gx <= -41.5 and -7 <= gy <= -4.8 and abs(gz) <= 1.0) or
        (-41.5 < gx <= -40  and -7 <= gy <= -5.3 and abs(gz) <= 0.3) or
        (-48 <= gx <= -46   and -5 <= gy <= -2.8 and abs(gz) <= 0.5)
    )

# ── Importar GLB ──────────────────────────────────────────────────────────────
print(f"\nImportando: {GLB_IN}")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=GLB_IN)
bpy.context.view_layer.update()

# ── Encontrar F18-airframe ────────────────────────────────────────────────────
airframe = None
for o in bpy.data.objects:
    if o.type == 'MESH' and 'airframe' in o.name.lower():
        airframe = o
        break

if not airframe:
    print("ERROR: no se encontró F18-airframe")
    for o in bpy.data.objects:
        if o.type == 'MESH': print(f"  {o.name}")
    sys.exit(1)

print(f"Airframe: {airframe.name}  ({len(airframe.data.vertices)} verts, {len(airframe.data.polygons)} faces)")

# ── Construir bmesh desde object data (sin edit mode) ────────────────────────
bm = bmesh.new()
bm.from_mesh(airframe.data)
bm.verts.ensure_lookup_table()
bm.edges.ensure_lookup_table()
bm.faces.ensure_lookup_table()

# ── BFS isla completa sobre TODO el mesh (igual que Three.js) ────────────────
# Construir adyacencia sobre todos los vértices (sin filtro de zona)
all_verts = set(range(len(bm.verts)))
adj = {i: [] for i in all_verts}
for e in bm.edges:
    a = e.verts[0].index
    b = e.verts[1].index
    adj[a].append(b)
    adj[b].append(a)

visited = set()
components = []
for start in all_verts:
    if start in visited:
        continue
    comp = []
    q = deque([start])
    while q:
        vi = q.popleft()
        if vi in visited:
            continue
        visited.add(vi)
        comp.append(vi)
        for nb in adj[vi]:
            if nb not in visited:
                q.append(nb)
    components.append(comp)

print(f"Islas totales (full BFS): {len(components)}")

# ── Filtrar islas candidatas a hook por centroide de isla completa ────────────
def in_hook_zone(gx, gy, gz):
    return gx < -30 and gy < -1.0 and abs(gz) < 3.0

hook_verts = set()
for comp in components:
    coords = [to_gltf(bm.verts[i].co) for i in comp]
    n = len(coords)
    gx_avg = sum(c[0] for c in coords) / n
    gy_avg = sum(c[1] for c in coords) / n
    gz_avg = sum(c[2] for c in coords) / n
    if not in_hook_zone(gx_avg, gy_avg, gz_avg):
        continue  # no es zona del gancho (fuselaje principal, alas, etc.)
    if is_excluded(gx_avg, gy_avg, gz_avg):
        print(f"  EXCLUIDO : {n:5d} verts  ({gx_avg:.1f}, {gy_avg:.1f}, {gz_avg:.1f})")
    else:
        print(f"  HOOK BFS : {n:5d} verts  ({gx_avg:.1f}, {gy_avg:.1f}, {gz_avg:.1f})")
        hook_verts.update(comp)

print(f"\nVerts BFS del hook: {len(hook_verts)}")

# ── Identificar faces del hook (BFS + anillo) ─────────────────────────────────
hook_face_set = set()

for face in bm.faces:
    # BFS: cara donde TODOS los verts son hook
    if all(v.index in hook_verts for v in face.verts):
        hook_face_set.add(face.index)

print(f"Faces del hook (solo BFS, sin anillo): {len(hook_face_set)}")

# ── Crear mesh del hook por copia de faces ────────────────────────────────────
bm_hook = bmesh.new()

# Replicar capas UV
uv_src_layers = list(bm.loops.layers.uv.values())
for layer in uv_src_layers:
    bm_hook.loops.layers.uv.new(layer.name)

vert_map = {}  # bm vert index → bm_hook vert

for face in bm.faces:
    if face.index not in hook_face_set:
        continue
    new_verts = []
    for v in face.verts:
        if v.index not in vert_map:
            nv = bm_hook.verts.new(v.co.copy())
            nv.normal = v.normal.copy()
            vert_map[v.index] = nv
        new_verts.append(vert_map[v.index])
    try:
        nf = bm_hook.faces.new(new_verts)
        nf.material_index = face.material_index
        nf.smooth = face.smooth
        # UVs
        for nl, ol in zip(nf.loops, face.loops):
            for i, layer in enumerate(uv_src_layers):
                nl[bm_hook.loops.layers.uv[layer.name]].uv = ol[layer].uv.copy()
    except Exception:
        pass

bm_hook.normal_update()
hook_mesh = bpy.data.meshes.new("f18f-hook")
bm_hook.to_mesh(hook_mesh)
bm_hook.free()

# Copiar materiales del airframe
for mat in airframe.data.materials:
    hook_mesh.materials.append(mat)

hook_obj = bpy.data.objects.new("F18-hook", hook_mesh)
bpy.context.collection.objects.link(hook_obj)
hook_obj.matrix_world = airframe.matrix_world.copy()

print(f"F18-hook creado: {len(hook_mesh.vertices)} verts, {len(hook_mesh.polygons)} faces")

# ── Eliminar faces del hook del airframe ──────────────────────────────────────
faces_to_del = [bm.faces[i] for i in hook_face_set]
bmesh.ops.delete(bm, geom=faces_to_del, context='FACES')

# Limpiar verts huérfanos
orphan_verts = [v for v in bm.verts if not v.link_faces]
if orphan_verts:
    bmesh.ops.delete(bm, geom=orphan_verts, context='VERTS')

bm.to_mesh(airframe.data)
airframe.data.update()
bm.free()

print(f"Airframe restante: {len(airframe.data.vertices)} verts, {len(airframe.data.polygons)} faces")

# ── Exportar GLB ──────────────────────────────────────────────────────────────
print(f"\nExportando a: {GLB_OUT}")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format='GLB',
    use_selection=False,
    export_apply=False,
)
print("Listo.")
print(f"\nRevisá el resultado en Three.js.")
print(f"Si está OK → renombrá F-18-hook-sep.glb a F-18.glb (con backup del original).")
