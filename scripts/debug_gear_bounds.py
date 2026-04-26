import bpy
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\F-14-iran.glb")

NAMES = ["Object_9", "Object_23", "Object_10_C", "Object_14_C"]

for name in NAMES:
    obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == name), None)
    if not obj:
        print(f"{name}: NOT FOUND"); continue
    M = obj.matrix_world
    mn = Vector((float('inf'),)*3)
    mx = Vector((float('-inf'),)*3)
    for v in obj.data.vertices:
        w = M @ v.co
        mn.x = min(mn.x, w.x); mn.y = min(mn.y, w.y); mn.z = min(mn.z, w.z)
        mx.x = max(mx.x, w.x); mx.y = max(mx.y, w.y); mx.z = max(mx.z, w.z)
    # Three.js: x=Bx, y=Bz, z=-By
    print(f"{name}: verts={len(obj.data.vertices)}")
    print(f"  Blender  y=[{mn.y:.2f},{mx.y:.2f}]  z=[{mn.z:.2f},{mx.z:.2f}]")
    print(f"  Three.js z=[{-mx.y:.2f},{-mn.y:.2f}]  y=[{mn.z:.2f},{mx.z:.2f}]")
