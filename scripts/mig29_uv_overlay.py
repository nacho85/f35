"""
Genera un UV overlay del MiG-29 usando solo la API de Blender (sin Pillow).
Pinta cada mesh airframe con un color distinto sobre la textura original,
y marca con cruces donde se están pintando las banderas actualmente.
"""
import bpy, mathutils, os, struct, zlib

GLB_PATH = r"C:\devs\f35\public\mig-29.glb"
TEX_PATH = r"C:\devs\f35\public\mig29_airframe.png"
OUT_DIR  = r"C:\devs\f35\scripts\mig29_parts"
os.makedirs(OUT_DIR, exist_ok=True)

# ── Load GLB ─────────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)

bpy.ops.import_scene.gltf(filepath=GLB_PATH)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
meshes.sort(key=lambda o: o.name)

# ── Load texture into Blender Image ──────────────────────────────────────────
tex_img = bpy.data.images.load(TEX_PATH)
tex_img.pack()
W, H = tex_img.size

# Blender image pixels: flat array [R,G,B,A, R,G,B,A, ...] row 0 = BOTTOM
# Convert to mutable list
pixels = list(tex_img.pixels)  # float 0-1, RGBA, row0=bottom

def set_pixel(x, y, r, g, b, a=1.0):
    if 0 <= x < W and 0 <= y < H:
        idx = (y * W + x) * 4
        # Blend over existing
        ea = pixels[idx+3]
        pixels[idx]   = r * a + pixels[idx]   * (1-a)
        pixels[idx+1] = g * a + pixels[idx+1] * (1-a)
        pixels[idx+2] = b * a + pixels[idx+2] * (1-a)
        pixels[idx+3] = max(ea, a)

def draw_line(x0,y0,x1,y1, r,g,b,a=1.0):
    dx,dy = abs(x1-x0), abs(y1-y0)
    sx = 1 if x0<x1 else -1
    sy = 1 if y0<y1 else -1
    err = dx-dy
    while True:
        set_pixel(x0,y0,r,g,b,a)
        if x0==x1 and y0==y1: break
        e2=2*err
        if e2>-dy: err-=dy; x0+=sx
        if e2< dx: err+=dx; y0+=sy

def draw_cross(cx, cy, size, r, g, b):
    for i in range(-size, size+1):
        set_pixel(cx+i, cy, r, g, b)
        set_pixel(cx, cy+i, r, g, b)
    # Border
    for i in range(-size-1, size+2):
        set_pixel(cx+i, cy-size-1, 0,0,0)
        set_pixel(cx+i, cy+size+1, 0,0,0)
        set_pixel(cx-size-1, cy+i, 0,0,0)
        set_pixel(cx+size+1, cy+i, 0,0,0)

def draw_rect_outline(x0,y0,x1,y1, r,g,b, thickness=2):
    for t in range(thickness):
        draw_line(x0-t,y0-t, x1+t,y0-t, r,g,b)
        draw_line(x0-t,y1+t, x1+t,y1+t, r,g,b)
        draw_line(x0-t,y0-t, x0-t,y1+t, r,g,b)
        draw_line(x1+t,y0-t, x1+t,y1+t, r,g,b)

# ── Colors per airframe mesh ─────────────────────────────────────────────────
MESH_COLORS = [
    (1.0, 0.3, 0.3, 0.35),  # red
    (0.3, 1.0, 0.3, 0.35),  # green
    (0.3, 0.5, 1.0, 0.35),  # blue
    (1.0, 1.0, 0.3, 0.35),  # yellow
    (1.0, 0.3, 1.0, 0.35),  # magenta
]

airframe_meshes = []
for obj in meshes:
    if any(m and "airframe" in m.name.lower() for m in obj.data.materials):
        airframe_meshes.append(obj)

print(f"Airframe meshes: {[o.name for o in airframe_meshes]}")

# ── Paint UV islands on texture ───────────────────────────────────────────────
for ci, obj in enumerate(airframe_meshes):
    mesh = obj.data
    if not mesh.uv_layers:
        continue
    r,g,b,a = MESH_COLORS[ci % len(MESH_COLORS)]
    uv_data = mesh.uv_layers[0].data

    # Draw each polygon outline in UV space
    for poly in mesh.polygons:
        verts_px = []
        for li in poly.loop_indices:
            u, v = uv_data[li].uv
            # UV: v=0 bottom. Pixels: row0=bottom → px_y = v*H
            px = int(u * W)
            py = int(v * H)
            verts_px.append((px, py))
        # Draw polygon edges
        n = len(verts_px)
        for i in range(n):
            x0,y0 = verts_px[i]
            x1,y1 = verts_px[(i+1) % n]
            draw_line(x0,y0,x1,y1, r,g,b, 0.9)

    # Print UV bounding box
    all_us = [uv_data[li].uv[0] for f in mesh.polygons for li in f.loop_indices]
    all_vs = [uv_data[li].uv[1] for f in mesh.polygons for li in f.loop_indices]
    print(f"  {obj.name}: UV u=[{min(all_us):.3f},{max(all_us):.3f}] v=[{min(all_vs):.3f},{max(all_vs):.3f}]"
          f"  → pixel x=[{int(min(all_us)*W)},{int(max(all_us)*W)}]"
          f" y=[{int(min(all_vs)*H)},{int(max(all_vs)*H)}] (y=0 is bottom)")

# ── Mark current flag positions ───────────────────────────────────────────────
# Code uses canvas coords (y=0 top, H=1024).
# Canvas-to-pixel: px_y = H - canvas_y  (because Blender pixels row0=bottom)
FLAGS = [
    (755, 183, 55, 38, "A no-rot"),   # cx,cy,fw,fh in canvas coords
    (80,  569, 38, 55, "B rot90°"),
]
print("\nFlag marker positions (canvas→pixel):")
for (ccx, ccy, fw, fh, label) in FLAGS:
    # Canvas: y=0 top. Pixel: y=0 bottom. So pixel_y = H - canvas_y
    px_cx = int(ccx * W / 1024)
    px_cy = H - int(ccy * H / 1024)
    px_fw = int(fw * W / 1024)
    px_fh = int(fh * H / 1024)
    print(f"  {label}: canvas({ccx},{ccy}) → pixel({px_cx},{px_cy})")
    # Draw cross at center
    draw_cross(px_cx, px_cy, 16, 1.0, 0.0, 1.0)
    # Draw rect outline for flag bounds
    draw_rect_outline(px_cx-px_fw//2, px_cy-px_fh//2,
                      px_cx+px_fw//2, px_cy+px_fh//2,
                      1.0, 1.0, 0.0, thickness=2)
    # Label: burn a simple marker
    for i in range(8):
        set_pixel(px_cx+18+i, px_cy+4, 1,1,0)

# ── Save result ───────────────────────────────────────────────────────────────
out_img = bpy.data.images.new("uv_overlay", width=W, height=H, alpha=True)
out_img.pixels = pixels
out_path = os.path.join(OUT_DIR, "uv_overlay_flags.png")
out_img.filepath_raw = out_path
out_img.file_format = "PNG"
out_img.save()
print(f"\nSaved: {out_path}")
print("=== DONE ===")
