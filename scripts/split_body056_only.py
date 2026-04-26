"""
Separa F-35C-BODY.056 en llanta + strut (corte en local Y = 2.833).
  F-35C-BODY.056        → llanta (Y < 2.833)
  F-35C-BODY.056_strut  → strut  (Y ≥ 2.833)
"""
import bpy, bmesh

GLB = "C:/devs/f35/public/F-35C.glb"
OBJ_NAME = "F-35C-BODY.056"
Y_CUT    = 2.833

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
print("[split] cargado")

obj = bpy.data.objects.get(OBJ_NAME)
assert obj and obj.type == 'MESH', f"no encontrado: {OBJ_NAME}"

orig_mesh = obj.data
bm_orig   = bmesh.new()
bm_orig.from_mesh(orig_mesh)
bm_orig.verts.ensure_lookup_table()
bm_orig.faces.ensure_lookup_table()
print(f"[split] {OBJ_NAME}: {len(bm_orig.verts)} verts, {len(bm_orig.faces)} faces")

strut_ids = set(v.index for v in bm_orig.verts if v.co.y >= Y_CUT)

bm_tire  = bmesh.new()
bm_strut = bmesh.new()

def copy_faces(bm_src, bm_dst, vert_ids):
    vmap = {}
    for face in bm_src.faces:
        if not all(v.index in vert_ids for v in face.verts):
            continue
        new_vs = []
        for v in face.verts:
            if v.index not in vmap:
                nv = bm_dst.verts.new(v.co); nv.normal = v.normal
                vmap[v.index] = nv
            new_vs.append(vmap[v.index])
        try: bm_dst.faces.new(new_vs)
        except ValueError: pass

copy_faces(bm_orig, bm_strut, strut_ids)

# Llanta = caras donde NO todos los verts son strut
tire_ids = set(v.index for v in bm_orig.verts)
vmap_t = {}
for face in bm_orig.faces:
    if all(v.index in strut_ids for v in face.verts):
        continue
    new_vs = []
    for v in face.verts:
        if v.index not in vmap_t:
            nv = bm_tire.verts.new(v.co); nv.normal = v.normal
            vmap_t[v.index] = nv
        new_vs.append(vmap_t[v.index])
    try: bm_tire.faces.new(new_vs)
    except ValueError: pass

print(f"[split] llanta: {len(bm_tire.verts)} verts / {len(bm_tire.faces)} faces")
print(f"[split] strut : {len(bm_strut.verts)} verts / {len(bm_strut.faces)} faces")

bm_orig.free()

bm_tire.to_mesh(orig_mesh); bm_tire.free(); orig_mesh.update()

strut_mesh = bpy.data.meshes.new(OBJ_NAME + "_strut")
bm_strut.to_mesh(strut_mesh); bm_strut.free(); strut_mesh.update()

strut_obj = bpy.data.objects.new(OBJ_NAME + "_strut", strut_mesh)
strut_obj.parent = obj.parent
strut_obj.matrix_world = obj.matrix_world.copy()
bpy.context.scene.collection.objects.link(strut_obj)
print(f"[split] creado '{strut_obj.name}'")

bpy.ops.export_scene.gltf(
    filepath=GLB,
    export_format='GLB',
    export_animations=True,
    export_skins=True,
    export_apply=False,
)
print(f"[split] exportado → {GLB}")
