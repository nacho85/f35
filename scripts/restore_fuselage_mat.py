"""
Copia el material [0] (el negro) de Object_3_fuselage desde el original
f-14a_tomcat_iran.glb al modelo actual F-14-iran.glb, preservando todos los splits.
"""
import bpy, shutil

GLB_ORIG   = r"C:\devs\f35\public\f-14a_tomcat_iran.glb"
GLB_CURRENT = r"C:\devs\f35\public\F-14-iran.glb"
GLB_BAK    = r"C:\devs\f35\public\F-14-iran.glb.bak"
GLB_OUT    = r"C:\devs\f35\public\F-14-iran.glb"

shutil.copy2(GLB_CURRENT, GLB_BAK)
print(f"Backup → {GLB_BAK}")

# 1) Importar el original y guardar el material de referencia
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_ORIG)

orig_obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_3_fuselage"), None)
if not orig_obj:
    print("[!] Object_3_fuselage no encontrado en original"); exit()

# Inspeccionar material [0] del original
mat0_orig = orig_obj.data.materials[0]
print(f"\nOriginal mat[0]: {mat0_orig.name}")
if mat0_orig.use_nodes:
    for node in mat0_orig.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            bc = node.inputs['Base Color'].default_value
            print(f"  BaseColor: {tuple(round(x,3) for x in bc)}")
            print(f"  BaseColor links: {len(node.inputs['Base Color'].links)}")
            if node.inputs['Base Color'].links:
                src = node.inputs['Base Color'].links[0].from_node
                print(f"  <- {src.type}: {src.image.name if hasattr(src,'image') and src.image else 'no image'}")

# Guardar referencia a la imagen del mat[0] original
img_orig = None
if mat0_orig.use_nodes:
    for node in mat0_orig.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            img_orig = node.image
            print(f"  Imagen encontrada: {img_orig.name}  {img_orig.size[:]}")
            break

if img_orig is None:
    bc_orig = None
    if mat0_orig.use_nodes:
        for node in mat0_orig.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                bc_orig = tuple(mat0_orig.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value)
    print(f"  Sin textura — BaseColor: {bc_orig}")

# 2) Importar el modelo actual (append a la escena actual)
bpy.ops.import_scene.gltf(filepath=GLB_CURRENT)

curr_obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_3_fuselage"
                 and o not in orig_obj.users_scene), None)
# Buscar por el que tiene más materiales distintos o simplemente tomar el último importado
all_fuse = [o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_3_fuselage"]
print(f"\nObject_3_fuselage encontrados: {len(all_fuse)}")

# El segundo importado es el del modelo actual
curr_obj = all_fuse[-1] if len(all_fuse) > 1 else all_fuse[0]
mat0_curr = curr_obj.data.materials[0]
print(f"Current mat[0]: {mat0_curr.name}")

# 3) Parchear el material del modelo actual con los datos del original
if img_orig:
    mat0_curr.use_nodes = True
    nt = mat0_curr.node_tree
    # Limpiar y reconstruir igual que el original
    nt.nodes.clear()
    out  = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex  = nt.nodes.new("ShaderNodeTexImage")
    # La imagen viene de la escena original — copiarla
    tex.image = img_orig
    nt.links.new(tex.outputs["Color"],  bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"],  out.inputs["Surface"])
    print(f"  Textura asignada: {img_orig.name}")
else:
    # Solo copiar BaseColor
    mat0_curr.use_nodes = True
    for node in mat0_curr.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED' and bc_orig:
            node.inputs['Base Color'].default_value = bc_orig
            print(f"  BaseColor copiado: {bc_orig}")

# 4) Exportar solo el modelo actual (seleccionar solo sus objetos)
# Deseleccionar todo, luego seleccionar solo objetos del segundo import
# La forma más simple: exportar toda la escena filtrando por nombre único del modelo actual
# Mejor: exportar todo y que Blender resuelva duplicados
bpy.ops.object.select_all(action="SELECT")

# Eliminar objetos del original para no duplicar
for o in list(bpy.data.objects):
    if o in [orig_obj] or (hasattr(o, 'name') and o.name.endswith('.001')):
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
