import bpy, sys, math

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

glb_path = r"c:\devs\f35\public\F-35C.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)

print("\n=== Armature.014 NLA / animation_data ===")
arm14 = bpy.data.objects.get("Armature.014")
if arm14:
    ad = arm14.animation_data
    if ad:
        print(f"  action: {ad.action}")
        print(f"  NLA tracks: {len(ad.nla_tracks)}")
        for track in ad.nla_tracks:
            print(f"    track: {track.name}")
            for strip in track.strips:
                print(f"      strip: {strip.name}  action={strip.action}  frame={strip.frame_start}-{strip.frame_end}")
    else:
        print("  no animation_data")
else:
    print("  Armature.014 not found")

print("\n=== F-35C-Ledder-Hatch NLA ===")
obj = bpy.data.objects.get("F-35C-Ledder-Hatch")
if obj:
    ad = obj.animation_data
    if ad:
        print(f"  action: {ad.action}")
        print(f"  NLA tracks: {len(ad.nla_tracks)}")
        for track in ad.nla_tracks:
            print(f"    track: {track.name}")
            for strip in track.strips:
                a = strip.action
                print(f"      strip: {strip.name}  action={a}  frame={strip.frame_start}-{strip.frame_end}")
    else:
        print("  no animation_data")

print("\n=== Action Armature.014 — try layered slots ===")
action = bpy.data.actions.get("Armature.014")
if action:
    print(f"  action found: {action.name}")
    try:
        # Blender 5.x layered system
        print(f"  is_action_layered: {action.is_action_layered}")
        print(f"  layers count: {len(action.layers)}")
        for layer in action.layers:
            print(f"    layer: {layer.name}")
            for strip in layer.strips:
                print(f"      strip type={strip.type}")
                if hasattr(strip, 'channelbags'):
                    for cb in strip.channelbags:
                        print(f"        channelbag slot={cb.slot_handle}  fcurves={len(cb.fcurves)}")
                        for fc in cb.fcurves[:10]:
                            kp = fc.keyframe_points
                            vals = [kp[i].co[1] for i in range(len(kp))]
                            r = f"[{min(vals):.3f}, {max(vals):.3f}]" if vals else "[]"
                            print(f"          path={fc.data_path}[{fc.array_index}]  keys={len(kp)}  range={r}")
    except AttributeError as e:
        print(f"  layered API error: {e}")
    try:
        print(f"  slots: {len(action.slots)}")
        for slot in action.slots:
            print(f"    slot: {slot.name}  handle={slot.handle}")
    except AttributeError as e:
        print(f"  slots API error: {e}")
else:
    print("  action not found")

print("\n=== F-35C-BODY.015 action — try layered slots ===")
action015 = bpy.data.actions.get("F-35C-BODY.015")
if action015:
    print(f"  action found: {action015.name}")
    try:
        print(f"  is_action_layered: {action015.is_action_layered}")
        print(f"  layers count: {len(action015.layers)}")
        for layer in action015.layers:
            print(f"    layer: {layer.name}")
            for strip in layer.strips:
                print(f"      strip type={strip.type}")
                if hasattr(strip, 'channelbags'):
                    for cb in strip.channelbags:
                        print(f"        channelbag fcurves={len(cb.fcurves)}")
                        for fc in cb.fcurves[:10]:
                            kp = fc.keyframe_points
                            vals = [kp[i].co[1] for i in range(len(kp))]
                            r = f"[{min(vals):.3f}, {max(vals):.3f}]" if vals else "[]"
                            print(f"          path={fc.data_path}[{fc.array_index}]  keys={len(kp)}  range={r}")
    except AttributeError as e:
        print(f"  layered API error: {e}")
else:
    print("  action not found")
