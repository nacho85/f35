"""
Blender headless: separa compuertas de los nodos de tren de aterrizaje.
Lee F-18.glb (con trenes ya separados) y crea:
  F18-noseGearDoor    — compuertas tren delantero
  F18-mainGearLDoor   — compuertas tren trasero izquierdo
  F18-mainGearRDoor   — compuertas tren trasero derecho

Los centroides de compuertas están en espacio GLTF = world Three.js × 10.

Uso:
  blender --background --python scripts/separate-f18-gear-doors.py
"""

import bpy, bmesh, sys, os
from collections import deque

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GLB_IN  = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-18.glb.bak-predoors"))
GLB_OUT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-18-gear-doors.glb"))

# Centroides de compuertas en espacio GLTF (world Three.js × 10)
# Identificadas por click en Three.js con debug paint
DOOR_CENTROIDS = {
    "F18-noseGear": [
        ( 77.1, -7.8,  3.9),   # delantera derecha
        ( 67.0, -8.1,  1.4),   # trasera derecha
        ( 77.1, -6.4, -3.7),   # izquierda
        # sub-islas delantera derecha (BFS Blender más fino que Three.js)
        ( 77.1, -10.3,  3.4),
        ( 80.7,  -7.8,  3.7),
        ( 73.5,  -7.9,  3.9),
        ( 74.1,  -9.3,  4.5),
        # nuevas — identificadas por click en cyan (noseGear separado)
        ( 61.2,  -6.2,  1.0),  # trasera derecha (aft-right)
        ( 72.9,  -6.2,  1.0),  # delantera derecha parte 1
        ( 73.5,  -8.4,  1.3),  # delantera derecha parte 2
        ( 80.7,  -6.5, -3.5),  # izquierda parte 1
        ( 73.5,  -6.3, -3.7),  # izquierda parte 2
        ( 80.6, -10.1,  3.4),  # delantera izquierda parte extra
        ( 60.6,  -8.2,  1.3),  # trasera izquierda
    ],
    "F18-mainGearL": [
        (  7.6, -12.0, -3.3),  # delantera derecha
        ( -5.3,  -9.4, -1.4),  # trasera derecha
        ( -4.9, -10.4,-10.7),  # izquierda exterior
    ],
    "F18-mainGearR": [
        (  7.6, -12.0,  3.3),  # delantera izquierda
        ( -5.3,  -9.4,  1.4),  # trasera izquierda
        ( -4.9, -10.4, 10.7),  # derecha exterior
    ],
}

TOL2          = 4.0  # radio² inclusión (radio = 2.0 unidades)
TOL2_NOTDOOR  = 2.0  # radio² exclusión — más chico para no excluir piezas reales

# Islas que caen dentro de TOL2 pero NO son compuertas
NOT_DOOR = {
    "F18-noseGear": [
        (62.6, -5.5,  0.0),  # mecanismo strut, no compuerta
    ],
}

def to_gltf(co):
    """Blender local → GLTF: x=B.x, y=B.z, z=-B.y"""
    return co.x, co.z, -co.y

def is_door(gx, gy, gz, door_list):
    return any((gx-dx)**2 + (gy-dy)**2 + (gz-dz)**2 < TOL2
               for dx, dy, dz in door_list)

def build_object_from_faces(bm_src, face_indices, obj_name, src_obj):
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
    return obj

# ── Importar ──────────────────────────────────────────────────────────────────
print(f"\nImportando: {GLB_IN}")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=GLB_IN)
bpy.context.view_layer.update()

# ── Procesar cada nodo de tren ────────────────────────────────────────────────
for gear_name, door_list in DOOR_CENTROIDS.items():
    gear_obj = next((o for o in bpy.data.objects
                     if o.type == 'MESH' and o.name == gear_name), None)
    if not gear_obj:
        print(f"ERROR: no se encontró {gear_name}")
        sys.exit(1)

    print(f"\n{gear_name}: {len(gear_obj.data.vertices)} verts, {len(gear_obj.data.polygons)} faces")

    bm = bmesh.new()
    bm.from_mesh(gear_obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    # BFS completo
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

    print(f"  Islas: {len(islands)}")

    # Identificar verts de compuerta
    not_door_list = NOT_DOOR.get(gear_name, [])
    door_verts = set()
    for comp in islands:
        coords = [to_gltf(bm.verts[i].co) for i in comp]
        n = len(coords)
        gx = sum(c[0] for c in coords) / n
        gy = sum(c[1] for c in coords) / n
        gz = sum(c[2] for c in coords) / n
        if not_door_list and any((gx-dx)**2+(gy-dy)**2+(gz-dz)**2 < TOL2_NOTDOOR
                                  for dx,dy,dz in not_door_list):
            print(f"  EXCLUDED: {n:5d} verts  ({gx:.1f}, {gy:.1f}, {gz:.1f})")
            continue
        if is_door(gx, gy, gz, door_list):
            print(f"  DOOR: {n:5d} verts  ({gx:.1f}, {gy:.1f}, {gz:.1f})")
            door_verts.update(comp)

    print(f"  Total verts compuerta: {len(door_verts)}")

    # Faces de compuerta (todos sus verts son door)
    door_face_idx = {f.index for f in bm.faces
                     if all(v.index in door_verts for v in f.verts)}
    print(f"  Faces compuerta: {len(door_face_idx)}")

    # Crear nodo de compuerta
    door_name = gear_name + "Door"
    door_obj = build_object_from_faces(bm, door_face_idx, door_name, gear_obj)
    print(f"  {door_name}: {len(door_obj.data.vertices)} verts, {len(door_obj.data.polygons)} faces")

    # Eliminar faces de compuerta del nodo de tren
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in door_face_idx], context='FACES')
    orphans = [v for v in bm.verts if not v.link_faces]
    if orphans:
        bmesh.ops.delete(bm, geom=orphans, context='VERTS')
    bm.to_mesh(gear_obj.data)
    gear_obj.data.update()
    bm.free()
    print(f"  {gear_name} restante: {len(gear_obj.data.vertices)} verts, {len(gear_obj.data.polygons)} faces")

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
