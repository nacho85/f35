"""
Blender headless: detecta qué mesh del tren trasero izquierdo
atraviesa la superficie del ala frame a frame.
"""
import bpy, mathutils, sys, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GLB_PATH   = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-35C.glb"))

# ── Limpiar e importar ────────────────────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=GLB_PATH)
bpy.context.view_layer.update()

# ── Listar todos los objetos (primeros 80) ────────────────────────────────────
all_objs = list(bpy.data.objects)
print("\n=== TODOS LOS OBJETOS (primeros 80) ===")
for o in all_objs[:80]:
    print(f"  {o.type:8}  {o.name}")

# ── Buscar objetos cuyo nombre contiene BODY y número ≥ 046 ──────────────────
print("\n=== Objetos F-35C-BODY.046-052 ===")
targets = []
for o in all_objs:
    for n in ["BODY.046","BODY.047","BODY.048","BODY.049","BODY.050","BODY.051","BODY.052"]:
        if n in o.name:
            print(f"  {o.type:8}  {o.name}  parent={o.parent.name if o.parent else 'None'}")
            targets.append(o)
            break

# ── Recolectar todos los meshes hijos de cada target ─────────────────────────
def collect_meshes(obj):
    result = []
    if obj.type == 'MESH':
        result.append(obj)
    for child in obj.children:
        result.extend(collect_meshes(child))
    return result

mesh_objs = []
for t in targets:
    mesh_objs.extend(collect_meshes(t))

# Incluir también los propios targets si son MESH
print(f"\n[INFO] Meshes a analizar: {len(mesh_objs)}")
for m in mesh_objs:
    print(f"  {m.name}")

# También buscar meshes que contengan gear-related names
print("\n=== Buscando animaciones del gear ===")
for action in bpy.data.actions:
    if any(x in action.name for x in ["BODY.04","BODY.05","gear","Gear","ontekeranimation2.00"]):
        print(f"  Action: {action.name!r}  frame_range={action.frame_range}")

# ── Encontrar la cota Z del ala izquierda (superficie superior) ───────────────
# Buscamos el objeto principal del fuselaje/ala
print("\n=== Búsqueda de cota del ala ===")
wing_obj = None
for o in all_objs:
    if o.type == 'MESH' and ('F-35C-BODY' in o.name or 'Wing' in o.name or 'Body' in o.name or 'body' in o.name):
        if 'rafale' not in o.name.lower():
            bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
            z_max = max(v.z for v in bb)
            x_min = min(v.x for v in bb)
            print(f"  {o.name:<40}  z_max={z_max:.3f}  x_min={x_min:.3f}")

sys.stdout.flush()

# ── Verificar y linkear acciones a objetos ───────────────────────────────────
print("\n=== Estado animation_data de gear objects ===")
for obj in mesh_objs:
    ad = obj.animation_data
    action_name = ad.action.name if (ad and ad.action) else "NINGUNA"
    print(f"  {obj.name:<32}  action={action_name!r}")
    # Si no tiene action asignada, buscar la que coincida por nombre
    if not (ad and ad.action):
        matching = bpy.data.actions.get(obj.name)
        if matching:
            if not ad:
                obj.animation_data_create()
            obj.animation_data.action = matching
            print(f"    -> linkeada acción '{matching.name}'")

# ── Análisis frame a frame ───────────────────────────────────────────────────
scene = bpy.context.scene
# Usar el rango de la primera acción del gear
gear_action = None
for action in bpy.data.actions:
    if "BODY.046" in action.name:
        gear_action = action
        break

if gear_action:
    f_start = int(gear_action.frame_range[0])
    f_end   = int(gear_action.frame_range[1])
else:
    f_start, f_end = 1, 30

print(f"\n[INFO] Rango frames análisis: {f_start} → {f_end}")

if not mesh_objs and targets:
    # Usar los propios targets aunque no sean MESH — tomar su bound_box de empties
    mesh_objs = [t for t in targets if hasattr(t, 'bound_box') and t.type == 'MESH']

if not mesh_objs:
    # Fallback: buscar meshes cuyo nombre incluya 46-52
    for o in all_objs:
        if o.type == 'MESH' and any(str(n) in o.name for n in range(46,53)):
            mesh_objs.append(o)

print(f"[INFO] {len(mesh_objs)} meshes para analizar")

# Guardar Z en frame inicial como referencia
scene.frame_set(f_start)
depsgraph0 = bpy.context.evaluated_depsgraph_get()
ref_z = {}
for m in mesh_objs:
    eval_obj = m.evaluated_get(depsgraph0)
    bb = [eval_obj.matrix_world @ mathutils.Vector(c) for c in eval_obj.bound_box]
    ref_z[m.name] = max(v.z for v in bb)

print("\n%5s  %-32s  %8s  %8s  NOTE" % ("frame","mesh","z_max","dz"))
print("-" * 75)

clips = []
for frame in range(f_start, f_end + 1):
    scene.frame_set(frame)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for m in mesh_objs:
        eval_obj = m.evaluated_get(depsgraph)
        bb = [eval_obj.matrix_world @ mathutils.Vector(c) for c in eval_obj.bound_box]
        z_now = max(v.z for v in bb)
        dz = z_now - ref_z[m.name]
        note = " <<< SOBRESALE" if dz > 0.02 else ""
        print("%5d  %-32s  %8.4f  %+8.4f%s" % (frame, m.name, z_now, dz, note))
        if dz > 0.02:
            clips.append((frame, m.name, dz))
    sys.stdout.flush()

print("\n=== RESUMEN ===")
if clips:
    for f, n, d in clips:
        print(f"  frame {f:>3}:  {n}  Δz={d:+.4f}")
else:
    print("  Sin clips detectados")

print("[DONE]")
