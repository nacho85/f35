"""
Blender headless: riga las compuertas del tren nasal del F-18.

Lee F-18-nose-door-split.glb (que tiene F18-noseGearDoorL y F18-noseGearDoorR).
Separa F18-noseGearDoorR en Fwd y Aft usando gap Z.
Para cada compuerta crea un hueso y anima:
  frame  1 = desplegada (posición actual, tren abajo)
  frame 30 = plegada  (compuerta cerrada contra fuselaje)

Eje de rotación: borde de unión compuerta↔fuselaje.
  - DoorL   → bisagra en Z negativo (lateral izquierdo)
  - DoorRFwd → bisagra en Z positivo, eje ≈ X (puntos clickeados en fuselaje)
  - DoorRAft → bisagra en Z positivo, eje ≈ X (borde trasero)

Uso:
  blender --background --python scripts/rig-f18-nose-doors.py
"""

import bpy, bmesh, sys, os, math
from collections import deque
import mathutils

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GLB_IN  = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-18-nose-door-split.glb"))
GLB_OUT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-18-nose-rigged.glb"))

# ── Bisagras en coordenadas GLTF (= world Three.js × 10) ────────────────────
# Transformación GLTF→Blender: x=gx, y=-gz, z=gy  (inversa de to_gltf)
def gltf_to_blender(gx, gy, gz):
    return (gx, -gz, gy)

# R Fwd: puntos clickeados en fuselaje (Three.js world × 10)
RFWD_P1_GLTF = (74.78, -5.22, 3.25)
RFWD_P2_GLTF = (80.27, -5.34, 3.19)

# L: bisagra estimada (simétrica a RFwd en Z negativo)
LDOOR_P1_GLTF = (74.78, -5.22, -3.25)
LDOOR_P2_GLTF = (80.27, -5.34, -3.19)

# R Aft: bisagra estimada (más atrás en X)
RAFT_P1_GLTF  = (60.0, -5.22, 3.25)
RAFT_P2_GLTF  = (67.0, -5.34, 3.19)

# ── Ángulo de cierre (radianes) ──────────────────────────────────────────────
CLOSE_ANGLE = math.pi / 2   # 90° — cada compuerta rota 90° para cerrarse

FRAME_OPEN   = 1
FRAME_CLOSED = 30

# ── Helpers BFS ──────────────────────────────────────────────────────────────
def bfs_islands(bm):
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    adj = {v.index: [] for v in bm.verts}
    for e in bm.edges:
        a, b = e.verts[0].index, e.verts[1].index
        adj[a].append(b); adj[b].append(a)
    visited = set()
    islands = []
    for start in adj:
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
    return islands

def island_centroid_gltf(bm, verts_idx):
    """Centroide en coordenadas GLTF (x=B.x, y=B.z, z=-B.y)."""
    bm.verts.ensure_lookup_table()
    coords = [bm.verts[i].co for i in verts_idx]
    n = len(coords)
    gx = sum(c.x for c in coords) / n
    gy = sum(c.z for c in coords) / n   # GLTF y = Blender z
    gz = sum(-c.y for c in coords) / n  # GLTF z = -Blender y
    return (gx, gy, gz)

def split_by_z_gap(bm, islands):
    """Separa las islas en 2 grupos por el mayor gap en coordenada GLTF Z."""
    centroids = [(island_centroid_gltf(bm, comp), comp) for comp in islands]
    by_z = sorted(centroids, key=lambda x: x[0][2])   # ordena por GLTF Z
    max_gap = -1; split_at = 1
    for k in range(1, len(by_z)):
        gap = by_z[k][0][2] - by_z[k-1][0][2]
        if gap > max_gap:
            max_gap = gap; split_at = k
    low_z  = [item[1] for item in by_z[:split_at]]   # Aft
    high_z = [item[1] for item in by_z[split_at:]]   # Fwd
    return high_z, low_z   # Fwd, Aft

def verts_from_island_list(islands):
    s = set()
    for comp in islands:
        s.update(comp)
    return s

def build_mesh_from_verts(bm_src, vert_set, name, src_obj):
    """Crea un objeto mesh con las faces cuyos vértices pertenecen a vert_set."""
    bm_src.faces.ensure_lookup_table()
    bm_new = bmesh.new()
    uv_layers = list(bm_src.loops.layers.uv.values())
    for layer in uv_layers:
        bm_new.loops.layers.uv.new(layer.name)
    vert_map = {}
    for face in bm_src.faces:
        if not all(v.index in vert_set for v in face.verts):
            continue
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
    mesh = bpy.data.meshes.new(name.lower())
    bm_new.to_mesh(mesh)
    bm_new.free()
    for mat in src_obj.data.materials:
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.matrix_world = src_obj.matrix_world.copy()
    print(f"  {name}: {len(mesh.vertices)} verts, {len(mesh.polygons)} faces")
    return obj

