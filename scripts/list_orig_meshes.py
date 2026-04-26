import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran.glb")

for o in sorted(bpy.data.objects, key=lambda x: x.name):
    if o.type == "MESH" and ("3" in o.name or "fuse" in o.name.lower() or "1_2" in o.name):
        print(f"  {o.name}  mats={len(o.data.materials)}")
        for i, m in enumerate(o.data.materials):
            if m and m.use_nodes:
                for node in m.node_tree.nodes:
                    if node.type == 'BSDF_PRINCIPLED':
                        bc = node.inputs['Base Color'].default_value
                        lnks = len(node.inputs['Base Color'].links)
                        print(f"    [{i}] BaseColor=({bc[0]:.2f},{bc[1]:.2f},{bc[2]:.2f}) links={lnks}")
