import bpy, bmesh
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\F-14-iran-v4.glb")
pivot = next(o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_NosePivot")
M = pivot.matrix_world
print(f"NosePivot: {len(pivot.data.vertices)} verts")
verts = []
for v in pivot.data.vertices:
    w = M @ v.co
    verts.append((w.x, w.z, -w.y))  # Three.js tx, ty, tz
verts.sort(key=lambda v: (round(v[0],2), round(v[1],2)))
print(f"{'tx':>7}  {'ty':>7}  {'tz':>7}")
for tx, ty, tz in verts:
    print(f"{tx:>7.3f}  {ty:>7.3f}  {tz:>7.3f}")
