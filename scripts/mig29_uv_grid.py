"""
Pinta una grilla de colores sobre la textura completa del MiG-29
para mapear visualmente qué región UV corresponde a qué parte del modelo.
Cada celda de la grilla tiene un color único.
"""
import bpy, mathutils, os, math

GLB_PATH = r"C:\devs\f35\public\mig-29.glb"
OUT_DIR  = r"C:\devs\f35\scripts\mig29_parts"
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

# Find airframe texture
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

# Grid: 16x16 cells, each cell a distinct color
GRID = 16
CW = TW // GRID
CH = TH // GRID

def hsv_to_rgb(h, s, v):
    if s == 0: return v, v, v
    i = int(h * 6)
    f = h * 6 - i
    p, q, t = v*(1-s), v*(1-s*f), v*(1-s*(1-f))
    return [(v,t,p),(q,v,p),(p,v,t),(p,q,v),(t,p,v),(v,p,q)][i%6]

# Paint each cell with its grid color (semi-transparent)
for gy in range(GRID):
    for gx in range(GRID):
        cell_idx = gy * GRID + gx
        h = cell_idx / (GRID * GRID)
        r, g, b = hsv_to_rgb(h, 0.85, 0.95)
        # Draw a filled square for this cell, with thin border
        for dy in range(CH):
            for dx in range(CW):
                tx = gx * CW + dx
                ty = gy * CH + dy
                if 0 <= tx < TW and 0 <= ty < TH:
                    # Border pixels: draw opaque border, fill translucent
                    is_border = dx < 2 or dx >= CW-2 or dy < 2 or dy >= CH-2
                    alpha = 1.0 if is_border else 0.55
                    idx = (ty * TW + tx) * 4
                    px[idx]   = r * alpha + px[idx]   * (1-alpha)
                    px[idx+1] = g * alpha + px[idx+1] * (1-alpha)
                    px[idx+2] = b * alpha + px[idx+2] * (1-alpha)
                    px[idx+3] = 1.0

# Also draw cell coordinate text by coloring specific pixels in a cross pattern
# Just mark cell centers with a white dot for reference
for gy in range(GRID):
    for gx in range(GRID):
        cx = gx * CW + CW // 2
        cy = gy * CH + CH // 2
        for d in range(-3, 4):
            for tx, ty in [(cx+d, cy), (cx, cy+d)]:
                if 0 <= tx < TW and 0 <= ty < TH:
                    idx = (ty * TW + tx) * 4
                    px[idx], px[idx+1], px[idx+2], px[idx+3] = 1.0, 1.0, 1.0, 1.0

# Save and apply
new_img = bpy.data.images.new("grid_tex", TW, TH, alpha=True)
new_img.pixels = px
out_tex = os.path.join(OUT_DIR, "grid_texture.png")
new_img.filepath_raw = out_tex
new_img.file_format = "PNG"
new_img.save()
node.image = new_img
print(f"Grid texture saved: {out_tex}")

# Lighting
bpy.ops.object.light_add(type="SUN", location=(0, -100, 100))
bpy.context.object.data.energy = 5
bpy.ops.object.light_add(type="SUN", location=(100, 0, 80))
bpy.context.object.data.energy = 2

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
cy_m = (min_y + max_y) / 2
tail_x = min_x + (max_x - min_x) * 0.15
tail_z = (min_z + max_z) / 2 + (max_z - min_z) * 0.4
D = (max_x - min_x) * 0.30

def render(name, cam_loc, target):
    bpy.ops.object.camera_add(location=cam_loc)
    cam = bpy.context.object
    scene.camera = cam
    d = mathutils.Vector(target) - mathutils.Vector(cam_loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT_DIR, name)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print(f"Saved: {name}")

render("grid_right.png", (tail_x, cy_m + D*1.4, tail_z + D*0.3), (tail_x, cy_m, tail_z))
render("grid_left.png",  (tail_x, cy_m - D*1.4, tail_z + D*0.3), (tail_x, cy_m, tail_z))
render("grid_rear.png",  (tail_x - D*0.5, cy_m, tail_z + D*0.5), (tail_x, cy_m, tail_z))

print("=== DONE ===")
