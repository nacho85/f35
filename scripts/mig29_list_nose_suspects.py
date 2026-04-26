import bpy, mathutils, sys
GLB_IN = r"C:\devs\f35\public\mig-29-iran.glb"
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)
obj16 = bpy.data.objects.get("Object_16")
for o in bpy.data.objects: o.hide_set(o != obj16)
bpy.context.view_layer.objects.active = obj16
bpy.ops.object.select_all(action="DESELECT"); obj16.select_set(True)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE"); bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.hide_set(False)
parts = [o for o in bpy.data.objects if o.type=="MESH" and (o.name=="Object_16" or o.name.startswith("Object_16."))]
suspects = []
for o in parts:
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    cx=sum(v.x for v in bb)/8; cy=sum(v.y for v in bb)/8; cz=sum(v.z for v in bb)/8
    if 40 < cx < 52 and abs(cy) > 1.5 and -6 < cz < 0:
        xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
        vol=(max(xs)-min(xs))*(max(ys)-min(ys))*(max(zs)-min(zs))
        suspects.append((cx,cy,cz,vol,o.name))
suspects.sort(key=lambda x: x[1])
print(f"\n{len(suspects)} piezas en zona X=40-52, |Y|>1.5, Z=-6..0:")
print(f"{'cx':>7} {'cy':>7} {'cz':>7} {'vol':>8}  nombre")
for cx,cy,cz,vol,n in suspects:
    print(f"{cx:7.2f} {cy:7.2f} {cz:7.2f} {vol:8.3f}  {n}")
sys.stdout.flush()
