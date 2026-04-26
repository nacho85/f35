"""
Rig + animación del tren de aterrizaje del MiG-29.

Estrategia:
  1. Importa mig-29-iran.glb
  2. Separa Object_16 en loose parts y los agrupa en 3 ensamblajes:
       gear_nose   (|Y| < 5)
       gear_left   (Y <= -5)
       gear_right  (Y >=  5)
  3. Crea empties de pivot para cada grupo (en el punto de bisagra)
  4. Anima:
       Frame 1   = tren desplegado (pose base, sin rotación)
       Frame 121 = tren recogido
       Nose  : rota sobre eje Y del pivot   -90°
       Izq   : rota sobre eje X del pivot   +95°
       Der   : rota sobre eje X del pivot   -95°
  5. Exporta mig-29-iran.glb con la animación embebida.

Nota: Object_14 y Object_18 se conservan intactos pero sin animación
(la lógica de visibilidad queda en useMig29Animations.js).
"""
import bpy
import mathutils
import math
import sys

GLB_IN  = r"C:\devs\f35\public\mig-29-iran.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-iran-anim-test.glb"

ANIM_NAME    = "GearDeploy"   # tren principal (left/right)
ANIM_NOSE    = "GearNose"    # pata delantera
ANIM_DOOR    = "GearDoor"    # compuertas bahía delantera
FRAME_START  = 1
FRAME_END    = 121   # 120 frames = ~4 s a 30 fps (Three.js lo escala)

# ─────────────────────────────────────────────────────────────────────────────
def obj_center(o):
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    return mathutils.Vector((
        sum(v.x for v in bb)/8,
        sum(v.y for v in bb)/8,
        sum(v.z for v in bb)/8,
    ))

def obj_bbox(o):
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    return (min(v.x for v in bb), max(v.x for v in bb),
            min(v.y for v in bb), max(v.y for v in bb),
            min(v.z for v in bb), max(v.z for v in bb))

def insert_rot_key(obj, frame, euler):
    obj.rotation_euler = euler
    obj.keyframe_insert(data_path="rotation_euler", frame=frame)

# ─────────────────────────────────────────────────────────────────────────────
# Limpiar e importar
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

scene = bpy.context.scene
scene.frame_start = FRAME_START
scene.frame_end   = FRAME_END

# ─────────────────────────────────────────────────────────────────────────────
# Separar Object_16 en loose parts y clasificarlas
obj16 = bpy.data.objects.get("Object_16")
if not obj16:
    print("ERROR: Object_16 no encontrado"); raise SystemExit

for o in bpy.data.objects: o.hide_set(o != obj16)
bpy.context.view_layer.objects.active = obj16
bpy.ops.object.select_all(action="DESELECT")
obj16.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.hide_set(False)

all_parts = [o for o in bpy.data.objects
             if o.type == "MESH" and (o.name == "Object_16" or o.name.startswith("Object_16."))]

nose_parts  = []
left_parts  = []
right_parts = []

for o in all_parts:
    cy = obj_center(o).y
    if cy <= -5:
        left_parts.append(o)
    elif cy >= 5:
        right_parts.append(o)
    else:
        nose_parts.append(o)

# Las 4 tapas de bahía del tren delantero identificadas visualmente:
#   centro X≈44 (vs strut en X≈58), Z≈-3 (nivel vientre), |Y|≈2.8-3.0
# Las excluimos de la animación por posición (nombres varían entre sesiones Blender)
def is_nose_door(o):
    bb  = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    xs  = [v.x for v in bb]; ys = [v.y for v in bb]; zs = [v.z for v in bb]
    cx  = sum(xs) / 8
    cy  = sum(ys) / 8
    cz  = sum(zs) / 8
    vol = (max(xs)-min(xs)) * (max(ys)-min(ys)) * (max(zs)-min(zs))
    # Tapas de bahía estáticas: X<50, |Y|>2.5, Z=-6..0
    return cx < 50 and abs(cy) > 2.5 and -6 < cz < 0

def obj_vol(o):
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
    return (max(xs)-min(xs))*(max(ys)-min(ys))*(max(zs)-min(zs))

all_door_candidates = [o for o in nose_parts if is_nose_door(o)]
nose_parts = [o for o in nose_parts if not is_nose_door(o)]

