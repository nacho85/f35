"""
Renderiza el tren trasero izquierdo. Auto-detecta posición real con depsgraph.
"""
import bpy, mathutils, sys, os, math

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GLB_PATH   = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "public", "F-35C.glb"))
OUT_DIR    = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "scripts", "renders"))
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=GLB_PATH)
scene = bpy.context.scene

gear_names = ["F-35C-BODY.046","F-35C-BODY.047","F-35C-BODY.048",
              "F-35C-BODY.049","F-35C-BODY.050","F-35C-BODY.051","F-35C-BODY.052"]

# ── Linkear acciones ──────────────────────────────────────────────────────────
for name in gear_names:
    obj = bpy.data.objects.get(name)
    act = bpy.data.actions.get(name)
    if obj and act:
        if not obj.animation_data:
            obj.animation_data_create()
        obj.animation_data.action = act

# ── Encontrar bounding box global del gear en frame 1 ────────────────────────
scene.frame_set(1)
dg = bpy.context.evaluated_depsgraph_get()

all_pts = []
for name in gear_names:
    obj = bpy.data.objects.get(name)
    if not obj: continue
    ev = obj.evaluated_get(dg)
    # Aplicar transform evaluado
    obj.matrix_world = ev.matrix_world.copy()
    pts = [ev.matrix_world @ mathutils.Vector(c) for c in ev.bound_box]
    all_pts.extend(pts)
    center_obj = sum(pts, mathutils.Vector()) / len(pts)
    print(f"  {name}: center=({center_obj.x:.2f},{center_obj.y:.2f},{center_obj.z:.2f})")

cx = sum(p.x for p in all_pts) / len(all_pts)
cy = sum(p.y for p in all_pts) / len(all_pts)
cz = sum(p.z for p in all_pts) / len(all_pts)
print(f"\n[INFO] Centro gear: ({cx:.2f}, {cy:.2f}, {cz:.2f})")
sys.stdout.flush()

# ── Cámara: desde arriba del gear (lateral izquierdo) ──────────────────────
cam_data = bpy.data.cameras.new("Cam")
cam_obj  = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj
cam_data.lens = 85.0

# Posición: encima del ala, ligeramente hacia afuera del eje X del gear
# Mirando hacia el centro del gear desde arriba-costado
dist = 6.0
cam_pos = mathutils.Vector((cx, cy - dist * 0.3, cz + dist * 0.8))
cam_obj.location = cam_pos
# Apuntar hacia el centro del gear
direction = mathutils.Vector((cx, cy, cz)) - cam_pos
rot_quat = direction.to_track_quat('-Z', 'Y')
cam_obj.rotation_euler = rot_quat.to_euler()
print(f"[CAM] pos=({cam_pos.x:.2f},{cam_pos.y:.2f},{cam_pos.z:.2f})")

ld = bpy.data.lights.new("Sun", 'SUN')
lo = bpy.data.objects.new("Sun", ld)
scene.collection.objects.link(lo)
lo.location = (cx + 3, cy - 5, cz + 8)
ld.energy = 5.0

scene.render.engine       = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 960
scene.render.resolution_y = 720
scene.render.image_settings.file_format = 'PNG'

# ── Colorear sospechosos ────────────────────────────────────────────────────
colors = {"F-35C-BODY.049":(1,0,0,1),"F-35C-BODY.050":(0,0.3,1,1),
          "F-35C-BODY.048":(1,0.5,0,1),"F-35C-BODY.052":(0,0.8,0,1)}
for name, color in colors.items():
    obj = bpy.data.objects.get(name)
    if obj and obj.type == 'MESH':
        mat = bpy.data.materials.new(f"COL_{name}")
        mat.diffuse_color = color
        obj.data.materials.clear()
        obj.data.materials.append(mat)

def render_frame(frame):
    scene.frame_set(frame)
    dg2 = bpy.context.evaluated_depsgraph_get()
    for name in gear_names:
        obj = bpy.data.objects.get(name)
        if obj:
            ev = obj.evaluated_get(dg2)
            obj.matrix_world = ev.matrix_world.copy()
    bpy.context.view_layer.update()
    out_path = os.path.join(OUT_DIR, f"gear_f{frame:02d}.png")
    scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    print(f"[RENDER] frame {frame} -> {out_path}")
    sys.stdout.flush()

for frame in [1, 20, 24, 26, 28, 30]:
    render_frame(frame)

print("[DONE]")
