import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\F-14-iran.glb")

obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_3_fuselage"), None)
if not obj:
    print("[!] no encontrado"); exit()

for i, mat in enumerate(obj.data.materials):
    if mat is None: continue
    print(f"\n[{i}] {mat.name}")
    if mat.use_nodes:
        for node in mat.node_tree.nodes:
            print(f"  node: {node.type} / {node.name}")
            if node.type == 'BSDF_PRINCIPLED':
                bc_input = node.inputs['Base Color']
                print(f"    BaseColor default: {tuple(round(x,3) for x in bc_input.default_value)}")
                print(f"    BaseColor links: {len(bc_input.links)}")
                if bc_input.links:
                    src = bc_input.links[0].from_node
                    print(f"    <- from node: {src.type} / {src.name}")
                    if src.type == 'TEX_IMAGE' and src.image:
                        print(f"    image: {src.image.name}  size: {src.image.size[:]}")
