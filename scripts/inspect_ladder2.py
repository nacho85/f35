import bpy, sys, math

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

glb_path = r"c:\devs\f35\public\F-35C.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)

print("\n=== F-35C-Ledder-Hatch details ===")
obj = bpy.data.objects.get("F-35C-Ledder-Hatch")
if obj:
    print(f"  parent armature: {obj.parent.name}")
    print(f"  parent_bone: {obj.parent_bone!r}")
    arm = obj.parent
    if arm and arm.type == 'ARMATURE':
        bone = arm.pose.bones.get(obj.parent_bone)
        if bone:
            print(f"  bone location: {bone.location}")
            print(f"  bone rotation_quaternion: {bone.rotation_quaternion}")
            print(f"  bone rotation_euler: {bone.rotation_euler}")

print("\n=== Armature.014 actions ===")
arm14 = bpy.data.objects.get("Armature.014")
if arm14 and arm14.animation_data:
    ad = arm14.animation_data
    print(f"  action: {ad.action.name if ad.action else 'None'}")
    if ad.action:
        for fc in ad.action.fcurves:
            kp = fc.keyframe_points
            vals = [kp[i].co[1] for i in range(len(kp))]
            print(f"    path={fc.data_path}[{fc.array_index}]  keys={len(kp)}  range=[{min(vals):.3f}, {max(vals):.3f}]")
else:
    print("  no animation_data on Armature.014")

print("\n=== ALL ACTIONS (name, frame range) ===")
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    try:
        fcs = action.fcurves
        n = len(fcs)
        if n:
            fr = action.frame_range
            frames = f"{fr[0]:.0f}-{fr[1]:.0f}"
        else:
            frames = "no fcurves"
    except:
        frames = "error"
        n = 0
    print(f"  {action.name:50s}  fcurves={n:3d}  frames={frames}")

print("\n=== BODY.015 and BODY.016 parent info ===")
for nm in ["F-35C-BODY.015", "F-35C-BODY.016"]:
    o = bpy.data.objects.get(nm)
    if o:
        chain = []
        p = o.parent
        while p:
            chain.append(f"{p.name}({p.type})")
            p = p.parent
        pb = getattr(o, 'parent_bone', None)
        print(f"  {nm}: bone={pb!r}  chain={' → '.join(chain) if chain else 'root'}")
        # Also check if it has animation data
        if o.animation_data and o.animation_data.action:
            print(f"    action: {o.animation_data.action.name}")
    else:
        print(f"  {nm}: NOT FOUND")
