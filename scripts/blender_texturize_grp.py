# Blender script: asigna textures a los materiales grp:XXX que no las tienen.
# - Canopy*      -> SKIP (queda transparente)
# - VStab*       -> Image_9
# - Cockpit*     -> Image_9
# - el resto     -> Image_6
# Saltea materiales que ya tienen un Image Texture conectado al Base Color.
#
# Uso: abrir el workspace Scripting en Blender, pegar, Run.

import bpy

def find_image(name):
    img = bpy.data.images.get(name)
    if not img:
        print(f"WARN: Image '{name}' no encontrada en bpy.data.images")
    return img

IMG_DEFAULT = find_image("Image_6")
IMG_VSTAB   = find_image("Image_9")
IMG_COCKPIT = find_image("Image_9")

def pick_image(mat_name):
    if "Canopy" in mat_name:
        return None  # no texture; queda transparente
    if "VStab" in mat_name:
        return IMG_VSTAB
    if "Cockpit" in mat_name:
        return IMG_COCKPIT
    return IMG_DEFAULT

def force_replace(mat_name):
    # forzar reemplazo aunque ya tenga textura conectada
    return ("VStab" in mat_name) or ("Cockpit" in mat_name)

touched = 0
skipped = 0
replaced = 0
for mat in bpy.data.materials:
    if not mat.name.startswith("grp:"):
        continue
    img = pick_image(mat.name)
    if img is None:
        continue
    if not mat.use_nodes:
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if not bsdf:
        continue
    link = next((l for l in nt.links if l.to_node == bsdf and l.to_socket.name == "Base Color"), None)
    has_tex = bool(link and link.from_node.type == 'TEX_IMAGE' and link.from_node.image)
    if has_tex and not force_replace(mat.name):
        skipped += 1
        continue
    if has_tex and force_replace(mat.name):
        link.from_node.image = img
        print(f"Replaced:   {mat.name:40s} -> {img.name}")
        replaced += 1
        continue
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (bsdf.location.x - 300, bsdf.location.y)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    print(f"Texturized: {mat.name:40s} -> {img.name}")
    touched += 1

print(f"\nDone. touched={touched}, replaced={replaced}, skipped={skipped}")
