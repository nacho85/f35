"""
Blender headless: separa F18-landingOn en 3 nodos animables:
  F18-noseGear    — tren de nariz (centerline, z_gltf pequeño)
  F18-mainGearL   — tren principal izquierdo (z_gltf < -2.5)
  F18-mainGearR   — tren principal derecho  (z_gltf > +2.5)

Los 3 nodos quedan en la posición desplegada (gear down).
F18-landingOff se mantiene como referencia de posición plegada.

Uso:
  blender --background --python scripts/separate-f18-gear.py
"""

import bpy, bmesh, sys, os
from collections import deque

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GLB_IN  = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-18.glb.bak-pregear"))
GLB_OUT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-18-gear-sep.glb"))

# Umbral z (GLTF) para separar tren principal L/R
Z_THRESH = 1.0
# Umbral x (GLTF) para separar nariz (fuselaje delantero) de trenes principales
# nose gear world X ≈ 6-8 → GLTF X ≈ 60-80
# main gear world X ≈ 3.5  → GLTF X ≈ 35
NOSE_X_THRESH = 48.0

def to_gltf(co):
    """Blender local → GLTF model space"""
    return co.x, co.z, -co.y

def classify(gx, gy, gz):
    # Todo lo del fuselaje delantero (GLTF X > 50) es tren de nariz
    if gx > NOSE_X_THRESH:
        return "noseGear"
    if gz < -Z_THRESH:
        return "mainGearL"
    if gz >  Z_THRESH:
        return "mainGearR"
    return "noseGear"

# ── Importar GLB ───────────────────────────────────────────────────────────────
print(f"\nImportando: {GLB_IN}")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=GLB_IN)
bpy.context.view_layer.update()

# ── Encontrar F18-landingOn ────────────────────────────────────────────────────
landing_on = None
for o in bpy.data.objects:
    if o.type == 'MESH' and 'landingOn' in o.name and 'Light' not in o.name:
        landing_on = o
        break

if not landing_on:
    print("ERROR: no se encontró F18-landingOn")
    for o in bpy.data.objects:
        if o.type == 'MESH': print(f"  {o.name}")
    sys.exit(1)

print(f"Objeto: {landing_on.name}  ({len(landing_on.data.vertices)} verts, {len(landing_on.data.polygons)} faces)")

# ── BFS isla completa ──────────────────────────────────────────────────────────
bm = bmesh.new()
bm.from_mesh(landing_on.data)
bm.verts.ensure_lookup_table()
bm.edges.ensure_lookup_table()
bm.faces.ensure_lookup_table()

adj = {i: [] for i in range(len(bm.verts))}
for e in bm.edges:
    a, b = e.verts[0].index, e.verts[1].index
    adj[a].append(b)
    adj[b].append(a)

visited = set()
islands = []
for start in range(len(bm.verts)):
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
    islands.append(comp)

print(f"Islas BFS: {len(islands)}")

# ── Clasificar verts por isla ──────────────────────────────────────────────────
vert_to_group = {}
stats = {"noseGear": 0, "mainGearL": 0, "mainGearR": 0}

for island in islands:
    coords = [to_gltf(bm.verts[i].co) for i in island]
    n = len(coords)
    gx = sum(c[0] for c in coords) / n
    gy = sum(c[1] for c in coords) / n
    gz = sum(c[2] for c in coords) / n
    g = classify(gx, gy, gz)
    stats[g] += 1
    for vi in island:
        vert_to_group[vi] = g

print("Islas por grupo:")
for g, cnt in stats.items():
    print(f"  {g}: {cnt} islas")

# ── Clasificar faces (voto mayoritario de sus verts) ──────────────────────────
group_faces = {"noseGear": set(), "mainGearL": set(), "mainGearR": set()}
for face in bm.faces:
    votes = {}
    for v in face.verts:
        g = vert_to_group.get(v.index, "noseGear")
        votes[g] = votes.get(g, 0) + 1
    group_faces[max(votes, key=votes.get)].add(face.index)

for g, fs in group_faces.items():
    print(f"  {g}: {len(fs)} faces")

# ── Crear objetos separados ────────────────────────────────────────────────────
def build_object(bm_src, face_indices, obj_name, src_obj):
    bm_new = bmesh.new()
    uv_layers = list(bm_src.loops.layers.uv.values())
    for layer in uv_layers:
        bm_new.loops.layers.uv.new(layer.name)

    vert_map = {}
    for fi in face_indices:
        face = bm_src.faces[fi]
        new_verts = []
        for v in face.verts:
            if v.index not in vert_map:
                nv = bm_new.verts.new(v.co.copy())
                nv.normal = v.normal.copy()
                vert_map[v.index] = nv
            new_verts.append(vert_map[v.index])
        try:
            nf = bm_new.faces.new(new_verts)
            nf.material_index = face.material_index
            nf.smooth = face.smooth
            for nl, ol in zip(nf.loops, face.loops):
                for layer in uv_layers:
                    nl[bm_new.loops.layers.uv[layer.name]].uv = ol[layer].uv.copy()
        except Exception:
            pass

    bm_new.normal_update()
    mesh = bpy.data.meshes.new(obj_name.lower())
    bm_new.to_mesh(mesh)
    bm_new.free()

    for mat in src_obj.data.materials:
        mesh.materials.append(mat)

    obj = bpy.data.objects.new(obj_name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.matrix_world = src_obj.matrix_world.copy()
    print(f"  {obj_name}: {len(mesh.vertices)} verts, {len(mesh.polygons)} faces")
    return obj

print("\nCreando objetos:")
build_object(bm, group_faces["noseGear"],  "F18-noseGear",  landing_on)
build_object(bm, group_faces["mainGearL"], "F18-mainGearL", landing_on)
build_object(bm, group_faces["mainGearR"], "F18-mainGearR", landing_on)

bm.free()

# Eliminar el F18-landingOn original (reemplazado por los 3 nuevos)
bpy.data.objects.remove(landing_on, do_unlink=True)

# ── Exportar ───────────────────────────────────────────────────────────────────
print(f"\nExportando a: {GLB_OUT}")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format='GLB',
    use_selection=False,
    export_apply=False,
)
print("Listo.")
print("Revisá los 3 grupos en Three.js.")
print("Si OK → renombrá F-18-gear-sep.glb a F-18.glb")
