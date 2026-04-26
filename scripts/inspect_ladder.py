import bpy, sys, math

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

glb_path = r"c:\devs\f35\public\F-35C.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)

print("\n=== LADDER HATCH OBJECT ===")
obj = bpy.data.objects.get("F-35C-Ledder-Hatch")
if obj:
    print(f"  Found: {obj.name}  type={obj.type}")
    print(f"  parent: {obj.parent.name if obj.parent else '—'}")
    print(f"  location: {obj.location}")
    print(f"  rotation_euler: {obj.rotation_euler}")
    print(f"  rotation_mode: {obj.rotation_mode}")
    # Walk up the parent chain
    p = obj.parent
    chain = []
    while p:
        chain.append(f"{p.name} ({p.type})")
        p = p.parent
    print(f"  parent chain: {' → '.join(chain) if chain else 'none'}")
    # Check if it's parented to a bone
    if obj.parent_bone:
        print(f"  parent_bone: {obj.parent_bone}")
else:
    print("  NOT FOUND")

print("\n=== LADDER RIG EMPTY ===")
rig = bpy.data.objects.get("F-35B-LADDER HATCH -Rig")
if rig:
    print(f"  Found: {rig.name}  type={rig.type}")
    print(f"  parent: {rig.parent.name if rig.parent else '—'}")
    # List children
    children = [o for o in bpy.data.objects if o.parent == rig]
    print(f"  children: {[c.name for c in children]}")
else:
    print("  NOT FOUND")

print("\n=== ACTIONS WITH 'LADDER' or 'LEDDER' or 'BODY.015' or 'BODY.016' ===")
import re
pat = re.compile(r"(ladder|ledder|BODY[._]015|BODY[._]016)", re.I)
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    if pat.search(action.name):
        fcurves = len(action.fcurves)
        frames = f"{action.frame_range[0]:.0f}-{action.frame_range[1]:.0f}" if fcurves else "no fcurves"
        print(f"  {action.name:50s}  fcurves={fcurves:3d}  frames={frames}")
        for fc in action.fcurves[:6]:
            print(f"    path={fc.data_path}  index={fc.array_index}  keys={len(fc.keyframe_points)}")

print("\n=== F-35C-BODY.015 and .016 OBJECTS ===")
for nm in ["F-35C-BODY.015", "F-35C-BODY.016"]:
    o = bpy.data.objects.get(nm)
    if o:
        chain = []
        p = o.parent
        while p:
            chain.append(f"{p.name}({p.type})")
            p = p.parent
        print(f"  {nm}: parent={o.parent.name if o.parent else '—'}  bone={o.parent_bone!r}  chain={' → '.join(chain)}")
    else:
        print(f"  {nm}: NOT FOUND")

print("\n=== ALL ACTIONS (name, duration) ===")
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    fcurves = len(action.fcurves)
    if fcurves:
        frames = f"{action.frame_range[0]:.0f}-{action.frame_range[1]:.0f}"
    else:
        frames = "no fcurves"
    print(f"  {action.name:50s}  frames={frames}")
