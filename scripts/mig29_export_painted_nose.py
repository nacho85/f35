"""
Separa gear_nose en partes sueltas, las pinta de colores distintos
y exporta como mig-29-iran-paint-test.glb para identificarlas en el browser.
"""
import bpy, mathutils, sys

GLB_IN  = r"C:\devs\f35\public\mig-29-iran-anim-test.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-iran-paint-test.glb"

PALETTE = [
    (1.0, 0.05, 0.05, 1),  # rojo
    (0.05, 0.4, 1.0,  1),  # azul
    (0.05, 0.9, 0.1,  1),  # verde
    (1.0,  0.8, 0.0,  1),  # amarillo
    (0.9,  0.1, 1.0,  1),  # magenta
    (0.0,  0.9, 0.9,  1),  # cyan
    (1.0,  0.4, 0.0,  1),  # naranja
    (0.8,  0.8, 0.8,  1),  # gris
    (0.5,  0.2, 0.0,  1),  # marrón
    (0.0,  0.5, 0.2,  1),  # verde oscuro
    (1.0,  0.5, 0.7,  1),  # rosa
    (0.3,  0.0, 0.8,  1),  # violeta
]

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

gear_nose = bpy.data.objects.get("gear_nose")
if not gear_nose:
    print("ERROR: gear_nose no encontrado")
    raise SystemExit

# Separar en loose parts
for o in bpy.data.objects: o.hide_set(o != gear_nose)
bpy.context.view_layer.objects.active = gear_nose
bpy.ops.object.select_all(action="DESELECT")
gear_nose.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.hide_set(False)

parts = [o for o in bpy.data.objects
         if o.type == "MESH" and (o.name == "gear_nose" or o.name.startswith("gear_nose."))]

# Ordenar por volumen desc
def obj_vol(o):
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    return ((max(v.x for v in bb)-min(v.x for v in bb)) *
            (max(v.y for v in bb)-min(v.y for v in bb)) *
            (max(v.z for v in bb)-min(v.z for v in bb)))

parts.sort(key=lambda o: -obj_vol(o))

print(f"\nPintando las {min(len(parts), len(PALETTE))} piezas más grandes:")
for i, o in enumerate(parts[:len(PALETTE)]):
    color = PALETTE[i]
    mat = bpy.data.materials.new(f"Paint_{i:02d}")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
    o.data.materials.clear()
    o.data.materials.append(mat)
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    cx = sum(v.x for v in bb)/8; cy = sum(v.y for v in bb)/8; cz = sum(v.z for v in bb)/8
    print(f"  {i:2d} [{color[0]:.1f},{color[1]:.1f},{color[2]:.1f}] {o.name:<30} ctr=({cx:.1f},{cy:.1f},{cz:.1f})")

# Juntar el resto (partes pequeñas) en una sola gris
if len(parts) > len(PALETTE):
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts[len(PALETTE):]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[len(PALETTE)]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    mat = bpy.data.materials.new("Paint_rest")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.3, 0.3, 0.3, 1)
    joined.data.materials.clear()
    joined.data.materials.append(mat)
    print(f"  Resto ({len(parts)-len(PALETTE)} piezas pequeñas) → gris")

sys.stdout.flush()

bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format="GLB",
    export_image_format="AUTO",
    export_animations=True,
)
print(f"\nOK → {GLB_OUT}")
