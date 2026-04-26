"""Verifica si Object_16 tiene vertex colors"""
import bpy, sys

GLB_IN = r"C:\devs\f35\public\mig-29-iran.glb"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj16 = bpy.data.objects.get("Object_16")
if obj16:
    print(f"Object_16 vertex_colors: {list(obj16.data.vertex_colors.keys())}")
    print(f"Object_16 color_attributes: {list(obj16.data.color_attributes.keys())}")
    print(f"Object_16 materials: {[m.name if m else 'None' for m in obj16.data.materials]}")
    for m in obj16.data.materials:
        if m:
            print(f"  mat '{m.name}' use_nodes={m.use_nodes}")
            if m.use_nodes:
                for n in m.node_tree.nodes:
                    print(f"    node: {n.type} {n.name}")
else:
    print("Object_16 not found")

sys.stdout.flush()
