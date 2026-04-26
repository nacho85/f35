"""
El material [0] de Object_3_fuselage tiene BaseColor negro y sin textura.
Le asignamos la misma textura (Image_6) y configuración que el material [1].
"""
import bpy, shutil

GLB_IN  = r"C:\devs\f35\public\F-14-iran.glb"
GLB_BAK = r"C:\devs\f35\public\F-14-iran.glb.bak"
GLB_OUT = r"C:\devs\f35\public\F-14-iran.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_3_fuselage"), None)
if not obj:
    print("[!] Object_3_fuselage no encontrado"); exit()

mat_black = obj.data.materials[0]  # el negro, sin textura
mat_ref   = obj.data.materials[1]  # el gris con Image_6

# Obtener la imagen del material de referencia
img = None
for node in mat_ref.node_tree.nodes:
    if node.type == 'TEX_IMAGE' and node.image:
        img = node.image
        break

if not img:
    print("[!] No se encontró imagen en material [1]"); exit()

print(f"Imagen de referencia: {img.name}  {img.size[:]}")

# Configurar el material negro con esa imagen
mat_black.use_nodes = True
nt = mat_black.node_tree
nt.nodes.clear()

out  = nt.nodes.new("ShaderNodeOutputMaterial")
bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
tex  = nt.nodes.new("ShaderNodeTexImage")
tex.image = img

nt.links.new(tex.outputs["Color"],  bsdf.inputs["Base Color"])
nt.links.new(bsdf.outputs["BSDF"],  out.inputs["Surface"])

print(f"Material [{mat_black.name}] → textura asignada: {img.name}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
