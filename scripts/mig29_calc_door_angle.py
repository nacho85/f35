"""
Calcula el ROT_DOOR correcto:
  - Open  = centros bbox de las compuertas en Object_16 (tren desplegado)
  - Close = Z de la superficie de Object_14 en la zona de nariz (tren recogido)

Busca en los vértices de Object_14 el Z promedio cerca del centroide de cada puerta.
"""
import bpy, mathutils, math, sys

GLB_IN  = r"C:\devs\f35\public\mig-29-iran.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-iran-door-compare.glb"

# ─── helpers ────────────────────────────────────────────────────────────────
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

# ─── Object_16 → compuertas abiertas (rojo) ─────────────────────────────────
parts16 = separate_obj("Object_16")
doors16 = []
for o in parts16:
    bb = get_bb(o)
    c  = bb_center(bb)
    v  = bb_vol(bb)
    if 38 < c.x < 55 and abs(c.y) > 1.5 and -8 < c.z < 1 and v >= 30:
        doors16.append((o, c, v, bb))

doors16.sort(key=lambda x: x[1].y)
print(f"\nObject_16 (abierto) — {len(doors16)} compuertas:")
for o, c, v, bb in doors16:
    zs = [pt.z for pt in bb]
    print(f"  {o.name}: cy={c.y:.2f}  cz={c.z:.2f}  zmin={min(zs):.2f}  zmax={max(zs):.2f}  vol={v:.1f}")
    paint(o, (1.0, 0.15, 0.05, 1))
sys.stdout.flush()

# ─── Object_14 → muestrear vértices en zona de nariz ───────────────────────
# Busca el Z promedio de los vértices de Object_14 cerca del centroide de cada puerta
obj14_pieces = [o for o in bpy.data.objects
                if o.type == "MESH" and (o.name == "Object_14" or o.name.startswith("Object_14."))]
print(f"\nObject_14: {len(obj14_pieces)} pieza(s)")

def sample_obj14_z(obj14_list, target_x, target_y, radius=4.0):
    """Promedio Z de vértices de Object_14 dentro de radio XY del punto dado."""
    zvals = []
    for obj in obj14_list:
        mw = obj.matrix_world
        for v in obj.data.vertices:
            wv = mw @ v.co
            if (abs(wv.x - target_x) < radius and
                abs(wv.y - target_y) < radius):
                zvals.append(wv.z)
    return (sum(zvals)/len(zvals), min(zvals), max(zvals), len(zvals)) if zvals else (None, None, None, 0)

# ─── Calcular ángulo ─────────────────────────────────────────────────────────
print(f"\n{'─'*60}")
print("Cálculo ROT_DOOR:")

for o, c, v, bb in doors16:
    side = "R" if c.y > 0 else "L"
    ys   = [pt.y for pt in bb]
    zs   = [pt.z for pt in bb]

    # Bisagra: borde Y interior (más cercano a 0), Z = borde superior
    hinge_y = min(ys) if c.y > 0 else max(ys)
    hinge_z = max(zs)

    # Z de cierre desde Object_14 en ese punto
    z_avg, z_min, z_max, n_verts = sample_obj14_z(obj14_pieces, c.x, hinge_y, radius=3.0)
    if z_avg is None:
        # ampliar radio
        z_avg, z_min, z_max, n_verts = sample_obj14_z(obj14_pieces, c.x, hinge_y, radius=6.0)

    if z_avg is not None:
        # Centro de la compuerta cuando está cerrada: Y≈(hinge_y + outer_y)/2, Z≈z_avg
        outer_y = max(ys) if c.y > 0 else min(ys)
        c_closed_y = (hinge_y + outer_y) / 2
        c_closed_z = z_avg

        def ang(cy, cz):
            dy = cy - hinge_y
            dz = cz - hinge_z
            return math.degrees(math.atan2(dy, dz))

        a_open   = ang(c.y, c.z)
        a_closed = ang(c_closed_y, c_closed_z)
        delta    = a_closed - a_open

        print(f"\nLado {side} ({o.name}, vol={v:.0f}):")
        print(f"  Bisagra:  y={hinge_y:.2f}  z={hinge_z:.2f}")
        print(f"  Abierta:  cy={c.y:.2f}  cz={c.z:.2f}  → {a_open:.1f}°")
        print(f"  Obj14 Z:  avg={z_avg:.2f}  min={z_min:.2f}  max={z_max:.2f}  ({n_verts} verts)")
        print(f"  Cerrada:  cy={c_closed_y:.2f}  cz={c_closed_z:.2f}  → {a_closed:.1f}°")
        print(f"  ► ROT_DOOR={abs(delta):.1f}°  rx={'−' if delta < 0 else '+'}  (para lado {side})")
    else:
        print(f"\nLado {side}: no se encontraron vértices de Object_14 cerca")

sys.stdout.flush()

# ─── Exportar comparación ────────────────────────────────────────────────────
keep = {o.name for o,c,v,bb in doors16}
for o in bpy.data.objects:
    if o.name not in keep:
        o.hide_render = True; o.hide_viewport = True

bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB",
    export_image_format="AUTO", export_animations=False,
)
print(f"\nOK → {GLB_OUT}")
sys.stdout.flush()
