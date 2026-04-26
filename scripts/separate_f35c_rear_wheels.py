"""
Separa llanta de strut en F-35C-BODY055 y F-35C-BODY056.
Usa "Separate by Loose Parts": si la llanta y el strut no comparten vértices
quedan como objetos distintos automáticamente.

Resultado esperado por mesh:
  F-35C-BODY055  →  F-35C-BODY055        (parte mayor = strut)
                    F-35C-BODY055_tire    (parte menor = llanta)
  F-35C-BODY056  →  F-35C-BODY056
                    F-35C-BODY056_tire

Exporta el GLB de vuelta a public/F-35C.glb.
"""

import bpy, sys

GLB_IN  = "C:/devs/f35/public/F-35C.glb"
GLB_OUT = "C:/devs/f35/public/F-35C.glb"
TARGETS = ["F-35C-BODY.055", "F-35C-BODY.056"]

# ── 1. Cargar GLB ─────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)
print("[sep] GLB cargado")

# ── 2. Para cada mesh objetivo, separar por partes sueltas ────────────────────
for target_name in TARGETS:
    obj = bpy.data.objects.get(target_name)
    if obj is None:
        print(f"[sep] WARN: no encontré '{target_name}'")
        continue
    if obj.type != "MESH":
        print(f"[sep] WARN: '{target_name}' no es MESH")
        continue

    # Contar partes sueltas antes de separar
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')

    # Separate by loose parts
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')

    # Recolectar los objetos resultantes (todos los que empiezan con el nombre base)
    parts = [o for o in bpy.data.objects if o.name.startswith(target_name) and o.type == 'MESH']
    print(f"[sep] '{target_name}' → {len(parts)} partes: {[p.name for p in parts]}")

    if len(parts) < 2:
        print(f"[sep] WARN: solo 1 parte — puede que la llanta y el strut compartan vértices")
        continue

    # La parte con menos vértices es la llanta
    parts.sort(key=lambda o: len(o.data.vertices))
    tire_obj  = parts[0]
    strut_obj = parts[-1]

    print(f"[sep]   strut: '{strut_obj.name}' ({len(strut_obj.data.vertices)} verts)")
    print(f"[sep]   tire : '{tire_obj.name}'  ({len(tire_obj.data.vertices)} verts)")

    # Renombrar: el strut conserva el nombre original, la llanta recibe _tire
    strut_obj.name      = target_name
    strut_obj.data.name = target_name
    tire_obj.name       = target_name + "_tire"
    tire_obj.data.name  = target_name + "_tire"

    print(f"[sep] renombrado: '{strut_obj.name}' + '{tire_obj.name}'")

# ── 3. Exportar GLB ───────────────────────────────────────────────────────────
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format='GLB',
    export_animations=True,
    export_skins=True,
    export_apply=False,
)
print(f"[sep] Exportado a {GLB_OUT}")