# Las dos compuertas GRANDES (vol>=50) reciben su propia animación de apertura/cierre
# Las pequeñas quedan estáticas
nose_doors_animated = [o for o in all_door_candidates if obj_vol(o) >= 50]
nose_doors_static   = [o for o in all_door_candidates if obj_vol(o) <  50]

print(f"Nariz: {len(nose_parts)} animadas | compuertas animadas: {len(nose_doors_animated)} | estáticas: {len(nose_doors_static)}")
sys.stdout.flush()

def join_group(parts, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    bpy.context.active_object.name = name
    return bpy.context.active_object

gear_nose  = join_group(nose_parts,  "gear_nose")
gear_left  = join_group(left_parts,  "gear_left")
gear_right = join_group(right_parts, "gear_right")

# Compuertas estáticas — se parentarán al pivot del lado correcto después de crearlo
# (guardamos referencia para hacerlo luego)
for o in nose_doors_static:
    o.name = f"nose_door_{o.name.split('.')[-1]}"
    print(f"  tapa estática: {o.name}")

# ─────────────────────────────────────────────────────────────────────────────
# Calcular puntos de bisagra (pivot)
#
# Main gear: bisagra en el borde INTERIOR superior de cada strut
#   → X = centro del bbox en X (la bisagra corre a lo largo del fuselaje)
#   → Y = borde interior (Ymax para izq que es negativo, Ymin para der)
#   → Z = borde superior del strut (Zmax)
#
# Nose gear: bisagra en el borde TRASERO superior del strut
#   → X = Xmax (borde trasero cerca del fuselaje)
#   → Y = 0
#   → Z = Zmax (punto más alto)

def pivot_main_left(o):
    x0,x1, y0,y1, z0,z1 = obj_bbox(o)
    return mathutils.Vector(((x0+x1)/2, y1, z1))   # Y interior (menos negativo)

def pivot_main_right(o):
    x0,x1, y0,y1, z0,z1 = obj_bbox(o)
    return mathutils.Vector(((x0+x1)/2, y0, z1))   # Y interior (menos positivo)

def pivot_nose(o):
    x0,x1, y0,y1, z0,z1 = obj_bbox(o)
    return mathutils.Vector((x1, (y0+y1)/2, z1))   # Xmax (borde trasero), Zmax

hinge_left  = pivot_main_left(gear_left)
hinge_right = pivot_main_right(gear_right)
hinge_nose  = pivot_nose(gear_nose)

print(f"Hinge left : {hinge_left}")
print(f"Hinge right: {hinge_right}")
print(f"Hinge nose : {hinge_nose}")
sys.stdout.flush()

# ─────────────────────────────────────────────────────────────────────────────
# Crear empties de pivot y parentar los engranajes
def make_pivot(name, location, child_obj):
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=location)
    pivot = bpy.context.active_object
    pivot.name = name
    # Parentar conservando transform
    bpy.ops.object.select_all(action="DESELECT")
    child_obj.select_set(True)
    pivot.select_set(True)
    bpy.context.view_layer.objects.active = pivot
    bpy.ops.object.parent_set(type="OBJECT", keep_transform=True)
    return pivot

pivot_nose_obj  = make_pivot("pivot_nose",  hinge_nose,  gear_nose)
pivot_left_obj  = make_pivot("pivot_left",  hinge_left,  gear_left)
pivot_right_obj = make_pivot("pivot_right", hinge_right, gear_right)

# ─────────────────────────────────────────────────────────────────────────────
# Crear animación: frame 1 = desplegado, frame 121 = recogido
#
# Ángulos de recogida (en radianes):
#   Main gear izq : rota sobre X del pivot  +95° → strut sube y se dobla hacia adentro
#   Main gear der : rota sobre X del pivot  -95°
#   Nose gear     : rota sobre Y del pivot  -90° → strut se dobla hacia atrás

ROT_MAIN = math.radians(95)
ROT_NOSE = math.radians(50)

def euler_xyz(rx=0, ry=0, rz=0):
    return mathutils.Euler((rx, ry, rz), "XYZ")

