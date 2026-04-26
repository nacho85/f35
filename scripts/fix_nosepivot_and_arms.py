"""
Separa NosePivot correctamente:
  - tz > 6.55, ty en [-0.285, -0.275] → queda en NosePivot (capa pin)
  - tz > 6.55, tx > 0.05, ty fuera del rango → va a ArmL
  - tz > 6.55, tx < -0.05, ty fuera del rango → va a ArmR
  - tz <= 6.55, |tx| > 0.05 → se elimina (cuerpos de brazo)
"""
import bpy, bmesh

GLB_IN  = r"C:\devs\f35\public\F-14-iran-v4.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v4.glb"

TY_NP_LO = -0.285   # límite inferior capa NosePivot
TY_NP_HI = -0.275   # límite superior capa NosePivot
TZ_UPPER  =  6.55   # por encima: zona de conexión

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

pivot = next(o for o in bpy.data.objects if o.type=="MESH" and o.name=="Object_10_NosePivot")
arml  = next(o for o in bpy.data.objects if o.type=="MESH" and o.name=="Object_10_ArmL")
armr  = next(o for o in bpy.data.objects if o.type=="MESH" and o.name=="Object_10_ArmR")
M = pivot.matrix_world

print(f"NosePivot: {len(pivot.data.vertices)}v  ArmL: {len(arml.data.vertices)}v  ArmR: {len(armr.data.vertices)}v")

# Clasificar cada vértice de NosePivot
zone = {}   # vi -> "np" | "arml" | "armr" | "del"
for v in pivot.data.vertices:
    w = M @ v.co
    tx, ty, tz = w.x, w.z, -w.y  # Three.js
    if tz > TZ_UPPER:
        if TY_NP_LO <= ty <= TY_NP_HI:
            zone[v.index] = "np"
        elif tx > 0.05:
            zone[v.index] = "arml"
        elif tx < -0.05:
            zone[v.index] = "armr"
        else:
            zone[v.index] = "np"   # central, mantener
    else:
        # cuerpos de brazo - eliminar
        zone[v.index] = "del"

counts = {z: sum(1 for v in zone.values() if v==z) for z in ["np","arml","armr","del"]}
print(f"  np={counts['np']}  →ArmL={counts['arml']}  →ArmR={counts['armr']}  del={counts['del']}")

def extract_zone(src_obj, dst_obj, zone_dict, target_zone, tmp_name):
    """Duplica src, borra todo lo que NO sea target_zone, fusiona con dst."""
    bpy.ops.object.select_all(action='DESELECT')
    src_obj.select_set(True); bpy.context.view_layer.objects.active = src_obj
    bpy.ops.object.duplicate()
    tmp = bpy.context.active_object; tmp.name = tmp_name
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(tmp.data); bm.verts.ensure_lookup_table()
    to_del = [v for v in bm.verts if zone_dict.get(v.index) != target_zone]
    bmesh.ops.delete(bm, geom=to_del, context='VERTS')
    bmesh.update_edit_mesh(tmp.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    print(f"  {tmp_name}: {len(tmp.data.vertices)}v → join {dst_obj.name}")
    bpy.ops.object.select_all(action='DESELECT')
    tmp.select_set(True); dst_obj.select_set(True)
    bpy.context.view_layer.objects.active = dst_obj
    bpy.ops.object.join()
    print(f"  {dst_obj.name} ahora: {len(dst_obj.data.vertices)}v")

extract_zone(pivot, arml, zone, "arml", "_tmp_arml_")
extract_zone(pivot, armr, zone, "armr", "_tmp_armr_")

# Ahora limpiar NosePivot: borrar todo lo que NO sea "np"
bpy.ops.object.select_all(action='DESELECT')
pivot.select_set(True); bpy.context.view_layer.objects.active = pivot
bpy.ops.object.mode_set(mode='EDIT')
bm2 = bmesh.from_edit_mesh(pivot.data); bm2.verts.ensure_lookup_table()
to_del = [v for v in bm2.verts if zone.get(v.index) != "np"]
bmesh.ops.delete(bm2, geom=to_del, context='VERTS')
bmesh.update_edit_mesh(pivot.data)
bpy.ops.object.mode_set(mode='OBJECT')
print(f"NosePivot final: {len(pivot.data.vertices)}v")
print(f"ArmL final:      {len(arml.data.vertices)}v")
print(f"ArmR final:      {len(armr.data.vertices)}v")

for mesh in list(bpy.data.meshes):
    if mesh.users == 0: bpy.data.meshes.remove(mesh)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True,
)
print(f"[done] → {GLB_OUT}")
