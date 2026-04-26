"""
Separa llanta de strut en F-35C-BODY.055 y F-35C-BODY.056
usando bisect por el eje Y local (donde la densidad de verts cae).

  BODY.055 → BODY.055        (llanta, Y < 2.705)
              BODY.055_strut  (strut, Y ≥ 2.705)
  BODY.056 → BODY.056        (llanta, Y < 2.833)
              BODY.056_strut  (strut, Y ≥ 2.833)
"""
import bpy, bmesh, mathutils

GLB_IN  = "C:/devs/f35/public/F-35C.glb"
GLB_OUT = "C:/devs/f35/public/F-35C.glb"

CUTS = {
    "F-35C-BODY.055": 2.705,
    "F-35C-BODY.056": 2.833,
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)
print("[sep] GLB cargado")

for obj_name, y_cut in CUTS.items():
    obj = bpy.data.objects.get(obj_name)
    if not obj or obj.type != 'MESH':
        print(f"[sep] WARN: '{obj_name}' no encontrado")
        continue

    print(f"[sep] Procesando '{obj_name}'  corte Y={y_cut:.3f}")

    # Seleccionar el objeto
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # Entrar en edit mode y seleccionar verts con Y >= y_cut (strut)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')

    bm = bmesh.from_edit_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    strut_count = 0
    for v in bm.verts:
        if v.co.y >= y_cut:
            v.select = True
            strut_count += 1
    bmesh.update_edit_mesh(obj.data)
    print(f"[sep]   strut verts seleccionados: {strut_count}")

    # Separar selección → nuevo objeto (el strut)
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')

    # Ahora hay 2 objetos seleccionados: el original (llanta) y el nuevo (strut)
    # El último activo es el original; el otro es el separado
    # Identificar cuál es el strut (el que tiene obj_name.001)
    strut_candidates = [o for o in bpy.context.selected_objects if o != obj]
    if not strut_candidates:
        print(f"[sep] WARN: no se creó objeto strut para '{obj_name}'")
        continue

    strut_obj = strut_candidates[0]
    print(f"[sep]   strut separado: '{strut_obj.name}'  verts={len(strut_obj.data.vertices)}")
    print(f"[sep]   llanta restante: '{obj.name}'  verts={len(obj.data.vertices)}")

    # Renombrar strut
    strut_obj.name      = obj_name + "_strut"
    strut_obj.data.name = obj_name + "_strut"
    print(f"[sep]   renombrado a '{strut_obj.name}'")

# Exportar
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format='GLB',
    export_animations=True,
    export_skins=True,
    export_apply=False,
)
print(f"[sep] Exportado → {GLB_OUT}")