for pivot, rx, ry in [
    (pivot_left_obj,  ROT_MAIN,  0),
    (pivot_right_obj, -ROT_MAIN, 0),
    (pivot_nose_obj,  0,         ROT_NOSE),
]:
    # Frame 1: pose desplegada (sin rotación)
    insert_rot_key(pivot, FRAME_START, euler_xyz(0, 0, 0))
    # Frame 121: pose recogida
    insert_rot_key(pivot, FRAME_END,   euler_xyz(rx, ry, 0))

# ── Compuertas de bahía animadas ─────────────────────────────────────────────
# Estrategia: usar la geometría de Object_14 (posición PLEGADA exacta del modelo
# original) como mesh de partida.
# Frame 1 (rot=0) = plegado EXACTO desde Object_14. Frame 121 = desplegado.

# 1. Separar Object_14 en loose parts
obj14_orig = bpy.data.objects.get("Object_14")
if not obj14_orig:
    print("ERROR: Object_14 no encontrado"); raise SystemExit

for o in bpy.data.objects: o.hide_set(o != obj14_orig)
bpy.context.view_layer.objects.active = obj14_orig
bpy.ops.object.select_all(action="DESELECT")
obj14_orig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.hide_set(False)

all_obj14 = [o for o in bpy.data.objects
             if o.type == "MESH" and (o.name == "Object_14" or o.name.startswith("Object_14."))]

# 2. Encontrar el panel combinado de bahía delantera (cx≈50, cy≈0, cz≈-2.4)
obj14_door_combined = None
for o in sorted(all_obj14, key=lambda x: -len(x.data.vertices)):
    bb  = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
    cx=sum(xs)/8; cy=sum(ys)/8; cz=sum(zs)/8
    if 38 < cx < 56 and abs(cy) < 2.0 and -5 < cz < -1.5 and len(o.data.vertices) > 20:
        obj14_door_combined = o
        print(f"  Object_14 panel bahía: {o.name}  cx={cx:.1f} cy={cy:.1f} cz={cz:.1f} nverts={len(o.data.vertices)}")
        break

if not obj14_door_combined:
    print("ERROR: no se encontró panel de bahía en Object_14"); raise SystemExit

# 3. Dividir el panel en mitad R (y>0) y mitad L (y<0) usando selección de vértices
def split_door_halves(combined):
    """Retorna (door_R, door_L) separando el mesh por signo de Y."""
    # Primero duplicar para tener dos copias
    bpy.ops.object.select_all(action="DESELECT")
    combined.select_set(True)
    bpy.context.view_layer.objects.active = combined
    bpy.ops.object.duplicate()
    door_R_obj = bpy.context.active_object
    door_R_obj.name = "bay_door_R"

    bpy.ops.object.select_all(action="DESELECT")
    combined.select_set(True)
    bpy.context.view_layer.objects.active = combined
    bpy.ops.object.duplicate()
    door_L_obj = bpy.context.active_object
    door_L_obj.name = "bay_door_L"

    # En door_R: eliminar vértices con Y <= 0
    bpy.context.view_layer.objects.active = door_R_obj
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in door_R_obj.data.vertices:
        wv = door_R_obj.matrix_world @ v.co
        v.select = wv.y <= 0.0
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")

    # En door_L: eliminar vértices con Y >= 0
    bpy.context.view_layer.objects.active = door_L_obj
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in door_L_obj.data.vertices:
        wv = door_L_obj.matrix_world @ v.co
        v.select = wv.y >= 0.0
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Ocultar el original
    combined.hide_set(True)
    return door_R_obj, door_L_obj

door_R, door_L = split_door_halves(obj14_door_combined)
obj14_doors = {"R": door_R, "L": door_L}
print(f"  Mitad R: {len(door_R.data.vertices)} verts  |  Mitad L: {len(door_L.data.vertices)} verts")

# 4. Centroides Object_16 para calcular ángulo de despliegue
obj16_door_centroids = {}
for door_obj in nose_doors_animated:
    bb = [door_obj.matrix_world @ mathutils.Vector(c) for c in door_obj.bound_box]
    cy = sum(v.y for v in bb) / 8
    cz = sum(v.z for v in bb) / 8
    side = "R" if cy > 0 else "L"
    obj16_door_centroids[side] = (cy, cz)

