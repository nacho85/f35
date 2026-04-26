"""
Split Object_20_C en partes lógicas por cluster de centroides:
  - Object_20_canopy   : marco del cockpit (Y > 1.3)
  - Object_20_nozzle_C : tobera central (|X| < 0.5, Y < -4.4, Z > 1.0)
  - Object_20_nozzle_R : pétalos/detalles tobera derecha (X > 0.44, Y < -5.4)
  - Object_20_tail_C   : resto (segmento de ala/cola en Y≈6.5)
"""
import bpy

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = bpy.data.objects.get("Object_20_C")
if not obj:
    print("Object_20_C no encontrado"); raise SystemExit

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.duplicate()
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

pieces = [o for o in bpy.context.selected_objects if o.type == "MESH"]

buckets = {"canopy": [], "nozzle_C": [], "nozzle_R": [], "tail_C": []}

for p in pieces:
    M = p.matrix_world
    verts = [M @ v.co for v in p.data.vertices]
    cx = sum(v.x for v in verts) / len(verts)
    cy = sum(v.y for v in verts) / len(verts)
    cz = sum(v.z for v in verts) / len(verts)

    if cy > 1.3:
        buckets["canopy"].append(p)
    elif abs(cx) < 0.5 and cy < -4.4 and cz > 1.0:
        buckets["nozzle_C"].append(p)
    elif cx > 0.44 and cy < -5.4:
        buckets["nozzle_R"].append(p)
    else:
        buckets["tail_C"].append(p)

for key, group in buckets.items():
    print(f"  {key}: {len(group)} piezas")
    if not group:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for p in group:
        p.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    bpy.ops.object.join()
    bpy.context.active_object.name = f"Object_20_{key}"

# Eliminar original duplicado
for o in bpy.data.objects:
    if o.type == "MESH" and o.name.startswith("Object_20_C."):
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
