# Reasigna Image_6 a los materiales grp:VStab* que habian quedado con Image_3.
# Reemplaza la imagen del Image Texture node existente (o crea uno si falta).
import bpy

img = bpy.data.images.get("Image_6")
if img is None:
    raise RuntimeError("Image_6 no encontrada")

touched = 0
for mat in bpy.data.materials:
    if not mat.name.startswith("grp:VStab"):
        continue
    if not mat.use_nodes:
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if not bsdf:
        continue
    link = next((l for l in nt.links if l.to_node == bsdf and l.to_socket.name == "Base Color"), None)
    if link and link.from_node.type == 'TEX_IMAGE':
        link.from_node.image = img
    else:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.location = (bsdf.location.x - 300, bsdf.location.y)
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    print(f"VStab retex -> Image_6: {mat.name}")
    touched += 1

print(f"\nDone. touched={touched}")