# 5. Crear pivots y animación
door_pivots = []
for side, door_obj in obj14_doors.items():
    bb   = [door_obj.matrix_world @ mathutils.Vector(c) for c in door_obj.bound_box]
    xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
    cx        = sum(xs) / 8
    cy_stowed = sum(ys) / 8
    cz_stowed = sum(zs) / 8
    # Bisagra: borde exterior en Y, nivel techo del panel plegado (Zmax)
    hinge_y = max(ys) if side == "R" else min(ys)
    hinge_z = max(zs)
    hinge   = mathutils.Vector((cx, hinge_y, hinge_z))

    p = make_pivot(f"pivot_nose_door_{side}", hinge, door_obj)

    # Ángulo de despliegue: desde plegado (Object_14) hacia desplegado (Object_16)
    cy_open, cz_open = obj16_door_centroids.get(side, (cy_stowed, cz_stowed))
    v_stowed = mathutils.Vector((cy_stowed - hinge_y, cz_stowed - hinge_z))
    v_open   = mathutils.Vector((cy_open   - hinge_y, cz_open   - hinge_z))
    cos_a    = max(-1.0, min(1.0, v_stowed.dot(v_open) /
                             max(v_stowed.length * v_open.length, 1e-6)))
    angle    = math.acos(cos_a)
    cross_z  = v_stowed.x * v_open.y - v_stowed.y * v_open.x
    if cross_z < 0: angle = -angle

    # Frame 1 = plegado exacto (rot=0). Frame 121 = desplegado.
    insert_rot_key(p, FRAME_START, euler_xyz(0,     0, 0))
    insert_rot_key(p, FRAME_END,   euler_xyz(angle, 0, 0))
    door_pivots.append(p)
    print(f"  compuerta {side}: hinge=({cx:.1f},{hinge_y:.2f},{hinge_z:.2f})  deploy_rx={math.degrees(angle):.1f}°")

# Eliminar los fragments originales de Object_16 que son compuertas (ya reemplazados por Object_14)
bpy.ops.object.select_all(action="DESELECT")
to_delete = list(nose_doors_animated) + list(nose_doors_static) + list(all_door_candidates)
for o in to_delete:
    if o.name in bpy.data.objects:
        o.select_set(True)
bpy.ops.object.delete()
print(f"  Eliminados {len(to_delete)} fragmentos de compuerta de Object_16")

# Renombrar acción e imponer interpolación LINEAR — por tipo
def iter_fcurves(action):
    """Itera fcurves compatible con Blender 4.x y 5.x (nuevo sistema de slots)."""
    # Blender 5.x: layers → strips → channelbag(slot) → fcurves
    slots = list(getattr(action, 'slots', []))
    layers = list(getattr(action, 'layers', []))
    if slots and layers:
        for layer in layers:
            for strip in getattr(layer, 'strips', []):
                bag_fn = getattr(strip, 'channelbag', None)
                if callable(bag_fn):
                    for slot in slots:
                        bag = bag_fn(slot)
                        if bag is not None:
                            yield from getattr(bag, 'fcurves', [])
        return
    # Blender 4.x API legacy fallback
    yield from getattr(action, 'fcurves', [])

def set_action_name_linear(pivot, name):
    if pivot.animation_data and pivot.animation_data.action:
        pivot.animation_data.action.name = name
        for fc in iter_fcurves(pivot.animation_data.action):
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'

set_action_name_linear(pivot_left_obj,  ANIM_NAME)
set_action_name_linear(pivot_right_obj, ANIM_NAME)
set_action_name_linear(pivot_nose_obj,  ANIM_NOSE)
for p in door_pivots:
    set_action_name_linear(p, ANIM_DOOR)

# gear_nose: visibilidad controlada desde JS — no exportar keyframes de visibilidad
# (los keyframes de hide_render/hide_viewport causan pops en Three.js)

print(f"\nAnimaciones creadas: '{ANIM_NAME}' (main), '{ANIM_NOSE}' (nose), '{ANIM_DOOR}' (doors): frames {FRAME_START}→{FRAME_END}")
sys.stdout.flush()

# ─────────────────────────────────────────────────────────────────────────────
# Exportar GLB
bpy.ops.export_scene.gltf(
    filepath        = GLB_OUT,
    export_format   = "GLB",
    export_image_format = "AUTO",
    export_animations   = True,
    export_frame_range  = True,
)
print(f"\nOK → {GLB_OUT}")
