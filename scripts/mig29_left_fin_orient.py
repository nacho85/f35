"""
Prueba las 4 rotaciones del flag en canvas(200, 100) - cara izquierda del timón.
También pinta con flipH para encontrar la combinación correcta (verde arriba).
"""
import bpy, mathutils, os, math

GLB_PATH  = r"C:\devs\f35\public\mig-29.glb"
FLAG_PATH = r"C:\devs\f35\public\iranian_flag.png"
OUT_DIR   = r"C:\devs\f35\scripts\mig29_parts"
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

img = node.image; TW, TH = img.size; tex_px = list(img.pixels)
flag_img = bpy.data.images.load(FLAG_PATH); flag_img.pack()
FW, FH = flag_img.size; flag_px = list(flag_img.pixels)

def gfp(fx, fy):
    if 0<=fx<FW and 0<=fy<FH:
        i=(fy*FW+fx)*4; return flag_px[i],flag_px[i+1],flag_px[i+2],flag_px[i+3]
    return 0,0,0,0

def stamp(tex_cx, tex_cy, sw, sh, rot_deg=0, flip_h=False):
    ang=math.radians(-rot_deg); ca,sa=math.cos(ang),math.sin(ang)
    for dy in range(-sh//2, sh//2+1):
        for dx in range(-sw//2, sw//2+1):
            nx=(dx+.5)/sw; ny=(dy+.5)/sh
            sx_=nx*ca+ny*sa; sy_=-nx*sa+ny*ca
            if flip_h: sx_=-sx_
            fx=int((sx_+.5)*FW); fy=int((sy_+.5)*FH)
            r,g,b,a=gfp(fx,fy)
            if a>.05:
                tx,ty=tex_cx+dx,tex_cy+dy
                if 0<=tx<TW and 0<=ty<TH:
                    i=(ty*TW+tx)*4; tex_px[i]=r; tex_px[i+1]=g; tex_px[i+2]=b; tex_px[i+3]=1.

sx=TW/1024; sy_=TH/1024
fw=int(55*sx); fh=int(38*sy_)

# Left fin: canvas(200, 100) → tex coords
B2_cx=int(200*sx); B2_cy=TH-int(100*sy_)
print(f"Left fin position: canvas(200,100) → tex({B2_cx},{B2_cy})")
print(f"Flag size: {fw}x{fh}")

# Test 4 rotations at slightly different V offsets so they don't overlap
# All at canvas x=200, y varies by ±60 to spread them on the fin face
variants = [
    (B2_cx, B2_cy+60,  fw, fh,   0, False, "rot0_noflip"),
    (B2_cx, B2_cy+20,  fw, fh,   0, True,  "rot0_flipH"),
    (B2_cx, B2_cy-20,  fw, fh,  90, False, "rot90_noflip"),
    (B2_cx, B2_cy-60,  fw, fh,  90, True,  "rot90_flipH"),
]
for v in variants:
    cx,cy,w,h,rot,flh,lbl = v
    stamp(cx,cy,w,h,rot,flh)
    print(f"  {lbl}: tex({cx},{cy})")

# Also apply confirmed flag A for reference
A_cx=int(755*sx); A_cy=TH-int(183*sy_); A_fw=int(55*sx); A_fh=int(38*sy_)
stamp(A_cx, A_cy, A_fw, A_fh, 0, True)
print(f"  Flag A (confirmed): tex({A_cx},{A_cy})")

new_img=bpy.data.images.new("orient_tex",TW,TH,alpha=True); new_img.pixels=tex_px
out=os.path.join(OUT_DIR,"orient_texture.png")
new_img.filepath_raw=out; new_img.file_format="PNG"; new_img.save()
node.image=new_img; print(f"Saved: {out}")

bpy.ops.object.light_add(type="SUN",location=(0,-80,100)); bpy.context.object.data.energy=5
bpy.ops.object.light_add(type="SUN",location=(80,0,80)); bpy.context.object.data.energy=2

scene=bpy.context.scene; scene.render.engine="BLENDER_EEVEE"
scene.render.resolution_x=1280; scene.render.resolution_y=720
scene.render.image_settings.file_format="PNG"
scene.world=bpy.data.worlds.new("bg"); scene.world.use_nodes=False
scene.world.color=(0.03,0.03,0.06)

all_pts=[o.matrix_world@mathutils.Vector(c) for o in meshes for c in o.bound_box]
min_x=min(v.x for v in all_pts); max_x=max(v.x for v in all_pts)
min_y=min(v.y for v in all_pts); max_y=max(v.y for v in all_pts)
min_z=min(v.z for v in all_pts); max_z=max(v.z for v in all_pts)
cy_m=(min_y+max_y)/2; tail_x=min_x+(max_x-min_x)*0.15
tail_z=(min_z+max_z)/2+(max_z-min_z)*0.4; D=(max_x-min_x)*0.28

def render(name,cam,tgt):
    bpy.ops.object.camera_add(location=cam); c=bpy.context.object; scene.camera=c
    d=mathutils.Vector(tgt)-mathutils.Vector(cam)
    c.rotation_euler=d.to_track_quat("-Z","Y").to_euler()
    scene.render.filepath=os.path.join(OUT_DIR,name)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(c,do_unlink=True); print(f"Saved: {name}")

render("orient_left.png",  (tail_x,cy_m-D*1.4,tail_z+D*0.3),(tail_x,cy_m,tail_z))
render("orient_right.png", (tail_x,cy_m+D*1.4,tail_z+D*0.3),(tail_x,cy_m,tail_z))
print("=== DONE ===")
