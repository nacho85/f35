import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

SWEEP_MAX = math.radians(48)
PIVOT_X = 2.290
PIVOT_Y = -1.119
FUSE_BOUNDARY_X = 2.287  # max X of Object_3_fuselage

obj = bpy.data.objects.get("Object_21_R")
if obj is None:
    print("[warn] Object_21_R not found")
else:
    verts_world = [obj.matrix_world @ v.co for v in obj.data.vertices]
    xs = [v.x for v in verts_world]
    ys = [v.y for v in verts_world]
    print(f"Object_21_R world X: {min(xs):.3f} → {max(xs):.3f}")
    print(f"Object_21_R world Y: {min(ys):.3f} → {max(ys):.3f}")

    # In Object_27 local space (pivot = 2.290, -1.119)
    # local_x = world_x - PIVOT_X,  local_y = world_y - PIVOT_Y
    print(f"\nIn Object_27 local space:")
    local_xs = [v.x - PIVOT_X for v in verts_world]
    local_ys = [v.y - PIVOT_Y for v in verts_world]
    print(f"  local X: {min(local_xs):.3f} → {max(local_xs):.3f}")
    print(f"  local Y: {min(local_ys):.3f} → {max(local_ys):.3f}")

    # At max sweep, world_x = PIVOT_X + local_x*cos(S) - local_y*sin(S)
    # Clip at world_x >= FUSE_BOUNDARY_X  →  local_x*cos(S) - local_y*sin(S) >= FUSE_BOUNDARY_X - PIVOT_X
    # For verts where local_x ≈ 0 (inner edge):
    #   -local_y * sin(S) >= FUSE_BOUNDARY_X - PIVOT_X
    #   local_y <= (PIVOT_X - FUSE_BOUNDARY_X) / sin(S)
    threshold_y = (PIVOT_X - FUSE_BOUNDARY_X) / math.sin(SWEEP_MAX)
    print(f"\nSafe local Y threshold (no clip at max sweep): local_y <= {threshold_y:.3f}")
    print(f"  → world Y <= {PIVOT_Y + threshold_y:.3f}")

    # How many verts would be removed?
    n_remove = sum(1 for ly in local_ys if ly > threshold_y)
    print(f"  Verts beyond threshold: {n_remove} / {len(local_ys)}")

    # Also check with a more conservative boundary
    for boundary in [2.0, 1.5, 1.0]:
        t = (PIVOT_X - boundary) / math.sin(SWEEP_MAX)
        n = sum(1 for ly in local_ys if ly > t)
        print(f"  boundary X={boundary}: local_y <= {t:.3f}  (world Y <= {PIVOT_Y+t:.3f}), removes {n} verts")
