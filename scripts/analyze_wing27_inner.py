import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

SWEEP_MAX = math.radians(48)

obj = bpy.data.objects.get("Object_27")
pivot = obj.matrix_world.translation.copy()
print(f"Object_27 pivot world: x={pivot.x:.3f}  y={pivot.y:.3f}")

# Vertices in LOCAL space (pivot = origin)
local_verts = [v.co.copy() for v in obj.data.vertices]  # local coords

# Find inner edge vertices (local X ~ 0, within 0.05)
inner = [v for v in local_verts if v.x < 0.05]
print(f"\nInner edge verts (local X < 0.05): {len(inner)}")

# Show their local Y distribution
if inner:
    ys = sorted(v.y for v in inner)
    print(f"  local Y range: {min(ys):.3f} → {max(ys):.3f}")

    # At max sweep, these inner verts land at world X:
    print(f"\n  At sweep=48°, inner vert world X = pivot_x - local_y * sin(48°):")
    print(f"  {'local_y':>8}  {'world_x':>8}")
    for y in [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, max(ys)]:
        wx = pivot.x - y * math.sin(SWEEP_MAX)
        print(f"  {y:>8.2f}  {wx:>8.3f}")

# Fuselage objects X range for reference
for name in ["Object_3_fuselage", "Object_11"]:
    o = bpy.data.objects.get(name)
    if o:
        xs = [o.matrix_world @ v.co for v in o.data.vertices]
        print(f"\n{name} world X: {min(v.x for v in xs):.3f} → {max(v.x for v in xs):.3f}")
