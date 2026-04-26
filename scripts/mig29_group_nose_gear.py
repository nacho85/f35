"""
Agrupa todos los fragmentos del tren delantero del MiG-29 en piezas lógicas,
las nombra y las pinta de colores distintos. Exporta un GLB de diagnóstico.
"""
import bpy, mathutils, math, sys

GLB_IN  = r"C:\devs\f35\public\mig-29-iran.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-nose-gear-groups.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

# ── Separar Object_16 en loose parts ──────────────────────────────────────────
obj16 = bpy.data.objects.get("Object_16")
for o in bpy.data.objects: o.hide_set(o != obj16)
bpy.context.view_layer.objects.active = obj16
bpy.ops.object.select_all(action="DESELECT")
obj16.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.hide_set(False)

all_parts = [o for o in bpy.data.objects
             if o.type == "MESH" and (o.name == "Object_16" or o.name.startswith("Object_16."))]

def bbox(o):
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
    return min(xs),max(xs), min(ys),max(ys), min(zs),max(zs)

def centroid(o):
    x0,x1,y0,y1,z0,z1 = bbox(o)
    return (x0+x1)/2, (y0+y1)/2, (z0+z1)/2

def vol(o):
    x0,x1,y0,y1,z0,z1 = bbox(o)
    return (x1-x0)*(y1-y0)*(z1-z0)

# ── Filtrar zona tren delantero (X=30-70, |Y|<8, Z<0) ─────────────────────────
nose = []
for o in all_parts:
    cx,cy,cz = centroid(o)
    if 30 < cx < 70 and abs(cy) < 8 and cz < 0:
        nose.append(o)

print(f"\nPartes zona nariz: {len(nose)}")

# ── Clasificación heurística ──────────────────────────────────────────────────

groups = {
    "compuerta_delantera_R": [],  # compuerta bay derecha  (Blender cy<0 → Three.js Z>0)
    "compuerta_delantera_L": [],  # compuerta bay izquierda (Blender cy>0 → Three.js Z<0)
    "compuerta_pequena":     [],  # pequeña puerta pegada al strut frontal
    "strut":                 [],  # columna/amortiguador + rueda + tijeras
    "misc":                  [],  # resto
}

for o in nose:
    cx,cy,cz = centroid(o)

    # Compuerta pequeña: paneles profundos (cz<-5) en cx>58, o links tijera (cx>61)
    if abs(cy) < 2.5 and (
        (cx > 58 and cz < -5) or
        (cx > 61)
    ):
        groups["compuerta_pequena"].append(o)

    # Compuertas bay: zona X=35-58, laterales (|cy|>2.5), vientre (Z=-1 a -6.5)
    elif 35 < cx < 58 and abs(cy) > 2.5 and -6.5 < cz < -1:
        if cy < 0: groups["compuerta_delantera_R"].append(o)
        else:      groups["compuerta_delantera_L"].append(o)

    # Strut + rueda + eje: X>48, cerca del centro, profundo en Z
    elif cx > 48 and abs(cy) < 4 and cz < -4:
        groups["strut"].append(o)

    else:
        groups["misc"].append(o)

# ── Colores por grupo ─────────────────────────────────────────────────────────
COLORS = {
    "compuerta_delantera_R": (0.0, 0.8, 1.0, 1),   # cyan
    "compuerta_delantera_L": (0.0, 0.4, 1.0, 1),   # azul
    "compuerta_pequena":     (0.0, 1.0, 0.5, 1),   # verde agua
    "strut":                 (0.2, 1.0, 0.2, 1),   # verde
    "misc":                  (0.8, 0.8, 0.4, 1),   # amarillo pálido
}

print("\n=== Grupos ===")
for gname, parts in groups.items():
    if not parts: continue
    print(f"\n  [{gname}]  ({len(parts)} partes)")
    for o in parts:
        cx,cy,cz = centroid(o)
        print(f"    {o.name}  cx={cx:.1f} cy={cy:.2f} cz={cz:.2f} vol={vol(o):.1f} nv={len(o.data.vertices)}")

    # solo renombrar, sin pintar
    for o in parts:
        o.name = f"{gname}__{o.name.split('.')[-1]}"

sys.stdout.flush()

# ── Exportar solo las partes de nariz ─────────────────────────────────────────
bpy.ops.object.select_all(action="DESELECT")
for parts in groups.values():
    for o in parts:
        o.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format="GLB",
    use_selection=True,
    export_image_format="AUTO",
    export_animations=False,
)
print(f"\nOK → {GLB_OUT}")