# ── Rigging ───────────────────────────────────────────────────────────────────
def make_bone_and_rig(armature_obj, bone_name, p1_gltf, p2_gltf, close_angle, mesh_obj):
    """
    Crea un hueso entre p1 y p2 (coords GLTF→Blender), skinea mesh_obj al hueso,
    y crea keyframes frame_open=identity, frame_closed=rotado close_angle.
    """
    arm = armature_obj.data
    bpy.context.view_layer.objects.active = armature_obj
    bpy.ops.object.mode_set(mode='EDIT')

    p1b = mathutils.Vector(gltf_to_blender(*p1_gltf))
    p2b = mathutils.Vector(gltf_to_blender(*p2_gltf))

    bone = arm.edit_bones.new(bone_name)
    bone.head = p1b
    bone.tail = p2b
    bone.use_deform = True

    bpy.ops.object.mode_set(mode='OBJECT')

    # Vertex group = todos los verts del mesh
    vg = mesh_obj.vertex_groups.new(name=bone_name)
    vg.add(list(range(len(mesh_obj.data.vertices))), 1.0, 'REPLACE')

    # Armature modifier
    mod = mesh_obj.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = armature_obj
    mod.use_vertex_groups = True

    # Parent
    mesh_obj.parent = armature_obj
    mesh_obj.parent_type = 'OBJECT'

    # Animar el pose bone
    bpy.context.view_layer.objects.active = armature_obj
    bpy.ops.object.mode_set(mode='POSE')
    pb = armature_obj.pose.bones[bone_name]

    # Frame abierta (posición natural)
    bpy.context.scene.frame_set(FRAME_OPEN)
    pb.rotation_mode = 'AXIS_ANGLE'
    pb.rotation_axis_angle = (0, 0, 1, 0)
    pb.keyframe_insert(data_path='rotation_axis_angle', frame=FRAME_OPEN)

    # Frame cerrada — rota alrededor del eje local Y del hueso (= dirección del hueso = bisagra en world X)
    bpy.context.scene.frame_set(FRAME_CLOSED)
    pb.rotation_axis_angle = (close_angle, 0, 1, 0)
    pb.keyframe_insert(data_path='rotation_axis_angle', frame=FRAME_CLOSED)

    bpy.ops.object.mode_set(mode='OBJECT')
    print(f"  Bone '{bone_name}': {p1b} → {p2b}, close_angle={math.degrees(close_angle):.1f}°")

# ── Main ──────────────────────────────────────────────────────────────────────
print(f"\nImportando: {GLB_IN}")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=GLB_IN)
bpy.context.view_layer.update()

all_objs = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
print("Objetos encontrados:", list(all_objs.keys()))

door_l = all_objs.get("F18-noseGearDoorL")
door_r = all_objs.get("F18-noseGearDoorR")

if not door_l:
    print("ERROR: F18-noseGearDoorL no encontrada"); sys.exit(1)
if not door_r:
    print("ERROR: F18-noseGearDoorR no encontrada"); sys.exit(1)

# ── Split F18-noseGearDoorR → Fwd + Aft ──────────────────────────────────────
print(f"\nSplitting F18-noseGearDoorR...")
bm_r = bmesh.new()
bm_r.from_mesh(door_r.data)
bm_r.verts.ensure_lookup_table()

islands_r = bfs_islands(bm_r)
print(f"  {len(islands_r)} islas")

fwd_islands, aft_islands = split_by_z_gap(bm_r, islands_r)
fwd_verts = verts_from_island_list(fwd_islands)
aft_verts = verts_from_island_list(aft_islands)
print(f"  Fwd verts: {len(fwd_verts)}   Aft verts: {len(aft_verts)}")

door_r_fwd = build_mesh_from_verts(bm_r, fwd_verts, "F18-noseGearDoorRFwd", door_r)
door_r_aft = build_mesh_from_verts(bm_r, aft_verts, "F18-noseGearDoorRAft", door_r)
bm_r.free()

# Ocultar el R original (ya separado)
door_r.hide_render = True
door_r.hide_viewport = True

# ── Crear armadura ────────────────────────────────────────────────────────────
print("\nCreando armadura...")
arm_data = bpy.data.armatures.new("F18-noseDoorsArm")
arm_obj  = bpy.data.objects.new("F18-noseDoorsArm", arm_data)
bpy.context.collection.objects.link(arm_obj)

bpy.context.scene.frame_start = FRAME_OPEN
bpy.context.scene.frame_end   = FRAME_CLOSED

# DoorL  — rota en sentido negativo (se cierra hacia la derecha desde la izquierda)
make_bone_and_rig(arm_obj, "DoorL",
                  LDOOR_P1_GLTF, LDOOR_P2_GLTF,
                  -CLOSE_ANGLE, door_l)

# DoorRFwd — rota en sentido positivo
make_bone_and_rig(arm_obj, "DoorRFwd",
                  RFWD_P1_GLTF, RFWD_P2_GLTF,
                  CLOSE_ANGLE, door_r_fwd)

# DoorRAft — rota en sentido positivo
make_bone_and_rig(arm_obj, "DoorRAft",
                  RAFT_P1_GLTF, RAFT_P2_GLTF,
                  CLOSE_ANGLE, door_r_aft)

# ── Exportar ──────────────────────────────────────────────────────────────────
print(f"\nExportando: {GLB_OUT}")
# Deselect all, select only what we need (excluir door_r hidden)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.name != door_r.name:
        obj.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_animations=True,
    export_skins=True,
    export_morph=False,
)
print("Listo.")
