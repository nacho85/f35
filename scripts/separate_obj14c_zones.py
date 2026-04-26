"""
Separa de Object_14_C las partes que NO son tren delantero (stray),
usando la misma lógica confirmada visualmente en F14.jsx:

  Three.js isStray:
    y > 1.2                                    → frame cockpit
    abs(x) > 2.5                               → rectángulos R/L
    x < -0.3 AND x > -2.5 AND z < 5           → intake + turbina (excluye zona nariz)

  En coordenadas Blender (Y-up export: Blender.Z = Three.Y, Blender.Y = -Three.Z):
    w.z > 1.2
    abs(w.x) > 2.5
    w.x < -0.3 AND w.x > -2.5 AND w.y > -5   (w.y > -5  ↔  Three.z < 5)

Resultado:
  - Object_14_C          → solo tren delantero (compuertas + mecanismo)
  - Object_14C_stray     → intake, frame cockpit, rectángulos (no se borran)

Guarda en F-14-iran-v3.glb. No toca el original ni backups existentes.
"""
import bpy, bmesh

GLB_IN  = r"C:\devs\f35\public\F-14-iran.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v3.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_14_C"), None)
if not obj:
    print("[!] Object_14_C no encontrado"); raise SystemExit

M = obj.matrix_world
print(f"Object_14_C: {len(obj.data.vertices)} verts")

# Crear vertex group para los stray
vg = obj.vertex_groups.new(name="stray")
stray_indices = []
gear_indices  = []

for v in obj.data.vertices:
    w = M @ v.co
    is_stray = (
        w.z > 1.2 or      # Three.js y > 1.2  → frame cockpit
        abs(w.x) > 2.5 or # rectángulos R/L
        w.x < -0.3 or     # intake + turbina (cualquier z)
        w.y > -5          # Three.js z < 5 → lejos de la nariz, no es tren delantero
    )
    if is_stray:
        stray_indices.append(v.index)
    else:
        gear_indices.append(v.index)

vg.add(stray_indices, 1.0, 'REPLACE')
print(f"  stray: {len(stray_indices)} verts")
print(f"  gear:  {len(gear_indices)} verts")

# Seleccionar los stray y separar
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj

obj.vertex_groups.active = vg
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.vertex_group_select()
bpy.ops.mesh.separate(type='SELECTED')
bpy.ops.object.mode_set(mode='OBJECT')

# Renombrar el objeto nuevo (el stray)
new_obj = next((o for o in bpy.context.selected_objects if o != obj and o.type == "MESH"), None)
if new_obj:
    new_obj.name = "Object_14C_stray"
    new_obj.data.name = "Object_14C_stray_mesh"
    print(f"  → Object_14C_stray: {len(new_obj.data.vertices)} verts")

# Object_14_C queda con solo el tren delantero
print(f"  → Object_14_C (tren delantero): {len(obj.data.vertices)} verts")

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
