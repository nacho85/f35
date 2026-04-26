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

strut = [(o, centroid(o), vol(o)) for o in nose
         if (lambda cx,cy,cz: cx > 48 and abs(cy) < 4 and cz < -4)(*centroid(o))]

print(f"Total nose: {len(nose)}, strut bucket: {len(strut)}")

strut.sort(key=lambda x: -x[2])
print("\nTop 30 por volumen en strut:")
for o,c,v in strut[:30]:
    print(f"  {o.name:30s} cx={c[0]:.1f} cy={c[1]:.2f} cz={c[2]:.2f} vol={v:.3f} nv={len(o.data.vertices)}")

zvals = sorted([c[2] for _,c,_ in strut])
print(f"\nZ range strut: {zvals[0]:.2f} .. {zvals[-1]:.2f}")
print(f"Z p25={zvals[len(zvals)//4]:.2f} p50={zvals[len(zvals)//2]:.2f} p75={zvals[3*len(zvals)//4]:.2f}")

# cx distribution
cxvals = sorted([c[0] for _,c,_ in strut])
print(f"X range strut: {cxvals[0]:.2f} .. {cxvals[-1]:.2f}")

sys.stdout.flush()
