import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

for name in ["Object_27", "Object_28"]:
    obj = bpy.data.objects.get(name)
    if obj is None:
        print(f"[warn] {name} not found"); continue

    pivot_world = obj.matrix_world.translation
    print(f"\n{name}")
    print(f"  pivot world: x={pivot_world.x:.3f}  y={pivot_world.y:.3f}  z={pivot_world.z:.3f}")

    verts_world = [obj.matrix_world @ v.co for v in obj.data.vertices]
    xs = [v.x for v in verts_world]
    ys = [v.y for v in verts_world]
    print(f"  verts X range: {min(xs):.3f} → {max(xs):.3f}")
    print(f"  verts Y range: {min(ys):.3f} → {max(ys):.3f}")

    # Local space X range (negative = inward of pivot)
    xs_local = [v.co.x for v in obj.data.vertices]
    print(f"  local X range: {min(xs_local):.3f} → {max(xs_local):.3f}")
    n_inward = sum(1 for x in xs_local if x < 0)
    print(f"  verts inward of pivot (local X < 0): {n_inward} / {len(xs_local)}")
