"""
Separa gear_nose en partes sueltas, las pinta de colores distintos
y renderiza desde abajo y de costado para identificar qué hay adentro.
"""
import bpy, mathutils, sys, os, math

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GLB_IN  = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "mig-29-iran-anim-test.glb"))
OUT_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "renders"))
os.makedirs(OUT_DIR, exist_ok=True)

PALETTE = [
    (1.0, 0.1, 0.1, 1),  # rojo
    (0.1, 0.6, 1.0, 1),  # azul
    (0.1, 0.9, 0.2, 1),  # verde
    (1.0, 0.8, 0.0, 1),  # amarillo
    (0.9, 0.2, 1.0, 1),  # magenta
    (0.1, 0.9, 0.9, 1),  # cyan
    (1.0, 0.5, 0.0, 1),  # naranja
    (0.8, 0.8, 0.8, 1),  # gris claro
    (0.4, 0.1, 0.0, 1),  # marrón
    (0.0, 0.4, 0.0, 1),  # verde oscuro
]

# ── Limpiar e importar ────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

gear_nose = bpy.data.objects.get("gear_nose")
if not gear_nose:
    print("ERROR: gear_nose no encontrado")
    for o in bpy.data.objects:
        print(" ", o.name, o.type)
    raise SystemExit

print(f"gear_nose encontrado. Vértices: {len(gear_nose.data.vertices)}")

# ── Separar por loose parts ───────────────────────────────────────────────────
for o in bpy.data.objects: o.hide_set(o != gear_nose)
bpy.context.view_layer.objects.active = gear_nose
bpy.ops.object.select_all(action="DESELECT")
gear_nose.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.hide_set(False)

parts = [o for o in bpy.data.objects
         if o.type == "MESH" and (o.name == "gear_nose" or o.name.startswith("gear_nose."))]

print(f"\nTotal partes sueltas: {len(parts)}")

# ── Calcular centro + volumen de cada parte ───────────────────────────────────
def obj_stats(o):
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    cx = sum(v.x for v in bb)/8
    cy = sum(v.y for v in bb)/8
    cz = sum(v.z for v in bb)/8
    vol = (max(v.x for v in bb)-min(v.x for v in bb)) * \
          (max(v.y for v in bb)-min(v.y for v in bb)) * \
          (max(v.z for v in bb)-min(v.z for v in bb))
    return cx, cy, cz, vol

stats = [(o, *obj_stats(o)) for o in parts]
stats.sort(key=lambda x: -x[4])  # mayor volumen primero

print("\n=== TOP 20 por tamaño (cx, cy, cz, vol) ===")
for i, (o, cx, cy, cz, vol) in enumerate(stats[:20]):
    color = PALETTE[i % len(PALETTE)]
    col_name = f"R{color[0]:.1f}G{color[1]:.1f}B{color[2]:.1f}"
    print(f"  [{col_name}] {o.name:<28} cx={cx:6.2f} cy={cy:6.2f} cz={cz:6.2f} vol={vol:8.3f}")

# ── Pintar colores ─────────────────────────────────────────────────────────────
# Ordenar por Y para identificar piezas simétricas o fuera de lugar
stats_by_y = sorted(stats, key=lambda x: x[2])  # por cy

for i, (o, cx, cy, cz, vol) in enumerate(stats_by_y):
    color = PALETTE[i % len(PALETTE)]
    mat = bpy.data.materials.new(f"COL_{i}")
    mat.use_nodes = False
    mat.diffuse_color = color
    o.data.materials.clear()
    o.data.materials.append(mat)

print("\n=== Piezas ordenadas por Y (detectar outliers) ===")
for o, cx, cy, cz, vol in stats_by_y:
    flag = "  <<< OUTLIER Y" if abs(cy) > 8 else ""
    print(f"  {o.name:<28} cy={cy:7.2f} cz={cz:7.2f} vol={vol:8.3f}{flag}")

sys.stdout.flush()

# ── Ocultar todo excepto las partes del gear nose ─────────────────────────────
nose_names = {o.name for o, *_ in stats}
for o in bpy.data.objects:
    if o.type == "MESH" and o.name not in nose_names:
        o.hide_render = True
        o.hide_viewport = True

# ── Cámara y luz ──────────────────────────────────────────────────────────────
all_pts = []
for o, *_ in stats:
    all_pts += [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
cx = sum(p.x for p in all_pts)/len(all_pts)
cy = sum(p.y for p in all_pts)/len(all_pts)
cz = sum(p.z for p in all_pts)/len(all_pts)

cam_data = bpy.data.cameras.new("Cam")
cam_obj  = bpy.data.objects.new("Cam", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj
cam_data.lens = 50.0

sun_d = bpy.data.lights.new("Sun", "SUN")
sun_o = bpy.data.objects.new("Sun", sun_d)
bpy.context.scene.collection.objects.link(sun_o)
sun_o.location = (cx, cy - 10, cz + 15)
sun_d.energy = 6.0

bpy.context.scene.render.engine       = "BLENDER_WORKBENCH"
bpy.context.scene.render.resolution_x = 1280
bpy.context.scene.render.resolution_y = 960
bpy.context.scene.render.image_settings.file_format = "PNG"

def place_cam(pos, target):
    cam_obj.location = mathutils.Vector(pos)
    direction = mathutils.Vector(target) - mathutils.Vector(pos)
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

def render(name):
    bpy.context.scene.render.filepath = os.path.join(OUT_DIR, name)
    bpy.ops.render.render(write_still=True)
    print(f"[RENDER] {name}")
    sys.stdout.flush()

DIST = 40
# Vista lateral (desde el costado)
place_cam((cx, cy - DIST, cz), (cx, cy, cz))
render("nose_gear_side.png")
# Vista desde abajo
place_cam((cx, cy, cz - DIST), (cx, cy, cz))
render("nose_gear_bottom.png")
# Vista frontal
place_cam((cx + DIST, cy, cz), (cx, cy, cz))
render("nose_gear_front.png")

print("\n[DONE]")
