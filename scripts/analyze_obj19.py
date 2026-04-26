import bpy, mathutils

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

def centroid(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    n = max(len(vs), 1)
    return sum(v.x for v in vs)/n, sum(v.y for v in vs)/n, sum(v.z for v in vs)/n

for base_name in ["Object_19_R", "Object_19_L"]:
    base = bpy.data.objects.get(base_name)
    if base is None: print(f"[warn] {base_name} not found"); continue

    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True); bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    pieces = [o for o in bpy.context.scene.objects
              if o.type=="MESH" and o.name.startswith(base_name)]
    print(f"\n{base_name}: {len(pieces)} loose pieces")
    for p in sorted(pieces, key=lambda o: centroid(o)[0]):
        cx, cy, cz = centroid(p)
        print(f"  cx={cx:>7.2f}  cy={cy:>6.2f}  cz={cz:>5.2f}  verts={len(p.data.vertices):>5}  {p.name}")
