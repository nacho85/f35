"""
Identifica las colas verticales del MiG-29 y muestra sus UV coordinates.
Genera:
  1. Renders de la cola (top, side, rear, persp) con cada mesh coloreado
  2. UV layout superpuesto sobre la textura airframe con las posiciones actuales de las banderas marcadas
"""
import bpy, mathutils, math, os, sys
import numpy as np

GLB_PATH     = r"C:\devs\f35\public\mig-29.glb"
TEX_PATH     = r"C:\devs\f35\public\mig29_airframe.png"
OUT_DIR      = r"C:\devs\f35\scripts\mig29_parts"
os.makedirs(OUT_DIR, exist_ok=True)

# ── 1. Clean scene ──────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)

# ── 2. Import GLB ───────────────────────────────────────────────────────────
bpy.ops.import_scene.gltf(filepath=GLB_PATH)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
meshes.sort(key=lambda o: o.name)

print(f"\n=== MIG-29 MESHES ({len(meshes)}) ===")
for o in meshes:
    mats = [m.name if m else "None" for m in o.data.materials]
    print(f"  {o.name:20s}  mats={mats}  dims=({o.dimensions.x:.2f},{o.dimensions.y:.2f},{o.dimensions.z:.2f})")

# ── 3. Identify tail fin meshes (heuristic: narrow, tall, rear of aircraft) ─
# MiG-29 tail fins are vertical stabilizers at the rear.
# In Blender GLTF (Y-forward, Z-up), rear = max Y, vertical = tall in Z
all_verts_world = []
for obj in meshes:
    for c in obj.bound_box:
        all_verts_world.append(obj.matrix_world @ mathutils.Vector(c))

min_v = mathutils.Vector((min(v.x for v in all_verts_world),
                           min(v.y for v in all_verts_world),
                           min(v.z for v in all_verts_world)))
max_v = mathutils.Vector((max(v.x for v in all_verts_world),
                           max(v.y for v in all_verts_world),
                           max(v.z for v in all_verts_world)))
center = (min_v + max_v) / 2
size   = (max_v - min_v).length

print(f"\nModel bounds: min={min_v[:]}, max={max_v[:]}")
print(f"Center: {center[:]}, Size: {size:.2f}")

# ── 4. Dump UV coordinates for airframe material meshes ─────────────────────
print("\n=== UV BOUNDS PER MESH (airframe material) ===")
airframe_meshes = []
for obj in meshes:
    has_airframe = any(m and "airframe" in m.name.lower() for m in obj.data.materials)
    if not has_airframe:
        continue
    airframe_meshes.append(obj)
    mesh = obj.data
    if not mesh.uv_layers:
        print(f"  {obj.name}: NO UV LAYER")
        continue
    uvs = [uv.uv[:] for uv in mesh.uv_layers[0].data]
    if not uvs:
        print(f"  {obj.name}: EMPTY UV")
        continue
    us = [u[0] for u in uvs]
    vs = [u[1] for u in uvs]
    world_verts = [obj.matrix_world @ mesh.vertices[l.vertex_index].co for l in mesh.loops]
    ys = [v.y for v in world_verts]
    zs = [v.z for v in world_verts]
    print(f"  {obj.name:20s}  UV u=[{min(us):.3f},{max(us):.3f}] v=[{min(vs):.3f},{max(vs):.3f}]"
          f"  world_y=[{min(ys):.2f},{max(ys):.2f}] world_z=[{min(zs):.2f},{max(zs):.2f}]")

# ── 5. Render colored parts ──────────────────────────────────────────────────
def hsv_color(i, n):
    h = i / max(n, 1)
    c = mathutils.Color()
    c.hsv = (h, 0.9, 1.0)
    return (c.r, c.g, c.b, 1.0)

for i, obj in enumerate(meshes):
    color = hsv_color(i, len(meshes))
    mat = bpy.data.materials.new(name=f"part_{i}")
    mat.use_nodes = False
    mat.diffuse_color = color
    obj.data.materials.clear()
    obj.data.materials.append(mat)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("bg")
scene.world.use_nodes = False
scene.world.color = (0.05, 0.05, 0.08)

bpy.ops.object.light_add(type="SUN", location=(0, 0, 50))
sun = bpy.context.object
sun.data.energy = 3

C = center
D = size * 1.4

def render_view(name, location, point_at):
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.object
    scene.camera = cam
    direction = mathutils.Vector(point_at) - mathutils.Vector(location)
    rot_quat  = direction.to_track_quat("-Z", "Y")
    cam.rotation_euler = rot_quat.to_euler()
    scene.render.filepath = os.path.join(OUT_DIR, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)

# Tail view: from the rear (+Y direction) looking forward (-Y)
render_view("rear",  (C.x,       C.y + D,    C.z + D*0.3), C[:])
render_view("top",   (C.x,       C.y,        C.z + D*1.1), C[:])
render_view("side_R",(C.x + D,   C.y,        C.z + D*0.3), C[:])
render_view("persp", (C.x + D*0.5, C.y + D*0.8, C.z + D*0.5), C[:])

# ── 6. UV overlay image: paint UV shells on texture ─────────────────────────
try:
    from PIL import Image, ImageDraw, ImageFont
    tex_img = Image.open(TEX_PATH).convert("RGBA")
    W, H = tex_img.size
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    colors_uv = [
        (255, 80, 80),
        (80, 255, 80),
        (80, 80, 255),
        (255, 255, 80),
        (255, 80, 255),
        (80, 255, 255),
        (255, 160, 80),
    ]

    # Re-import to get original UV data (colors were changed, but UV is in mesh data)
    for i, obj in enumerate(airframe_meshes):
        mesh = obj.data
        if not mesh.uv_layers:
            continue
        uvs = [uv.uv[:] for uv in mesh.uv_layers[0].data]
        color = colors_uv[i % len(colors_uv)] + (180,)
        # Draw each UV triangle
        loops_per_poly = [len(p.loop_indices) for p in mesh.polygons]
        idx = 0
        for poly in mesh.polygons:
            verts_uv = []
            for li in poly.loop_indices:
                u, v = mesh.uv_layers[0].data[li].uv
                # UV v=0 is bottom, but PIL y=0 is top → flip v
                px = int(u * W)
                py = int((1.0 - v) * H)
                verts_uv.append((px, py))
            if len(verts_uv) >= 3:
                draw.polygon(verts_uv, outline=color[:3] + (255,), fill=color)

    # Mark current flag positions (from Mig29.jsx)
    # Flag coords in 1024 space: (755,183) and (80,569) — these are CANVAS coords (y=0 at top)
    FLAG_POSITIONS = [
        (755, 183, "bandera A (actual)"),
        (80,  569, "bandera B rotada (actual)"),
    ]
    for (fx, fy, label) in FLAG_POSITIONS:
        x = int(fx * W / 1024)
        y = int(fy * H / 1024)
        r = 12
        draw.ellipse([(x-r, y-r), (x+r, y+r)], fill=(255, 0, 255, 255), outline=(255, 255, 0, 255))
        draw.text((x+r+4, y-8), label, fill=(255, 255, 0, 255))

    result = Image.alpha_composite(tex_img, overlay)
    out_path = os.path.join(OUT_DIR, "uv_overlay_flags.png")
    result.save(out_path)
    print(f"\nUV overlay saved: {out_path}")
except ImportError:
    print("\nPillow not available — skipping UV overlay image")

print("\n=== DONE ===")
