"""
Separa llanta de strut en F-35C-BODY.055 y F-35C-BODY.056 editando
el GLB directamente (sin Blender export).

Para cada mesh objetivo:
  1. Lee el accessor POSITION y filtra índices por Y threshold.
  2. Crea dos nuevos meshes (llanta + strut) con los vértices/índices correctos.
  3. Reemplaza el mesh original con el de la llanta.
  4. Agrega un nuevo nodo _strut parented al mismo parent.

El GLB usa Draco — lo leemos via glb-transform / parseado manual.
Como Draco está comprimido, usamos Blender Python para extraer coords.
"""

import bpy, bmesh, struct, json, os, sys
import numpy as np

GLB_IN  = "C:/devs/f35/public/F-35C.glb"
GLB_OUT = "C:/devs/f35/public/F-35C.glb"

CUTS = {
    "F-35C-BODY.055": 2.705,
    "F-35C-BODY.056": 2.833,
}

# ── 1. Cargar GLB en Blender ──────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)
print("[split] GLB cargado")

# ── 2. Para cada mesh, separar por Y usando bmesh manual ──────────────────────
for obj_name, y_cut in CUTS.items():
    obj = bpy.data.objects.get(obj_name)
    if not obj or obj.type != 'MESH':
        print(f"[split] WARN: '{obj_name}' no encontrado"); continue

    print(f"[split] {obj_name}  y_cut={y_cut}")

    # Obtener el mesh original
    orig_mesh = obj.data

    # ── Construir bmesh del original ──
    bm_orig = bmesh.new()
    bm_orig.from_mesh(orig_mesh)
    bm_orig.verts.ensure_lookup_table()
    bm_orig.faces.ensure_lookup_table()

    total_verts = len(bm_orig.verts)
    total_faces = len(bm_orig.faces)
    print(f"[split]   original: {total_verts} verts, {total_faces} faces")

    # ── Clasificar verts ──
    strut_vert_ids = set(v.index for v in bm_orig.verts if v.co.y >= y_cut)
    tire_vert_ids  = set(v.index for v in bm_orig.verts if v.co.y <  y_cut)
    print(f"[split]   strut verts: {len(strut_vert_ids)}  tire verts: {len(tire_vert_ids)}")

    # ── Separar en dos bmesh ──
    # Una cara pertenece al strut si TODOS sus verts son strut, sino a llanta
    bm_tire  = bmesh.new()
    bm_strut = bmesh.new()

    def copy_subset(bm_src, bm_dst, vert_ids_keep):
        """Copia verts y caras a bm_dst; copia caras donde al menos 1 vert está en vert_ids_keep."""
        # Solo copiar caras donde TODOS los verts están en el set (corte limpio)
        # Caras en el límite se quedan en la llanta
        vert_map = {}
        for face in bm_src.faces:
            face_vids = [v.index for v in face.verts]
            if all(vid in vert_ids_keep for vid in face_vids):
                new_verts = []
                for v in face.verts:
                    if v.index not in vert_map:
                        nv = bm_dst.verts.new(v.co)
                        nv.normal = v.normal
                        vert_map[v.index] = nv
                    new_verts.append(vert_map[v.index])
                try:
                    bm_dst.faces.new(new_verts)
                except ValueError:
                    pass  # cara duplicada

    copy_subset(bm_orig, bm_strut, strut_vert_ids)
    # Llanta = todas las demás caras (incluye caras de borde)
    tire_face_ids = set()
    for face in bm_orig.faces:
        face_vids = [v.index for v in face.verts]
        if not all(vid in strut_vert_ids for vid in face_vids):
            tire_face_ids.add(face.index)
    vert_map_t = {}
    for face in bm_orig.faces:
        if face.index not in tire_face_ids: continue
        new_verts = []
        for v in face.verts:
            if v.index not in vert_map_t:
                nv = bm_tire.verts.new(v.co)
                nv.normal = v.normal
                vert_map_t[v.index] = nv
            new_verts.append(vert_map_t[v.index])
        try:
            bm_tire.faces.new(new_verts)
        except ValueError:
            pass

    print(f"[split]   llanta: {len(bm_tire.verts)} verts, {len(bm_tire.faces)} faces")
    print(f"[split]   strut : {len(bm_strut.verts)} verts, {len(bm_strut.faces)} faces")

    bm_orig.free()

    # ── Actualizar mesh original con llanta ──
    bm_tire.to_mesh(orig_mesh)
    bm_tire.free()
    orig_mesh.update()

    # ── Crear nuevo objeto strut ──
    strut_mesh = bpy.data.meshes.new(obj_name + "_strut")
    bm_strut.to_mesh(strut_mesh)
    bm_strut.free()
    strut_mesh.update()

    strut_obj = bpy.data.objects.new(obj_name + "_strut", strut_mesh)
    # Mismo parent y transform que el original
    strut_obj.parent = obj.parent
    strut_obj.matrix_world = obj.matrix_world.copy()
    bpy.context.scene.collection.objects.link(strut_obj)
    print(f"[split]   creado '{strut_obj.name}'")

# ── 3. Exportar GLB ───────────────────────────────────────────────────────────
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format='GLB',
    export_animations=True,
    export_skins=True,
    export_apply=False,
)
print(f"[split] Exportado → {GLB_OUT}")
