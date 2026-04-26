import bpy, mathutils, sys

GLB = r"C:\devs\f35\public\mig-29-iran.glb"
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB)

obj14 = bpy.data.objects.get("Object_14")
mw = obj14.matrix_world

for o in bpy.data.objects: o.hide_set(o != obj14)
bpy.context.view_layer.objects.active = obj14
bpy.ops.object.select_all(action="DESELECT"); obj14.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.hide_set(False)

parts = [o for o in bpy.data.objects
         if o.type=="MESH" and (o.name=="Object_14" or o.name.startswith("Object_14."))]
print(f"\nObject_14 loose parts: {len(parts)}")
for o in sorted(parts, key=lambda o: -len(o.data.vertices))[:30]:
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
    cx=sum(xs)/8; cy=sum(ys)/8; cz=sum(zs)/8
    vol=(max(xs)-min(xs))*(max(ys)-min(ys))*(max(zs)-min(zs))
    print(f"  cx={cx:6.1f} cy={cy:6.1f} cz={cz:6.1f} vol={vol:7.0f} nverts={len(o.data.vertices):5d}  {o.name}")
sys.stdout.flush()
