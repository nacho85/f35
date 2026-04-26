"""
Blender headless: separa F18-noseGearDoor en izquierda y derecha.
  F18-noseGearDoorL  — compuertas izquierda (GLTF Z < 0)
  F18-noseGearDoorR  — compuertas derecha   (GLTF Z >= 0)

Uso:
  blender --background --python scripts/separate-f18-nose-door-lr.py
"""

import bpy, bmesh, sys, os
from collections import deque

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GLB_IN  = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-18.glb"))
GLB_OUT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-18-nose-door-split.glb"))

Z_THRESH = 0.0  # GLTF Z: >= 0 → R, < 0 → L

def to_gltf(co):
    return co.x, co.z, -co.y

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

# ── Importar ──────────────────────────────────────────────────────────────────
print(f"\nImportando: {GLB_IN}")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=GLB_IN)
bpy.context.view_layer.update()

door = next((o for o in bpy.data.objects
             if o.type == 'MESH' and o.name == 'F18-noseGearDoor'), None)
if not door:
    print("ERROR: no se encontró F18-noseGearDoor")
    sys.exit(1)

print(f"F18-noseGearDoor: {len(door.data.vertices)} verts, {len(door.data.polygons)} faces")

bm = bmesh.new()
bm.from_mesh(door.data)
bm.verts.ensure_lookup_table()
bm.edges.ensure_lookup_table()
bm.faces.ensure_lookup_table()

# BFS islands
adj = {i: [] for i in range(len(bm.verts))}
for e in bm.edges:
    a, b = e.verts[0].index, e.verts[1].index
    adj[a].append(b); adj[b].append(a)

visited = set()
islands = []
for start in range(len(bm.verts)):
    if start in visited: continue
    comp = []
    q = deque([start])
    while q:
        vi = q.popleft()
        if vi in visited: continue
        visited.add(vi); comp.append(vi)
        for nb in adj[vi]:
            if nb not in visited: q.append(nb)
    islands.append(comp)

print(f"Islas: {len(islands)}")

# Clasificar verts por isla usando centroide GLTF Z
vert_side = {}  # vert index → 'L' | 'R'
stats = {'L': 0, 'R': 0}
for comp in islands:
    coords = [to_gltf(bm.verts[i].co) for i in comp]
    gz = sum(c[2] for c in coords) / len(coords)
    side = 'R' if gz >= Z_THRESH else 'L'
    stats[side] += 1
    for vi in comp:
        vert_side[vi] = side

print(f"  L: {stats['L']} islas   R: {stats['R']} islas")

# Clasificar faces (voto mayoritario)
faces_L, faces_R = set(), set()
for face in bm.faces:
    votes = {'L': 0, 'R': 0}
    for v in face.verts:
        votes[vert_side.get(v.index, 'R')] += 1
    (faces_R if votes['R'] >= votes['L'] else faces_L).add(face.index)

print(f"  Faces L: {len(faces_L)}   Faces R: {len(faces_R)}")

build_object(bm, faces_L, 'F18-noseGearDoorL', door)
build_object(bm, faces_R, 'F18-noseGearDoorR', door)
bm.free()

bpy.data.objects.remove(door, do_unlink=True)

# ── Exportar ──────────────────────────────────────────────────────────────────
print(f"\nExportando: {GLB_OUT}")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format='GLB',
    use_selection=False,
    export_apply=False,
)
print("Listo.")
