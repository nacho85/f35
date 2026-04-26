"""
Pinta marcadores en 16 posiciones candidatas para encontrar
el UV del segundo timón (cara izquierda, visible desde la izquierda).
Cada marcador es un número del 1-16 para identificarlo fácilmente.
"""
import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\mig-29.glb"
OUT_DIR  = r"C:\devs\f35\scripts\mig29_parts"
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

node = None
for o in meshes:
    for mat in o.data.materials:
        if mat and "airframe" in mat.name.lower() and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    node = n; break
        if node: break
    if node: break

img = node.image
TW, TH = img.size
px = list(img.pixels)

def paint_marker(cx_canvas, cy_canvas, color_r, color_g, color_b, size=22):
    """Paint a filled square at canvas coordinates (y=0 top)"""
    tx = int(cx_canvas * TW / 1024)
    ty = TH - int(cy_canvas * TH / 1024)  # flip y
    for dy in range(-size, size+1):
        for dx in range(-size, size+1):
            px_x = tx + dx; px_y = ty + dy
            if 0 <= px_x < TW and 0 <= px_y < TH:
                idx = (px_y * TW + px_x) * 4
                px[idx] = color_r; px[idx+1] = color_g; px[idx+2] = color_b; px[idx+3] = 1.0

# 16 candidate positions spanning the texture (canvas coords)
# Focus on areas away from flag A (755, 183) to explore other fin areas
candidates = [
    # Row 1: upper area
    (200, 150), (400, 150), (600, 150), (800, 150),
    # Row 2: upper-mid
    (200, 280), (400, 280), (600, 280), (800, 280),
    # Row 3: mid
    (200, 420), (400, 420), (600, 420), (800, 420),
    # Row 4: lower-mid
    (200, 560), (400, 560), (600, 560), (800, 560),
]

# Distinct bright colors for each marker
colors = [
    (1,0,0), (0,1,0), (0,0,1), (1,1,0),
    (1,0,1), (0,1,1), (1,0.5,0), (0.5,0,1),
    (0,1,0.5), (1,0,0.5), (0.5,1,0), (0,0.5,1),
    (1,1,0.5), (0.5,1,1), (1,0.5,1), (0.5,0.5,0),
]

for i, ((cx, cy), (r,g,b)) in enumerate(zip(candidates, colors)):
    paint_marker(cx, cy, r, g, b)
    print(f"Marker {i+1:2d}: canvas({cx:3d},{cy:3d}) color=({r:.1f},{g:.1f},{b:.1f})")

new_img = bpy.data.images.new("marker_tex", TW, TH, alpha=True)
new_img.pixels = px
out_tex = os.path.join(OUT_DIR, "marker_texture.png")
new_img.filepath_raw = out_tex
new_img.file_format = "PNG"
new_img.save()
node.image = new_img

# Lighting
bpy.ops.object.light_add(type="SUN", location=(0, -100, 100))
bpy.context.object.data.energy = 5

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("bg")
scene.world.use_nodes = False
scene.world.color = (0.03, 0.03, 0.06)

all_pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
min_x = min(v.x for v in all_pts); max_x = max(v.x for v in all_pts)
min_y = min(v.y for v in all_pts); max_y = max(v.y for v in all_pts)
min_z = min(v.z for v in all_pts); max_z = max(v.z for v in all_pts)
cy_m = (min_y + max_y)/2
tail_x = min_x + (max_x - min_x) * 0.15
tail_z = (min_z + max_z)/2 + (max_z - min_z)*0.4
D = (max_x - min_x) * 0.28

def render(name, cam, tgt):
    bpy.ops.object.camera_add(location=cam)
    c = bpy.context.object; scene.camera = c
    d = mathutils.Vector(tgt) - mathutils.Vector(cam)
    c.rotation_euler = d.to_track_quat("-Z","Y").to_euler()
    scene.render.filepath = os.path.join(OUT_DIR, name)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(c, do_unlink=True)
    print(f"Saved: {name}")

render("markers_right.png", (tail_x, cy_m+D*1.4, tail_z+D*0.3), (tail_x, cy_m, tail_z))
render("markers_left.png",  (tail_x, cy_m-D*1.4, tail_z+D*0.3), (tail_x, cy_m, tail_z))
print("=== DONE ===")
