"""
Analiza el tren delantero del F-14A y determina el pivot de bisagra.

F-14A nose gear mechanics:
  - La rueda retracta HACIA ADELANTE (hacia la nariz) girando ~90°
  - La bisagra es un eje LATERAL (X) ubicado en el extremo TRASERO-SUPERIOR del strut
  - Desplegado:  strut cuelga recto hacia abajo
  - Retractado:  strut gira hacia la nariz y queda horizontal dentro del bay
  - Eje rotación: X (spanwise)
  - Dirección:   rotation.x negativo en Three.js (fondo del strut va hacia +Z = nariz)

Coordenadas:
  Blender (antes de export Y-up) ↔ Three.js
    Blender X  =  Three.js X
    Blender Z  =  Three.js Y  (arriba)
    Blender -Y =  Three.js Z  (hacia la nariz = +Z Three.js = -Y Blender)

  Por eso la bisagra en Blender está en:
    X = 0  (centrado)
    Z = max(Z) del conjunto  (punto más alto = Three.js Y más alto)
    Y = max(Y) del conjunto  (más alejado de la nariz = Three.js Z más bajo = extremo TRASERO)

Genera F-14-iran-pivot-test.glb con un Empty visible en la posición calculada.
"""
import bpy
from mathutils import Vector

GLB_IN  = r"C:\devs\f35\public\F-14-iran.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-pivot-test.glb"

NOSE_GEAR_NAMES = ["Object_9", "Object_23", "Object_10_C", "Object_14_C"]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

gear_objs = [o for o in bpy.data.objects if o.type == "MESH" and o.name in NOSE_GEAR_NAMES]
if not gear_objs:
    print("[!] No se encontraron piezas del tren delantero"); raise SystemExit

# Bounding box combinado en world space
min_co = Vector((float('inf'),)*3)
max_co = Vector((float('-inf'),)*3)

for obj in gear_objs:
    obj.update_from_editmode() if obj.mode == 'EDIT' else None
    M = obj.matrix_world
    for v in obj.data.vertices:
        w = M @ v.co
        min_co.x = min(min_co.x, w.x)
        min_co.y = min(min_co.y, w.y)
        min_co.z = min(min_co.z, w.z)
        max_co.x = max(max_co.x, w.x)
        max_co.y = max(max_co.y, w.y)
        max_co.z = max(max_co.z, w.z)

center = (min_co + max_co) / 2

print(f"\n=== Bounding box tren delantero (Blender world) ===")
print(f"  min: x={min_co.x:.3f}  y={min_co.y:.3f}  z={min_co.z:.3f}")
print(f"  max: x={max_co.x:.3f}  y={max_co.y:.3f}  z={max_co.z:.3f}")
print(f"  center: x={center.x:.3f}  y={center.y:.3f}  z={center.z:.3f}")

# Bisagra F-14A nose gear:
#   X = center (centrado en fuselaje)
#   Z = max_Z  (punto más alto = top del strut)
#   Y = max_Y  (extremo más alejado de la nariz = lado TRASERO del bay)
#              max_Y en Blender = min_Z en Three.js = aft end
hinge_blender = Vector((center.x, max_co.y, max_co.z))

# Equivalente en Three.js
# Three.js x = Blender x
# Three.js y = Blender z
# Three.js z = -Blender y
hinge_threejs = Vector((hinge_blender.x, hinge_blender.z, -hinge_blender.y))

print(f"\n=== Bisagra calculada ===")
print(f"  Blender: x={hinge_blender.x:.3f}  y={hinge_blender.y:.3f}  z={hinge_blender.z:.3f}")
print(f"  Three.js: x={hinge_threejs.x:.3f}  y={hinge_threejs.y:.3f}  z={hinge_threejs.z:.3f}")
print(f"\n  → En F14.jsx usar:")
print(f"    ngPivot.position.set({hinge_threejs.x:.3f}, {hinge_threejs.y:.3f}, {hinge_threejs.z:.3f})")
print(f"    rotation.x target desplegado:  0")
print(f"    rotation.x target retractado: -1.57  (≈ -π/2, rueda va hacia +Z nariz)")

# Crear un Empty en la bisagra para verificar visualmente
bpy.ops.object.empty_add(type='ARROWS', radius=0.3, location=hinge_blender)
empty = bpy.context.active_object
empty.name = "NoseGear_Hinge"

# Exportar
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
