"""
Separa el primitivo Object_1_1 (material slot 1 de Object_3_fuselage)
en sus loose parts y los exporta como Object_1_1_00, Object_1_1_01, ...
"""
import bpy, shutil

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_BAK = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb.bak12"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = bpy.data.objects.get("Object_3_fuselage")
if not obj:
    print("Object_3_fuselage no encontrado"); raise SystemExit

# Duplicar para no tocar el original
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.duplicate()
dup = bpy.context.active_object

# Seleccionar solo las caras del material slot 1 (= Object_1_1)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="DESELECT")
dup.active_material_index = 1
bpy.ops.object.material_slot_select()

# Separar esas caras en un nuevo objeto
bpy.ops.mesh.separate(type="SELECTED")
bpy.ops.object.mode_set(mode="OBJECT")

# El nuevo objeto es el que tiene las caras seleccionadas
slot1_obj = [o for o in bpy.context.selected_objects if o != dup][0]

# Eliminar el duplicado del fuselaje completo
bpy.ops.object.select_all(action="DESELECT")
dup.select_set(True)
bpy.ops.object.delete()

# Separar slot1_obj por loose parts
bpy.ops.object.select_all(action="DESELECT")
slot1_obj.select_set(True)
bpy.context.view_layer.objects.active = slot1_obj
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

pieces = [o for o in bpy.context.selected_objects if o.type == "MESH"]

# Calcular centroides y renombrar
results = []
for p in pieces:
    M = p.matrix_world
    verts = [M @ v.co for v in p.data.vertices]
    cx = sum(v.x for v in verts)/len(verts)
    cy = sum(v.y for v in verts)/len(verts)
    cz = sum(v.z for v in verts)/len(verts)
    results.append((p, cx, cy, cz, len(verts)))

results.sort(key=lambda r: r[2])  # ordenar por Y

print(f"\nObject_1_1 → {len(results)} loose parts\n")
print(f"{'#':<4} {'X':>8} {'Y':>8} {'Z':>8}  {'Verts':>6}")
print("-"*46)
for i, (p, cx, cy, cz, nv) in enumerate(results):
    name = f"Object_1_1_{i:02d}"
    p.name = name
    if p.data: p.data.name = name
    print(f"{i:<4} {cx:>8.3f} {cy:>8.3f} {cz:>8.3f}  {nv:>6}")

# Eliminar el Object_3_fuselage original y reemplazarlo
bpy.ops.object.select_all(action="DESELECT")
orig = bpy.data.objects.get("Object_3_fuselage")
if orig:
    orig.select_set(True)
    bpy.ops.object.delete()

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
