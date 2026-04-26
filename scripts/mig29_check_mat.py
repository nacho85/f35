"""Verifica materiales del GLB exportado"""
import bpy, sys

GLB = r"C:\devs\f35\public\mig-29-nose-gear-groups.glb"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
bpy.ops.import_scene.gltf(filepath=GLB)

mats_seen = set()
for o in bpy.data.objects:
    if o.type != "MESH": continue
    if not o.data.materials:
        print(f"NO MAT: {o.name}")
        continue
    for m in o.data.materials:
        if m and m.name not in mats_seen:
            mats_seen.add(m.name)
            if m.use_nodes:
                bsdf = m.node_tree.nodes.get("Principled BSDF")
                if bsdf:
                    col = bsdf.inputs["Base Color"].default_value
                    print(f"MAT OK: {m.name}  color=({col[0]:.2f},{col[1]:.2f},{col[2]:.2f})")
                else:
                    print(f"MAT NO BSDF: {m.name}  nodes={[n.type for n in m.node_tree.nodes]}")
            else:
                print(f"MAT NO NODES: {m.name}  diffuse={m.diffuse_color}")

print(f"\nTotal objetos: {len([o for o in bpy.data.objects if o.type=='MESH'])}")
sys.stdout.flush()
