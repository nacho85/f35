import bpy, mathutils, sys

GLB_IN = r"C:\devs\f35\public\mig-29-iran.glb"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj16 = bpy.data.objects.get("Object_16")
for o in bpy.data.objects: o.hide_set(o != obj16)
bpy.context.view_layer.objects.active = obj16
bpy.ops.object.select_all(action="DESELECT")
obj16.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.hide_set(False)

all_parts = [o for o in bpy.data.objects
             if o.type == "MESH" and (o.name == "Object_16" or o.name.startswith("Object_16."))]

def bbox(o):
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
    return min(xs),max(xs), min(ys),max(ys), min(zs),max(zs)
def centroid(o):
    x0,x1,y0,y1,z0,z1 = bbox(o)
    return (x0+x1)/2, (y0+y1)/2, (z0+z1)/2
def vol(o):
    x0,x1,y0,y1,z0,z1 = bbox(o)
    return (x1-x0)*(y1-y0)*(z1-z0)

nose = [o for o in all_parts
        if (lambda cx,cy,cz: 30 < cx < 70 and abs(cy) < 8 and cz < 0)(*centroid(o))]

# Zona compuerta_pequena amplia para listar candidatos
candidates = []
for o in nose:
    cx,cy,cz = centroid(o)
    if cx > 58 and abs(cy) < 2.5 and cz > -8:
        x0,x1,y0,y1,z0,z1 = bbox(o)
        dx=x1-x0; dy=y1-y0; dz=z1-z0
        candidates.append((o.name, cx, cy, cz, vol(o), len(o.data.vertices), dx, dy, dz))

candidates.sort(key=lambda r: r[1])  # sort by cx
print(f"\n{'NAME':30s} {'cx':5s} {'cy':6s} {'cz':6s} {'vol':7s} {'nv':4s} {'dx':5s} {'dy':5s} {'dz':5s}")
for name,cx,cy,cz,v,nv,dx,dy,dz in candidates:
    print(f"{name:30s} {cx:5.1f} {cy:6.2f} {cz:6.2f} {v:7.3f} {nv:4d} {dx:5.2f} {dy:5.2f} {dz:5.2f}")

sys.stdout.flush()
