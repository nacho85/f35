import bpy

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

bpy.ops.import_scene.gltf(filepath=GLB_PATH)

objects   = list(bpy.context.scene.objects)
meshes    = [o for o in objects if o.type == "MESH"]
armatures = [o for o in objects if o.type == "ARMATURE"]
actions   = list(bpy.data.actions)

print("\n=== GLB INSPECTION ===")
print(f"Total objects : {len(objects)}")
print(f"Meshes        : {len(meshes)}")
print(f"Armatures     : {len(armatures)}")
print(f"Actions/anims : {len(actions)}")

if armatures:
    for arm in armatures:
        bones = arm.data.bones
        print(f"\nArmature '{arm.name}' — {len(bones)} bones:")
        for b in bones:
            print(f"  {b.name}")

if actions:
    print("\nAnimations:")
    for a in actions:
        print(f"  '{a.name}'  frame_range={a.frame_range[:]}")

print("\nMesh objects:")
for m in meshes:
    dims = m.dimensions
    print(f"  {m.name:40s}  dims=({dims.x:.2f}, {dims.y:.2f}, {dims.z:.2f})")

print("=== END ===\n")
