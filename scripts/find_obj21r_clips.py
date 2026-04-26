import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

PIVOT_X, PIVOT_Y = 2.290, -1.119
SWEEP_MAX = math.radians(48)
FUSE_X = 2.287

base = bpy.data.objects.get("Object_21_R")
bpy.ops.object.select_all(action="DESELECT")
base.select_set(True); bpy.context.view_layer.objects.active = base
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

pieces = [o for o in bpy.context.scene.objects if o.type=="MESH" and o.name.startswith("Object_21_R")]
clips = []
safe = []
for p in pieces:
    vs = [p.matrix_world @ v.co for v in p.data.vertices]
    cx = sum(v.x for v in vs)/len(vs)
    cy = sum(v.y for v in vs)/len(vs)
    lx, ly = cx - PIVOT_X, cy - PIVOT_Y
    min_wx = PIVOT_X + lx*math.cos(SWEEP_MAX) - ly*math.sin(SWEEP_MAX)
    entry = (min_wx, cx, cy, len(p.data.vertices))
    if min_wx < FUSE_X:
        clips.append(entry)
    else:
        safe.append(entry)

print(f"\nObject_21_R: {len(pieces)} total pieces")
print(f"  clips into fuselage: {len(clips)}")
print(f"  safe:                {len(safe)}")

print(f"\nClipping pieces (min_wx@48 < {FUSE_X}):")
print(f"{'min_wx@48':>10}  {'cx_world':>10}  {'cy_world':>10}  {'verts':>6}")
for entry in sorted(clips):
    print(f"{entry[0]:>10.3f}  {entry[1]:>10.3f}  {entry[2]:>10.3f}  {entry[3]:>6}")

# World X range of clipping pieces
if clips:
    cx_clips = [e[1] for e in clips]
    cy_clips = [e[2] for e in clips]
    print(f"\nClipping pieces world X range: {min(cx_clips):.3f} → {max(cx_clips):.3f}")
    print(f"Clipping pieces world Y range: {min(cy_clips):.3f} → {max(cy_clips):.3f}")
    print(f"Safe pieces world X range:     {min(e[1] for e in safe):.3f} → {max(e[1] for e in safe):.3f}")
