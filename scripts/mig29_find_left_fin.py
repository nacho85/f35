"""
Búsqueda más granular del UV del timón izquierdo (visible desde izquierda).
Prueba una grilla de 6x5=30 posiciones en el cuadrante superior y zonas no cubiertas.
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

def paint_marker(cx, cy, r, g, b, size=18):
    tx = int(cx * TW / 1024)
    ty = TH - int(cy * TH / 1024)
    for dy in range(-size, size+1):
        for dx in range(-size, size+1):
            nx_, ny_ = tx+dx, ty+dy
            if 0 <= nx_ < TW and 0 <= ny_ < TH:
                idx = (ny_*TW + nx_)*4
                px[idx]=r; px[idx+1]=g; px[idx+2]=b; px[idx+3]=1.0

# New search area: top strip (canvas y=50-150), plus left edge, plus bottom strip
candidates = [
    # Top strip (canvas y~100): x from 100 to 950
    ( 100, 100), ( 200, 100), ( 300, 100), ( 400, 100), ( 500, 100),
    ( 600, 100), ( 700, 100), ( 800, 100), ( 900, 100), ( 950, 100),
    # Second row (canvas y~200): left side
    (  50, 200), ( 150, 200), ( 250, 200), ( 350, 200), ( 450, 200),
    # Bottom strip (canvas y~700-900)
    ( 200, 700), ( 400, 700), ( 600, 700), ( 800, 700),
    ( 200, 850), ( 400, 850), ( 600, 850), ( 800, 850),
    # Right edge
    ( 920, 300), ( 920, 450), ( 950, 600),
    # Far left
    (  30, 350), (  30, 500), (  30, 650),
    # Extra at known-good area offset
    ( 640, 183), ( 700, 183),
]

colors = [
    (1,0,0),(0,1,0),(0,0,1),(1,1,0),(1,0,1),(0,1,1),(1,.5,0),(.5,0,1),(0,1,.5),(1,0,.5),
    (.5,1,0),(0,.5,1),(1,1,.5),(.5,1,1),(1,.5,1),(.2,.8,.4),(.8,.2,.4),(.4,.2,.8),
    (.8,.8,0),(0,.8,.8),(.8,0,.8),(.4,.8,.2),(.2,.4,.8),(.8,.4,.2),
    (1,.2,.2),(.2,1,.2),(.2,.2,1),(.8,.6,0),(0,.6,.8),(.6,0,.8),
]

for i, ((cx,cy),(r,g,b)) in enumerate(zip(candidates,colors)):
    paint_marker(cx, cy, r, g, b)
    print(f"M{i+1:2d}: canvas({cx:3d},{cy:3d})")

new_img = bpy.data.images.new("search_tex", TW, TH, alpha=True)
new_img.pixels = px
out = os.path.join(OUT_DIR, "search_texture.png")
new_img.filepath_raw = out; new_img.file_format = "PNG"; new_img.save()
node.image = new_img
print(f"Texture saved.")

bpy.ops.object.light_add(type="SUN", location=(0, -80, 100))
bpy.context.object.data.energy = 5

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280; scene.render.resolution_y = 720
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("bg"); scene.world.use_nodes = False
scene.world.color = (0.03,0.03,0.06)

all_pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
min_x=min(v.x for v in all_pts); max_x=max(v.x for v in all_pts)
min_y=min(v.y for v in all_pts); max_y=max(v.y for v in all_pts)
min_z=min(v.z for v in all_pts); max_z=max(v.z for v in all_pts)
cy_m=(min_y+max_y)/2; tail_x=min_x+(max_x-min_x)*0.15
tail_z=(min_z+max_z)/2+(max_z-min_z)*0.4; D=(max_x-min_x)*0.28

def render(name, cam, tgt):
    bpy.ops.object.camera_add(location=cam); c=bpy.context.object; scene.camera=c
    d=mathutils.Vector(tgt)-mathutils.Vector(cam)
    c.rotation_euler=d.to_track_quat("-Z","Y").to_euler()
    scene.render.filepath=os.path.join(OUT_DIR,name)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(c,do_unlink=True); print(f"Saved: {name}")

render("search_left.png",  (tail_x,cy_m-D*1.4,tail_z+D*0.3),(tail_x,cy_m,tail_z))
render("search_right.png", (tail_x,cy_m+D*1.4,tail_z+D*0.3),(tail_x,cy_m,tail_z))
print("=== DONE ===")
