import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

FUSE_X = 2.287
SWEEP_MAX = math.radians(48)

obj27 = bpy.data.objects.get("Object_27")
print("Object_27 world matrix:")
for row in obj27.matrix_world:
    print(f"  {row[0]:>8.4f}  {row[1]:>8.4f}  {row[2]:>8.4f}  {row[3]:>8.4f}")

# Check if it's pure translation (identity rotation)
m = obj27.matrix_world
is_identity_rot = (abs(m[0][0]-1)<0.001 and abs(m[1][1]-1)<0.001 and abs(m[2][2]-1)<0.001
                   and abs(m[0][1])<0.001 and abs(m[0][2])<0.001
                   and abs(m[1][0])<0.001 and abs(m[1][2])<0.001)
print(f"\nRotation is identity: {is_identity_rot}")

# Vertex-level sweep analysis for Object_21_R
print("\n--- Object_21_R vertex sweep analysis ---")
PIVOT_X, PIVOT_Y = obj27.matrix_world.translation.x, obj27.matrix_world.translation.y
print(f"Pivot: ({PIVOT_X:.3f}, {PIVOT_Y:.3f})")

obj21 = bpy.data.objects.get("Object_21_R")
worst_verts = []
for v in obj21.data.vertices:
    wv = obj21.matrix_world @ v.co
    lx = wv.x - PIVOT_X
    ly = wv.y - PIVOT_Y
    wx_after = PIVOT_X + lx*math.cos(SWEEP_MAX) - ly*math.sin(SWEEP_MAX)
    if wx_after < FUSE_X:
        worst_verts.append((wx_after, wv.x, wv.y, lx, ly))

worst_verts.sort()
print(f"Verts that clip (world X < {FUSE_X} after sweep): {len(worst_verts)} / {len(obj21.data.vertices)}")
if worst_verts:
    print(f"\nWorst clippers:")
    print(f"{'wx_after':>10}  {'wx_orig':>10}  {'wy_orig':>10}  {'lx':>8}  {'ly':>8}")
    for wx_a, wx, wy, lx, ly in worst_verts[:15]:
        print(f"{wx_a:>10.3f}  {wx:>10.3f}  {wy:>10.3f}  {lx:>8.3f}  {ly:>8.3f}")
    # World X boundary of clipping verts
    wx_origs = [e[1] for e in worst_verts]
    print(f"\nClipping verts original world X: {min(wx_origs):.3f} → {max(wx_origs):.3f}")
