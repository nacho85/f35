"""
Separa BODY055 y BODY056 en llanta + strut usando corte en Y local.
  BODY055: llanta Y < 2.67,  strut Y >= 2.67
  BODY056: llanta Y < 2.82,  strut Y >= 2.82
"""
import bpy, bmesh

GLB = "C:/devs/f35/public/F-35C.glb"
CUTS = {
    "F-35C-BODY.055": 2.67,
    "F-35C-BODY.056": 2.82,
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
print("[split] cargado")

def split_mesh(obj_name, y_cut):
    obj = bpy.data.objects.get(obj_name)
    assert obj and obj.type == 'MESH', f"no encontrado: {obj_name}"

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    strut_ids = {v.index for v in bm.verts if v.co.y >= y_cut}
    tire_ids  = {v.index for v in bm.verts if v.co.y <  y_cut}
    print(f"[split] {obj_name}: {len(bm.verts)} verts — llanta {len(tire_ids)}, strut {len(strut_ids)}")

    def extract(bm_src, vert_ids):
        bm_dst = bmesh.new()
        vmap = {}
        for face in bm_src.faces:
            if not all(v.index in vert_ids for v in face.verts):
                continue
            new_vs = []
            for v in face.verts:
                if v.index not in vmap:
                    nv = bm_dst.verts.new(v.co)
                    nv.normal = v.normal
                    vmap[v.index] = nv
                new_vs.append(vmap[v.index])
            try: bm_dst.faces.new(new_vs)
            except ValueError: pass
        return bm_dst

    bm_tire  = extract(bm, tire_ids)
    bm_strut = extract(bm, strut_ids)
    print(f"         llanta mesh: {len(bm_tire.verts)} verts / {len(bm_tire.faces)} faces")
    print(f"         strut  mesh: {len(bm_strut.verts)} verts / {len(bm_strut.faces)} faces")
    bm.free()

    # Reemplazar geometría original por llanta
    bm_tire.to_mesh(obj.data); bm_tire.free(); obj.data.update()

    # Crear objeto strut
    strut_mesh = bpy.data.meshes.new(obj_name + "_strut")
    bm_strut.to_mesh(strut_mesh); bm_strut.free(); strut_mesh.update()
    strut_obj = bpy.data.objects.new(obj_name + "_strut", strut_mesh)
    strut_obj.parent = obj.parent
    strut_obj.matrix_world = obj.matrix_world.copy()
    bpy.context.scene.collection.objects.link(strut_obj)
    print(f"[split] creado '{strut_obj.name}'")

for name, cut in CUTS.items():
    split_mesh(name, cut)

bpy.ops.export_scene.gltf(
    filepath=GLB,
    export_format='GLB',
    export_animations=True,
    export_skins=True,
    export_apply=False,
)
print(f"[split] exportado → {GLB}")
