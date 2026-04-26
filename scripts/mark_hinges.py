"""
Para cada compuerta del tren delantero:
- Detecta el borde de bisagra (edge extremo según tipo de compuerta)
- Crea una esfera marcadora en el punto medio de ese borde
- Exporta al GLB para visualización
"""
import bpy, bmesh
from mathutils import Vector
import math

GLB_IN  = r"C:\devs\f35\public\F-14-iran-v4.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran-v4.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

# Estrategia de bisagra por pieza:
# "min_tx" → hinge en el borde más cercano al centro (tx mínimo)
# "max_tx" → hinge en el borde más lejano al centro (tx máximo)  
# "max_ty" → hinge en el borde superior (pegado al fuselaje)
# "min_tz" → hinge en el borde más hacia la cola (tz mínimo)
# "max_tz" → hinge en el borde más hacia la nariz (tz máximo)

DOORS = {
    "Object_10_NoseDoorCtrL":  "min_tx",   # bisagra al centro del fuselaje
    "Object_9_NoseDoorCtrR":   "max_tx",   # bisagra al centro (lado der = tx negativo → max)
    "Object_14_NoseDoorFwdL":  "max_ty",   # bisagra arriba
    "Object_14_NoseDoorFwdR":  "max_ty",   # bisagra arriba
    "Object_14_NoseDoorAft":   "max_ty",   # bisagra arriba
}

def get_hinge_point(obj, strategy, threshold_pct=0.05):
    """Devuelve el centroide de los vértices en el borde extremo."""
    M = obj.matrix_world
    verts = [M @ v.co for v in obj.data.vertices]

    if strategy == "min_tx":
        vals = [v.x for v in verts]
        mn, mx = min(vals), max(vals)
        limit = mn + (mx - mn) * threshold_pct
        edge_verts = [v for v in verts if v.x <= limit]
    elif strategy == "max_tx":
        vals = [v.x for v in verts]
        mn, mx = min(vals), max(vals)
        limit = mx - (mx - mn) * threshold_pct
        edge_verts = [v for v in verts if v.x >= limit]
    elif strategy == "max_ty":
        vals = [v.z for v in verts]  # Blender Z = Three.js Y
        mn, mx = min(vals), max(vals)
        limit = mx - (mx - mn) * threshold_pct
        edge_verts = [v for v in verts if v.z >= limit]
    elif strategy == "min_tz":
        vals = [-v.y for v in verts]  # tz = -By
        mn, mx = min(vals), max(vals)
        limit = mn + (mx - mn) * threshold_pct
        edge_verts = [v for v in verts if -v.y <= limit]
    elif strategy == "max_tz":
        vals = [-v.y for v in verts]
        mn, mx = min(vals), max(vals)
        limit = mx - (mx - mn) * threshold_pct
        edge_verts = [v for v in verts if -v.y >= limit]

    n = len(edge_verts)
    cx = sum(v.x for v in edge_verts) / n
    cy = sum(v.y for v in edge_verts) / n
    cz = sum(v.z for v in edge_verts) / n
    return Vector((cx, cy, cz))  # Blender world coords

print(f"\n{'Object':<30} {'tx':>8} {'ty':>8} {'tz':>8}")
print("-" * 60)

for name, strategy in DOORS.items():
    obj = bpy.data.objects.get(name)
    if not obj:
        print(f"{name:<30} [NOT FOUND]")
        continue

    hinge = get_hinge_point(obj, strategy)
    tx = hinge.x
    ty = hinge.z   # Three.js y
    tz = -hinge.y  # Three.js z
    print(f"{name:<30} {tx:>8.3f} {ty:>8.3f} {tz:>8.3f}")

    # Crear esfera marcadora
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03, location=hinge)
    sphere = bpy.context.active_object
    sphere.name = f"_hinge_{name}"

    # Material rojo
    mat = bpy.data.materials.new(name=f"_hinge_mat_{name}")
    mat.use_nodes = False
    mat.diffuse_color = (1, 0, 0, 1)
    sphere.data.materials.append(mat)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True,
)
print(f"\n[done] -> {GLB_OUT}")
