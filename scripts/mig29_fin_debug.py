"""
Tail-fin axis diagnostic.
Paints the tail_L island with horizontal stripes every 30px in Y (red=top, blue=bottom)
and vertical stripes every 20px in X (green ticks at island edges).
Same for tail_R. Shows exactly which UV direction = fin height in 3D.
"""
import bpy
import numpy as np
from collections import deque

MIG_IN  = r"C:\devs\f35\public\mig-29.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-debug.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=MIG_IN)

tex_node = None
for o in bpy.context.scene.objects:
    if o.type != "MESH": continue
    for mat in o.data.materials:
        if not mat or not mat.use_nodes: continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and "airframe" in mat.name.lower():
                tex_node = node; break
        if tex_node: break
    if tex_node: break

orig = tex_node.image
TW, TH = orig.size

# Rasterise Object_4 UV mask
mask = np.zeros((TH, TW), dtype=np.uint8)
obj4 = next(o for o in bpy.context.scene.objects if o.type=="MESH" and o.name=="Object_4")
mesh = obj4.data
uv_layer = mesh.uv_layers.active.data

def fill_tri(mask, p0, p1, p2):
    xs=[p0[0],p1[0],p2[0]]; ys=[p0[1],p1[1],p2[1]]
    x0=max(0,min(xs)); x1=min(TW-1,max(xs))
    y0=max(0,min(ys)); y1=min(TH-1,max(ys))
    if x0>=x1 or y0>=y1: return
    gx=np.arange(x0,x1+1,dtype=np.float32); gy=np.arange(y0,y1+1,dtype=np.float32)
    GX,GY=np.meshgrid(gx,gy)
    def s(ax,ay,bx,by,cx,cy): return (ax-cx)*(by-cy)-(bx-cx)*(ay-cy)
    d1=s(GX,GY,p0[0],p0[1],p1[0],p1[1]); d2=s(GX,GY,p1[0],p1[1],p2[0],p2[1]); d3=s(GX,GY,p2[0],p2[1],p0[0],p0[1])
    inside=~((d1<0)|(d2<0)|(d3<0)) & ~((d1>0)|(d2>0)|(d3>0)); inside=~(((d1<0)|(d2<0)|(d3<0))&((d1>0)|(d2>0)|(d3>0)))
    r=(GY[inside]-y0).astype(int); c=(GX[inside]-x0).astype(int)
    mask[y0:y1+1,x0:x1+1][r,c]=1

for poly in mesh.polygons:
    loops=list(poly.loop_indices)
    uv0=uv_layer[loops[0]].uv; p0=(int(uv0[0]*TW),int((1-uv0[1])*TH))
    for i in range(1,len(loops)-1):
        uv1=uv_layer[loops[i]].uv; uv2=uv_layer[loops[i+1]].uv
        p1=(int(uv1[0]*TW),int((1-uv1[1])*TH)); p2=(int(uv2[0]*TW),int((1-uv2[1])*TH))
        fill_tri(mask,p0,p1,p2)

# Flood-fill each island
visited = np.zeros((TH,TW),dtype=np.uint8)

def flood(cx,cy):
    if not(0<=cx<TW and 0<=cy<TH) or mask[cy,cx]==0: return []
    q=deque([(cx,cy)]); visited[cy,cx]=1; pts=[]
    while q:
        x,y=q.popleft(); pts.append((x,y))
        for dx,dy in[(-1,0),(1,0),(0,-1),(0,1)]:
            nx,ny=x+dx,y+dy
            if 0<=nx<TW and 0<=ny<TH and mask[ny,nx]==1 and visited[ny,nx]==0:
                visited[ny,nx]=1; q.append((nx,ny))
    return pts

sx=TW/1024; sy=TH/1024

tail_L_pts = flood(int(754*sx), int(183*sy))
tail_R_pts = flood(int(78*sx),  int(568*sy))

print(f"tail_L pixels: {len(tail_L_pts)}")
print(f"tail_R pixels: {len(tail_R_pts)}")

# Build gradient texture (start from white)
px = np.ones((TH,TW,4),dtype=np.float32)

def paint_gradient(pts, island_label):
    if not pts: return
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    x0,x1=min(xs),max(xs); y0,y1=min(ys),max(ys)
    print(f"{island_label}: x {int(x0/sx)}-{int(x1/sx)} ({int((x1-x0)/sx)}w)  "
          f"y {int(y0/sy)}-{int(y1/sy)} ({int((y1-y0)/sy)}h)")

    STRIPE_Y = 30  # px in 1024-space → actual pixels
    STRIPE_X = 20

    stripe_y_px = max(1, int(STRIPE_Y * sy))
    stripe_x_px = max(1, int(STRIPE_X * sx))

    # Y-stripes: alternating warm/cool bands (tells us fin height direction)
    colors_y = [
        [1.0, 0.0, 0.0],  # red   → y low (near top of texture)
        [1.0, 0.5, 0.0],  # orange
        [1.0, 1.0, 0.0],  # yellow
        [0.0, 0.8, 0.0],  # green
        [0.0, 0.8, 1.0],  # cyan
        [0.0, 0.0, 1.0],  # blue
        [0.5, 0.0, 1.0],  # purple → y high (near bottom of texture)
        [1.0, 0.0, 1.0],  # magenta
        [0.5, 0.5, 0.5],  # grey
        [0.2, 0.2, 0.2],  # dark grey
    ]

    pt_set = set(pts)
    for (x, y) in pts:
        band = (y - y0) // stripe_y_px
        col  = colors_y[band % len(colors_y)]
        px[y, x] = [*col, 1.0]

    # Overlay thin black/white vertical lines every STRIPE_X in X
    for (x, y) in pts:
        band_x = (x - x0) // stripe_x_px
        if (x - x0) % stripe_x_px == 0:
            px[y, x] = [0.0, 0.0, 0.0, 1.0]  # black tick

    # Mark island boundary
    for (x,y) in pts:
        is_edge = any((x+dx,y+dy) not in pt_set
                      for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)])
        if is_edge:
            px[y,x] = [1.0, 1.0, 1.0, 1.0]

    # Mark star seed with black square
    pass

paint_gradient(tail_L_pts, "tail_L")
paint_gradient(tail_R_pts, "tail_R")

# Mark star positions (black 6x6 square)
for (sx_,sy_) in [(754,183),(78,568)]:
    cx=int(sx_*sx); cy=int(sy_*sy)
    for dy in range(-5,6):
        for dx in range(-5,6):
            nx,ny=cx+dx,cy+dy
            if 0<=nx<TW and 0<=ny<TH:
                px[ny,nx]=[0,0,0,1.0]

px_out=np.flipud(px).flatten().tolist()
new_img=bpy.data.images.new("fin_debug",TW,TH,alpha=True)
new_img.pixels=px_out
tex_node.image=new_img

bpy.ops.export_scene.gltf(filepath=GLB_OUT,export_format='GLB',export_image_format='AUTO')
print(f"✓ {GLB_OUT}")
