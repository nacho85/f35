"""
Paso 1 — Análisis visual del tren de aterrizaje del MiG-29.

Abre mig-29-iran.glb, separa Object_14 y Object_16 en partes sueltas,
pinta cada parte con un color distinto e imprime bounding boxes.
Renderiza 3 vistas: frente, lateral y desde abajo.
"""
import bpy, mathutils, sys, os, math

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GLB_IN     = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "mig-29-iran.glb"))
OUT_DIR    = os.path.normpath(os.path.join(SCRIPT_DIR, "renders"))
os.makedirs(OUT_DIR, exist_ok=True)

PALETTE = [
    (1.0, 0.1, 0.1, 1),  # rojo
    (0.1, 0.6, 1.0, 1),  # azul
    (0.1, 0.9, 0.2, 1),  # verde
    (1.0, 0.8, 0.0, 1),  # amarillo
    (0.9, 0.2, 1.0, 1),  # magenta
    (0.1, 0.9, 0.9, 1),  # cyan
    (1.0, 0.5, 0.0, 1),  # naranja
    (0.7, 0.7, 0.7, 1),  # gris
]

# ── Limpiar e importar ────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

print("\n=== TODOS LOS OBJETOS ===")
for o in sorted(bpy.data.objects, key=lambda x: x.name):
    if o.type == "MESH":
        bb  = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
        ctr = sum(bb, mathutils.Vector()) / 8
        print(f"  {o.name:<20}  center=({ctr.x:6.2f}, {ctr.y:6.2f}, {ctr.z:6.2f})")
sys.stdout.flush()

def separate_loose(obj_name):
    """Selecciona el objeto, entra en edit mode, separa por loose parts, devuelve lista de nuevos objetos."""
    obj = bpy.data.objects.get(obj_name)
    if not obj:
        print(f"[WARN] {obj_name} no encontrado")
        return []
    # Ocultar el resto
    for o in bpy.data.objects:
        o.hide_set(o != obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Recolectar objetos creados (nombre empieza con obj_name o tiene sufijo .001+)
    parts = [o for o in bpy.data.objects
             if o.type == "MESH" and (o.name == obj_name or o.name.startswith(obj_name + "."))]
    # Mostrar todos de nuevo
    for o in bpy.data.objects:
        o.hide_set(False)
    return parts

# ── Separar Object_16 (gear desplegado) ──────────────────────────────────────
print("\n=== Separando Object_16 (gear desplegado) ===")
parts16 = separate_loose("Object_16")
print(f"  → {len(parts16)} partes")

# ── Separar Object_14 (gear recogido / tapas) ────────────────────────────────
print("\n=== Separando Object_14 (gear recogido) ===")
parts14 = separate_loose("Object_14")
print(f"  → {len(parts14)} partes")

# ── Pintar colores + imprimir bounding boxes ─────────────────────────────────
def paint_and_report(parts, label):
    print(f"\n=== Partes de {label} ===")
    for i, obj in enumerate(sorted(parts, key=lambda o: o.name)):
        color = PALETTE[i % len(PALETTE)]
        mat = bpy.data.materials.new(f"COL_{obj.name}")
        mat.use_nodes = False
        mat.diffuse_color = color
        obj.data.materials.clear()
        obj.data.materials.append(mat)

        bb  = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
        ctr = sum(bb, mathutils.Vector()) / 8
        xmin = min(v.x for v in bb); xmax = max(v.x for v in bb)
        ymin = min(v.y for v in bb); ymax = max(v.y for v in bb)
        zmin = min(v.z for v in bb); zmax = max(v.z for v in bb)
        col_str = f"R{color[0]:.1f}G{color[1]:.1f}B{color[2]:.1f}"
        print(f"  [{col_str}] {obj.name:<24}  "
              f"ctr=({ctr.x:6.2f},{ctr.y:6.2f},{ctr.z:6.2f})  "
              f"X[{xmin:.2f}..{xmax:.2f}]  Y[{ymin:.2f}..{ymax:.2f}]  Z[{zmin:.2f}..{zmax:.2f}]")
    sys.stdout.flush()

paint_and_report(parts16, "Object_16 (desplegado)")
paint_and_report(parts14, "Object_14 (recogido)")

# ── Ocultar todo salvo Object_16 para el render ───────────────────────────────
all_gear = set(o.name for o in parts16 + parts14)
for o in bpy.data.objects:
    if o.type == "MESH" and o.name not in all_gear:
        o.hide_render = True

# ── Calcular bounding box global del gear ────────────────────────────────────
all_pts = []
for o in parts16:
    all_pts += [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
cx = sum(p.x for p in all_pts) / len(all_pts)
cy = sum(p.y for p in all_pts) / len(all_pts)
cz = sum(p.z for p in all_pts) / len(all_pts)
print(f"\n[INFO] Centro gear desplegado: ({cx:.2f}, {cy:.2f}, {cz:.2f})")

# ── Cámara ────────────────────────────────────────────────────────────────────
cam_data = bpy.data.cameras.new("Cam")
cam_obj  = bpy.data.objects.new("Cam", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj
cam_data.lens = 50.0

sun_data = bpy.data.lights.new("Sun", "SUN")
sun_obj  = bpy.data.objects.new("Sun", sun_data)
bpy.context.scene.collection.objects.link(sun_obj)
sun_obj.location = (cx + 5, cy - 10, cz + 15)
sun_data.energy  = 6.0

bpy.context.scene.render.engine       = "BLENDER_WORKBENCH"
bpy.context.scene.render.resolution_x = 1280
bpy.context.scene.render.resolution_y = 960
bpy.context.scene.render.image_settings.file_format = "PNG"

def place_cam(pos, target):
    cam_obj.location = mathutils.Vector(pos)
    direction = mathutils.Vector(target) - mathutils.Vector(pos)
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

def render(name):
    path = os.path.join(OUT_DIR, name)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[RENDER] {path}")
    sys.stdout.flush()

DIST = 30

# Vista desde abajo (mirando hacia arriba — vemos el belly y las ruedas)
place_cam((cx, cy - 5, cz - DIST), (cx, cy, cz))
render("mig29_gear_bottom.png")

# Vista lateral
place_cam((cx - DIST, cy, cz), (cx, cy, cz))
render("mig29_gear_side.png")

# Vista frontal
place_cam((cx, cy - DIST, cz), (cx, cy, cz))
render("mig29_gear_front.png")

print("\n[DONE] Revisá scripts/renders/mig29_gear_*.png")
