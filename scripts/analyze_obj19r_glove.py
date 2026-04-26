import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

def centroid(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    n = max(len(vs), 1)
    return sum(v.x for v in vs)/n, sum(v.y for v in vs)/n, sum(v.z for v in vs)/n

base = bpy.data.objects.get("Object_19_R_glove")
if base is None:
    print("[warn] Object_19_R_glove not found")
else:
    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True); bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    pieces = [o for o in bpy.context.scene.objects
              if o.type=="MESH" and o.name.startswith("Object_19_R_glove")]

    print(f"\nObject_19_R_glove: {len(pieces)} piezas\n")
    print(f"{'cx':>8}  {'cy':>8}  {'cz':>8}  {'verts':>6}")
    for p in sorted(pieces, key=lambda o: centroid(o)[0]):
        cx, cy, cz = centroid(p)
        print(f"{cx:>8.3f}  {cy:>8.3f}  {cz:>8.3f}  {len(p.data.vertices):>6}")
