"""
Separa Object_10_C en 3 objetos:
  Object_10_ArmR  → brazo lateral derecho (tx < -0.05, 6.25 < tz < 6.90)
  Object_10_ArmL  → brazo lateral izquierdo (tx > 0.05, 6.25 < tz < 6.90)
  Object_10_C     → resto del strut assembly
"""
import bpy, bmesh

GLB_IN  = r"C:\devs\f35\public\F-14-iran-v4.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v4.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_C"), None)
if not orig:
    print("[!] Object_10_C no encontrado"); raise SystemExit

M = orig.matrix_world
print(f"Object_10_C: {len(orig.data.vertices)} verts")

bm = bmesh.new()
bm.from_mesh(orig.data)
bm.verts.ensure_lookup_table()

visited = set()
zone_for_vert = {}

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
    tx  = cx
    ty  = cz    # altura Three.js
    tz  = -cy   # nariz

    if 6.25 < tz < 6.90 and -0.15 < tx < -0.05 and ty > -0.45:
        zone = "ArmR"
    elif 6.25 < tz < 6.90 and 0.05 < tx < 0.15 and ty > -0.45:
        zone = "ArmL"
    else:
        zone = "Strut"

    for vi in comp:
        zone_for_vert[vi] = zone

bm.free()

ZONES = ["ArmR", "ArmL", "Strut"]
for z in ZONES:
    n = sum(1 for v in zone_for_vert.values() if v == z)
    print(f"  {z:6s}: {n:6d} verts")

for z in ZONES:
    if sum(1 for v in zone_for_vert.values() if v == z) == 0:
        print(f"  [skip] {z} vacío"); continue

    bpy.ops.object.select_all(action='DESELECT')
    orig.select_set(True)
    bpy.context.view_layer.objects.active = orig
    bpy.ops.object.duplicate()
    new_obj = bpy.context.active_object

    name_map = {"ArmR": "Object_10_ArmR", "ArmL": "Object_10_ArmL", "Strut": "Object_10_C_new"}
    new_obj.name      = name_map[z]
    new_obj.data.name = name_map[z] + "_mesh"

    bpy.ops.object.mode_set(mode='EDIT')
    bm2 = bmesh.from_edit_mesh(new_obj.data)
    bm2.verts.ensure_lookup_table()
    to_delete = [v for v in bm2.verts if zone_for_vert.get(v.index) != z]
    bmesh.ops.delete(bm2, geom=to_delete, context='VERTS')
    bmesh.update_edit_mesh(new_obj.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    print(f"  → {new_obj.name}: {len(new_obj.data.vertices)} verts")

# Renombrar el nuevo Strut a Object_10_C y eliminar el original
bpy.data.objects.remove(orig, do_unlink=True)
strut_new = bpy.data.objects.get("Object_10_C_new")
if strut_new:
    strut_new.name      = "Object_10_C"
    strut_new.data.name = "Object_10_C_mesh"

for mesh in list(bpy.data.meshes):
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True,
)
print(f"\n[done] → {GLB_OUT}")
