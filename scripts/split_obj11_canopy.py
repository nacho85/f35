"""
Split Object_11 → Object_11_canopy (marco del canopy) + Object_11 (resto fuselaje).

Criterio: pieza suelta con centroide Y > 1.0 Y Z > 0.45
(excluye piezas grandes del fuselaje aunque estén en esa zona — umbral de verts > 300)
"""
import bpy
from mathutils import Vector

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = bpy.data.objects.get("Object_11")
if not obj:
    print("Object_11 no encontrado"); raise SystemExit

# Separar en loose parts
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.duplicate()
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

all_pieces = [o for o in bpy.context.selected_objects if o.type == "MESH"]

canopy_pieces = []
fuse_pieces   = []

for p in all_pieces:
    M    = p.matrix_world
    verts = [M @ v.co for v in p.data.vertices]
    cx = sum(v.x for v in verts) / len(verts)
    cy = sum(v.y for v in verts) / len(verts)
    cz = sum(v.z for v in verts) / len(verts)
    nv = len(p.data.vertices)

    is_canopy = cy > 1.0 and cz > 0.45 and nv <= 300
    if is_canopy:
        canopy_pieces.append(p)
        print(f"  CANOPY  cx={cx:.3f} cy={cy:.3f} cz={cz:.3f} verts={nv}")
    else:
        fuse_pieces.append(p)

print(f"\nCanopy pieces: {len(canopy_pieces)}  |  Fuselage pieces: {len(fuse_pieces)}")

# Unir piezas del canopy → Object_11_canopy
if canopy_pieces:
    bpy.ops.object.select_all(action="DESELECT")
    for p in canopy_pieces:
        p.select_set(True)
    bpy.context.view_layer.objects.active = canopy_pieces[0]
    bpy.ops.object.join()
    bpy.context.active_object.name = "Object_11_canopy"
    print("→ Object_11_canopy creado")

# Unir el resto → Object_11
if fuse_pieces:
    bpy.ops.object.select_all(action="DESELECT")
    for p in fuse_pieces:
        p.select_set(True)
    bpy.context.view_layer.objects.active = fuse_pieces[0]
    bpy.ops.object.join()
    bpy.context.active_object.name = "Object_11"
    print("→ Object_11 (fuselaje) reconstruido")

# Eliminar el Object_11 original (ya duplicamos al principio)
orig = bpy.data.objects.get("Object_11.001")  # el original queda con .001
if not orig:
    # a veces queda con otro nombre — buscar por exclusión
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name not in ["Object_11", "Object_11_canopy"]:
            if "Object_11" in o.name:
                orig = o
                break
if orig:
    bpy.data.objects.remove(orig, do_unlink=True)
    print("→ original Object_11 duplicado eliminado")

# Exportar
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
