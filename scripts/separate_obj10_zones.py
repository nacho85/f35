"""
Separa Object_10 en 5 objetos distintos clasificando por centroide de cada parte suelta.

Debug mostró las siguientes zonas (Three.js: tx=Bx, ty=Bz altura, tz=-By nariz):

  Object_10_FlapL    → flap ala izquierda    tx>3.5, tz<0.5   (+X = visual izquierda/babor)
  Object_10_FlapR    → flap ala derecha      tx<-3.5, tz<0.5  (-X = visual derecha/estribor)
  Object_10_SpoilerR → spoiler ala der       tx<-0.5 AND tz<0.5 (lo que resta en ala der)
  Object_10_DoorNose → compuertas bahía nariz ty>-0.15, tz>5.5 (paneles al nivel fuselaje)
  Object_10_NoseGear → struts/scissors/rueda  resto en zona nariz (ty<=-0.15, tz>4.5)

Guarda en F-14-iran-v4.glb. No toca el original.
"""
import bpy, bmesh

GLB_IN  = r"C:\devs\f35\public\F-14-iran.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v4.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10"), None)
if not orig:
    print("[!] Object_10 no encontrado"); raise SystemExit

M = orig.matrix_world
print(f"Object_10: {len(orig.data.vertices)} verts")

# ── 1. Partes sueltas → centroide world ────────────────────────────────────
bm = bmesh.new()
bm.from_mesh(orig.data)
bm.verts.ensure_lookup_table()

visited = set()
zone_for_vert = {}   # vert_index → zone_name

def classify(cx, cy, cz):
    """
    cx,cy,cz en Blender world coords.
    tx = cx  (Three.js x)
    ty = cz  (Three.js y = altura)
    tz = -cy (Three.js z = positivo hacia nariz)
    """
    tx = cx
    ty = cz   # altura
    tz = -cy  # nariz = positivo

    # +X = visual izquierda (babor), -X = visual derecha (estribor)

    # 1. Ala izquierda — todo lo que está outboard (+X) y aft (tz<0.5)
    if tx > 2.5 and tz < 0.5:
        if tx < 5.0:
            return "SpoilerL"  # inboard ala izq (incluye flap interno tx≈3.26)
        return "FlapL"         # outboard ala izq

    # 2. Ala derecha
    if tx < -3.5 and tz < 0.5:
        return "FlapR"

    # 3. Compuerta bahía nariz — paneles planos al nivel del fuselaje (ty alto)
    if tz > 5.5 and ty > -0.15:
        return "NoseFrontalStrut"

    # 4. Zona nariz — dividida en 4 por tz
    if tz > 4.5 and abs(tx) < 2.5:
        if tz > 7.6:
            return "NoseStrutFwd"  # parte delantera del strut (tz≈7.87)
        elif tz > 7.3:
            return "NoseStrutAft"  # parte trasera del strut (tz≈7.54)
        elif tz > 7.0:
            return "NoseCano"      # caño interior (tz≈7.00)
        elif tz > 6.8:
            return "NoseStrutBase" # base del strut (tz≈6.9, parte de Object_10_C)
        else:
            return "NoseDoor"      # compuerta exterior (tz≈6.55)

    # 5. Spoiler ala derecha
    if tx < -0.5:
        return "SpoilerR"

    # 6. Fallback — lo que queda cerca del centro es tren
    return "NoseGear"

for start in bm.verts:
    if start.index in visited:
        continue
    comp = []
    stack = [start]
    while stack:
        v = stack.pop()
        if v.index in visited:
            continue
        visited.add(v.index)
        comp.append(v.index)
        for e in v.link_edges:
            nb = e.other_vert(v)
            if nb.index not in visited:
                stack.append(nb)

    ws  = [M @ orig.data.vertices[vi].co for vi in comp]
    cx  = sum(v.x for v in ws) / len(ws)
    cy  = sum(v.y for v in ws) / len(ws)
    cz  = sum(v.z for v in ws) / len(ws)
    z   = classify(cx, cy, cz)
    for vi in comp:
        zone_for_vert[vi] = z

bm.free()

ZONES = ["FlapL", "SpoilerL", "FlapR", "SpoilerR", "NoseFrontalStrut", "NoseCano", "NoseStrutAft", "NoseStrutFwd", "NoseStrutBase", "NoseDoor"]
for z in ZONES:
    n = sum(1 for v in zone_for_vert.values() if v == z)
    print(f"  {z:12s}: {n:6d} verts")

# ── 2. Duplicar → borrar verts fuera de zona ──────────────────────────────
for z in ZONES:
    if sum(1 for v in zone_for_vert.values() if v == z) == 0:
        print(f"  [skip] {z} vacío")
        continue

    bpy.ops.object.select_all(action='DESELECT')
    orig.select_set(True)
    bpy.context.view_layer.objects.active = orig
    bpy.ops.object.duplicate()
    new_obj = bpy.context.active_object
    new_obj.name       = f"Object_10_{z}"
    new_obj.data.name  = f"Object_10_{z}_mesh"

    bpy.ops.object.mode_set(mode='EDIT')
    bm2 = bmesh.from_edit_mesh(new_obj.data)
    bm2.verts.ensure_lookup_table()
    to_delete = [v for v in bm2.verts if zone_for_vert.get(v.index) != z]
    bmesh.ops.delete(bm2, geom=to_delete, context='VERTS')
    bmesh.update_edit_mesh(new_obj.data)
    bpy.ops.object.mode_set(mode='OBJECT')

    print(f"  → {new_obj.name}: {len(new_obj.data.vertices)} verts")

# ── 3. Eliminar el original ────────────────────────────────────────────────
bpy.data.objects.remove(orig, do_unlink=True)
# Limpiar mesh data huérfano
for mesh in list(bpy.data.meshes):
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)

# ── 4. Exportar ───────────────────────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format="GLB",
    use_selection=False,
    export_apply=False,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_yup=True,
)
print(f"\n[done] → {GLB_OUT}")
