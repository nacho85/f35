"""
Extrae las piezas del tailhook de Object_3_fuselage (material slot 1).
Criterio: Y > 5.0, |X| < 1.5, Z < 0.5  (zona trasera-inferior del avión)
Las nombra Object_hook_00, Object_hook_01, ...
El resto del material 1 vuelve a Object_3_fuselage.
"""
import bpy, shutil

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_BAK = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb.bak14"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = bpy.data.objects.get("Object_3_fuselage")
if not obj:
    print("Object_3_fuselage no encontrado"); raise SystemExit

# Separar material 1 en objeto aparte
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.duplicate()
dup = bpy.context.active_object

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="DESELECT")
dup.active_material_index = 1
bpy.ops.object.material_slot_select()
bpy.ops.mesh.separate(type="SELECTED")
bpy.ops.object.mode_set(mode="OBJECT")

mat1_obj = [o for o in bpy.context.selected_objects if o != dup][0]

# Limpiar duplicado del fuselaje
bpy.ops.object.select_all(action="DESELECT")
dup.select_set(True)
bpy.ops.object.delete()

# Separar mat1 por loose parts
bpy.ops.object.select_all(action="DESELECT")
mat1_obj.select_set(True)
bpy.context.view_layer.objects.active = mat1_obj
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

all_pieces = [o for o in bpy.context.selected_objects if o.type == "MESH"]

hook_pieces = []
other_pieces = []

for p in all_pieces:
    M = p.matrix_world
    verts = [M @ v.co for v in p.data.vertices]
    cx = sum(v.x for v in verts)/len(verts)
    cy = sum(v.y for v in verts)/len(verts)
    cz = sum(v.z for v in verts)/len(verts)
    nv = len(verts)
    # Zona hook: trasero, centrado, debajo del fuselaje, tamaño mínimo
    if cy > 5.0 and abs(cx) < 1.5 and cz < 0.5 and nv >= 3:
        hook_pieces.append((p, cx, cy, cz, nv))
    else:
        other_pieces.append(p)

print(f"\nHook pieces encontradas: {len(hook_pieces)}")
print(f"{'#':<4} {'X':>8} {'Y':>8} {'Z':>8}  {'Verts':>6}")
print("-"*46)
hook_pieces.sort(key=lambda r: r[2])
for i, (p, cx, cy, cz, nv) in enumerate(hook_pieces):
    name = f"Object_hook_{i:02d}"
    p.name = name
    if p.data: p.data.name = name
    print(f"{i:<4} {cx:>8.3f} {cy:>8.3f} {cz:>8.3f}  {nv:>6}  → {name}")

# Eliminar los otros (pequeños residuos de material 1 fuera de la zona hook)
print(f"\nEliminando {len(other_pieces)} piezas fuera de zona hook...")
bpy.ops.object.select_all(action="DESELECT")
for p in other_pieces:
    p.select_set(True)
bpy.ops.object.delete()

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
