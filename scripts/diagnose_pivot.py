"""
Diagnose the current pivot (origin) position of Object_27/28 and the wing root geometry.

Prints:
  - Current world origin of Object_27 / Object_28
  - Bounding box of each in world space
  - Inboard edge vertices (those with |X| < threshold) so we can see
    where the wing root is — that inner leading-edge point should be
    the actual glove pivot.
  - Fuselage bounding box at the pivot Z slice for comparison
"""
import bpy, math

GLB_IN = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def world_verts(obj):
    M = obj.matrix_world
    return [M @ v.co for v in obj.data.vertices]

def bbox(verts):
    xs = [v.x for v in verts]
    ys = [v.y for v in verts]
    zs = [v.z for v in verts]
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))

def print_bbox(label, bx, by, bz):
    print(f"  {label}")
    print(f"    X: {bx[0]:.3f} → {bx[1]:.3f}  (width {bx[1]-bx[0]:.3f})")
    print(f"    Y: {by[0]:.3f} → {by[1]:.3f}  (height {by[1]-by[0]:.3f})")
    print(f"    Z: {bz[0]:.3f} → {bz[1]:.3f}  (depth {bz[1]-bz[0]:.3f})")

# ── Object_27 (right wing) ────────────────────────────────────────────────────
obj27 = bpy.data.objects.get("Object_27")
if obj27:
    origin27 = obj27.matrix_world.translation
    print(f"\n=== Object_27 (right wing) ===")
    print(f"  World origin:  X={origin27.x:.4f}  Y={origin27.y:.4f}  Z={origin27.z:.4f}")

    wv27 = world_verts(obj27)
    bx, by, bz = bbox(wv27)
    print_bbox("Bounding box:", bx, by, bz)

    # Inboard edge vertices: those with X < origin.x + 0.5  (close to root)
    INBOARD_X = origin27.x + 0.8
    inboard = [v for v in wv27 if v.x < INBOARD_X]
    if inboard:
        # Sort by Z (front to back) to see leading/trailing edge root
        inboard.sort(key=lambda v: v.z)
        print(f"  Inboard verts (X < {INBOARD_X:.2f}):  count={len(inboard)}")
        print(f"    Z range: {inboard[0].z:.4f} → {inboard[-1].z:.4f}")
        print(f"    Most forward (smallest Z): X={inboard[0].x:.4f} Y={inboard[0].y:.4f} Z={inboard[0].z:.4f}")
        print(f"    Most rear    (largest  Z): X={inboard[-1].x:.4f} Y={inboard[-1].y:.4f} Z={inboard[-1].z:.4f}")
        # Centroid of inboard edge
        cx = sum(v.x for v in inboard)/len(inboard)
        cy = sum(v.y for v in inboard)/len(inboard)
        cz = sum(v.z for v in inboard)/len(inboard)
        print(f"    Inboard centroid: X={cx:.4f} Y={cy:.4f} Z={cz:.4f}")
else:
    print("Object_27 not found")

# ── Object_28 (left wing) ─────────────────────────────────────────────────────
obj28 = bpy.data.objects.get("Object_28")
if obj28:
    origin28 = obj28.matrix_world.translation
    print(f"\n=== Object_28 (left wing) ===")
    print(f"  World origin:  X={origin28.x:.4f}  Y={origin28.y:.4f}  Z={origin28.z:.4f}")

    wv28 = world_verts(obj28)
    bx, by, bz = bbox(wv28)
    print_bbox("Bounding box:", bx, by, bz)

    INBOARD_X = origin28.x - 0.8   # left wing: inboard = toward +X (less negative)
    inboard28 = [v for v in wv28 if v.x > INBOARD_X]
    if inboard28:
        inboard28.sort(key=lambda v: v.z)
        print(f"  Inboard verts (X > {INBOARD_X:.2f}):  count={len(inboard28)}")
        print(f"    Z range: {inboard28[0].z:.4f} → {inboard28[-1].z:.4f}")
        print(f"    Most forward (smallest Z): X={inboard28[0].x:.4f} Y={inboard28[0].y:.4f} Z={inboard28[0].z:.4f}")
        print(f"    Most rear    (largest  Z): X={inboard28[-1].x:.4f} Y={inboard28[-1].y:.4f} Z={inboard28[-1].z:.4f}")
        cx = sum(v.x for v in inboard28)/len(inboard28)
        cy = sum(v.y for v in inboard28)/len(inboard28)
        cz = sum(v.z for v in inboard28)/len(inboard28)
        print(f"    Inboard centroid: X={cx:.4f} Y={cy:.4f} Z={cz:.4f}")
else:
    print("Object_28 not found")

# ── Fuselage / glove reference objects ────────────────────────────────────────
FUSE_NAMES = ["Object_19_R_glove_inner", "Object_19_R_fixed", "Object_3_fuselage", "Object_4_fuselage"]
print(f"\n=== Reference / fuselage objects ===")
for name in FUSE_NAMES:
    obj = bpy.data.objects.get(name)
    if not obj:
        print(f"  {name}: NOT FOUND")
        continue
    wv = world_verts(obj)
    bx, by, bz = bbox(wv)
    print_bbox(name, bx, by, bz)

print("\n[done]")
