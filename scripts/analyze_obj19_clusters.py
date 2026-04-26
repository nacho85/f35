import bpy, mathutils

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

def centroid(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    n = max(len(vs), 1)
    return sum(v.x for v in vs)/n, sum(v.y for v in vs)/n

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

    # Group by rounded Y centroid (0.5 bins)
    bins = {}
    for p in pieces:
        cx, cy = centroid(p)
        b = round(cy * 2) / 2
        if b not in bins: bins[b] = []
        bins[b].append((cx, cy, len(p.data.vertices)))

    print(f"\n{base_name}: {len(pieces)} pieces, {len(bins)} Y-clusters:")
    for y_bin in sorted(bins.keys()):
        group = bins[y_bin]
        avg_cx = sum(x for x,y,v in group)/len(group)
        total_verts = sum(v for x,y,v in group)
        print(f"  Y≈{y_bin:>5.1f}  pieces={len(group):>3}  avg_cx={avg_cx:>7.2f}  verts={total_verts:>5}")
