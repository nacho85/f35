"""
Blender script — lowers UpperArm rest pose on PilotOriginal.glb
Edits bones in Edit Mode (no animation data touched).
Run: blender --background --python scripts/lower_shoulders.py
"""
import bpy
import math
import sys
import os
from mathutils import Matrix, Vector

GLB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "PilotOriginal.glb")
DROP_DEG = 15  # degrees to drop each shoulder

# ── Clear scene ──────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)

# ── Import GLB ───────────────────────────────────────────────────────────────
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

# ── Find armature ────────────────────────────────────────────────────────────
armature = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
if not armature:
    print("ERROR: no armature found"); sys.exit(1)

print(f"Armature: {armature.name}")

# ── Edit Mode — rotate upper arm edit bones ───────────────────────────────────
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode='EDIT')

arm_data = armature.data

for bone_name, sign in [('L_UpperArm', 1), ('R_UpperArm', -1)]:
    ebone = arm_data.edit_bones.get(bone_name)
    if ebone is None:
        print(f"WARNING: edit bone '{bone_name}' not found"); continue

    # Rotate the bone around its own roll axis (local Z = across-arm direction)
    # to lower/raise the shoulder. We rotate the tail around the head.
    angle = math.radians(DROP_DEG * sign)
    # Build rotation matrix around local bone Y axis (bone length direction = Y)
    # "Adduction" from A-pose = rotate around world/local Z
    mat = Matrix.Rotation(angle, 4, ebone.z_axis)  # rotate around bone's Z axis
    # Apply rotation: pivot around head, rotate tail
    head = ebone.head.copy()
    tail_offset = ebone.tail - head
    ebone.tail = head + mat @ tail_offset
    # Rotate children tails to keep them attached (update handled by Blender)
    print(f"Rotated edit bone '{bone_name}' by {DROP_DEG * sign}°")

# ── Back to Object Mode ───────────────────────────────────────────────────────
bpy.ops.object.mode_set(mode='OBJECT')

# ── Export ────────────────────────────────────────────────────────────────────
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format='GLB',
    export_animations=True,
    export_skins=True,
    export_morph=True,
)
print(f"Exported: {GLB_PATH}")
