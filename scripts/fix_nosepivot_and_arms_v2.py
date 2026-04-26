"""
NosePivot corrección final:
  - tz > 6.55, ty en [-0.285, -0.275]        → KEEP en NosePivot (capa pin)
  - tz > 6.55, tx > 0.05, ty fuera del rango  → mover a ArmL (le faltaba)
  - tz > 6.55, tx < -0.05, ty fuera del rango → ELIMINAR (ArmR ya los tiene)
  - tz <= 6.55, cualquier tx                   → ELIMINAR (cuerpos de brazo)
"""
import bpy, bmesh

GLB_IN  = r"C:\devs\f35\public\F-14-iran-v4.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v4.glb"

TY_NP_LO = -0.285
TY_NP_HI = -0.275
TZ_UPPER  =  6.55

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

pivot = next(o for o in bpy.data.objects if o.type=="MESH" and o.name=="Object_10_NosePivot")
arml  = next(o for o in bpy.data.objects if o.type=="MESH" and o.name=="Object_10_ArmL")
M = pivot.matrix_world

print(f"NosePivot: {len(pivot.data.vertices)}v  ArmL: {len(arml.data.vertices)}v")

zone = {}
for v in pivot.data.vertices:
    w = M @ v.co
    tx, ty, tz = w.x, w.z, -w.y
    if tz > TZ_UPPER:
        if TY_NP_LO <= ty <= TY_NP_HI:
            zone[v.index] = "np"
        elif tx > 0.05:
            zone[v.index] = "arml"
        else:
            zone[v.index] = "del"  # ArmR ya los tiene
    else:
        zone[v.index] = "del"

counts = {z: sum(1 for v in zone.values() if v==z) for z in ["np","arml","del"]}
print(f"  np={counts['np']}  →ArmL={counts['arml']}  del={counts['del']}")

# Extraer verts de ArmL y fusionar
bpy.ops.object.select_all(action='DESELECT')
pivot.select_set(True); bpy.context.view_layer.objects.active = pivot
bpy.ops.object.duplicate()
tmp = bpy.context.active_object; tmp.name = "_tmp_arml_"
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(tmp.data); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[v for v in bm.verts if zone.get(v.index) != "arml"], context='VERTS')
bmesh.update_edit_mesh(tmp.data)
bpy.ops.object.mode_set(mode='OBJECT')
print(f"  extraído para ArmL: {len(tmp.data.vertices)}v")

bpy.ops.object.select_all(action='DESELECT')
tmp.select_set(True); arml.select_set(True)
bpy.context.view_layer.objects.active = arml
bpy.ops.object.join()
print(f"  ArmL ahora: {len(arml.data.vertices)}v")

# Limpiar NosePivot
bpy.ops.object.select_all(action='DESELECT')
pivot.select_set(True); bpy.context.view_layer.objects.active = pivot
bpy.ops.object.mode_set(mode='EDIT')
bm2 = bmesh.from_edit_mesh(pivot.data); bm2.verts.ensure_lookup_table()
bmesh.ops.delete(bm2, geom=[v for v in bm2.verts if zone.get(v.index) != "np"], context='VERTS')
bmesh.update_edit_mesh(pivot.data)
bpy.ops.object.mode_set(mode='OBJECT')
print(f"NosePivot final: {len(pivot.data.vertices)}v")

for mesh in list(bpy.data.meshes):
    if mesh.users == 0: bpy.data.meshes.remove(mesh)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True,
)
print(f"[done] → {GLB_OUT}")
