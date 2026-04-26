"""
Exporta mig-29-iran-door-compare.glb con:
  - ROJO  = compuertas abiertas (Object_16, estado desplegado)
  - AZUL  = Object_14 recortado a la zona de nariz (estado recogido)
Para ver la diferencia de posición en el browser y ajustar el ángulo.
"""
import bpy, mathutils, sys

GLB_IN  = r"C:\devs\f35\public\mig-29-iran.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-iran-door-compare.glb"

# ─── helpers ─────────────────────────────────────────────────────────────────
def get_bb(o):
    return [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]

def bb_center(bb):
    return mathutils.Vector((sum(v.x for v in bb)/8,
                              sum(v.y for v in bb)/8,
                              sum(v.z for v in bb)/8))

def bb_vol(bb):
    xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
    return (max(xs)-min(xs))*(max(ys)-min(ys))*(max(zs)-min(zs))

def separate_obj(name):
    obj = bpy.data.objects.get(name)
    if not obj:
        print(f"ERROR: {name} no encontrado"); sys.stdout.flush(); return []
    for o in bpy.data.objects: o.hide_set(o != obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.data.objects: o.hide_set(False)
    return [o for o in bpy.data.objects
            if o.type == "MESH" and (o.name == name or o.name.startswith(name + "."))]

def paint(obj, rgba):
    mat = bpy.data.materials.new(f"_p_{obj.name[:20]}")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
    obj.data.materials.clear()
    obj.data.materials.append(mat)

# ─── cargar GLB ──────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

keep = set()

# ─── Object_16 → compuertas abiertas (ROJO) ──────────────────────────────────
parts16 = separate_obj("Object_16")
print(f"\nObject_16 candidatas (zona nariz):")
for o in parts16:
    bb = get_bb(o)
    c  = bb_center(bb)
    v  = bb_vol(bb)
    if 38 < c.x < 55 and abs(c.y) > 1.5 and -8 < c.z < 1 and v >= 30:
        zs = [pt.z for pt in bb]
        ys = [pt.y for pt in bb]
        print(f"  {o.name}: cy={c.y:.2f} cz={c.z:.2f}  ymin={min(ys):.2f} ymax={max(ys):.2f}  zmin={min(zs):.2f} zmax={max(zs):.2f}  vol={v:.1f}")
        paint(o, (1.0, 0.1, 0.05, 1))
        keep.add(o.name)

# ─── Object_14 zona nariz → referencia cerrado (AZUL) ────────────────────────
# Object_14 es un mesh único — lo conservamos entero pero recortado al bbox de nariz
# Creamos una copia y eliminamos vértices fuera de zona de interés
obj14 = bpy.data.objects.get("Object_14")
if obj14:
    # Duplicar
    bpy.ops.object.select_all(action="DESELECT")
    obj14.select_set(True)
    bpy.context.view_layer.objects.active = obj14
    bpy.ops.object.duplicate()
    obj14c = bpy.context.active_object
    obj14c.name = "_obj14_nose"
    paint(obj14c, (0.05, 0.3, 1.0, 1))

    # Entrar en edit mode y eliminar vértices fuera de zona nariz
    bpy.ops.object.mode_set(mode="EDIT")
    import bmesh
    bm = bmesh.from_edit_mesh(obj14c.data)
    mw = obj14c.matrix_world
    for v in bm.verts:
        wco = mw @ v.co
        # Mantener solo zona de nariz (X=35-58, |Y|<8, Z=-8..2)
        if not (35 < wco.x < 58 and abs(wco.y) < 8 and -8 < wco.z < 2):
            v.select = True
        else:
            v.select = False
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.select], context='VERTS')
    bmesh.update_edit_mesh(obj14c.data)
    bpy.ops.object.mode_set(mode="OBJECT")

    keep.add(obj14c.name)
    print(f"\nObject_14 nariz → {obj14c.name} (azul)")
else:
    print("ERROR: Object_14 no encontrado")

sys.stdout.flush()

# ─── Ocultar todo lo que no exportamos ───────────────────────────────────────
for o in bpy.data.objects:
    if o.name not in keep:
        o.hide_render   = True
        o.hide_viewport = True

# ─── Exportar ─────────────────────────────────────────────────────────────────
bpy.ops.export_scene.gltf(
    filepath            = GLB_OUT,
    export_format       = "GLB",
    export_image_format = "AUTO",
    export_animations   = False,
)
print(f"\nOK → {GLB_OUT}")
sys.stdout.flush()
