"""
Separa la pieza pequeña aislada (cx≈±2.26, 6 verts) de Object_6_R y Object_6_L.
La parte principal (puntas de ala) queda como Object_6_R / Object_6_L.
La pieza chica queda como Object_6_R_fixed / Object_6_L_fixed.
"""
import bpy, bmesh, shutil

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_BAK = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb.bak16"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

for target_name in ["Object_6_R", "Object_6_L"]:
    orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == target_name), None)
    if not orig:
        print(f"[!] {target_name} no encontrado")
        continue

    # Encontrar componentes conectados
    bm = bmesh.new()
    bm.from_mesh(orig.data)
    bm.verts.ensure_lookup_table()

    visited = set()
    components = []
    for v in bm.verts:
        if v.index in visited:
            continue
        component = set()
        queue = [v]
        while queue:
            cur = queue.pop()
            if cur.index in visited:
                continue
            visited.add(cur.index)
            component.add(cur.index)
            for e in cur.link_edges:
                other = e.other_vert(cur)
                if other.index not in visited:
                    queue.append(other)
        components.append(component)
    bm.free()

    # El más pequeño es el rectángulo a separar
    components.sort(key=lambda c: len(c))
    small_verts = components[0]  # 6 verts = el rectangulo

    M = orig.matrix_world
    verts = [M @ orig.data.vertices[vi].co for vi in small_verts]
    cx = sum(v.x for v in verts) / len(verts)
    print(f"{target_name}: separando {len(small_verts)} verts en cx={cx:.2f} → {target_name}_fixed")

    # Seleccionar solo los vértices pequeños y separar
    bpy.ops.object.select_all(action="DESELECT")
    orig.select_set(True)
    bpy.context.view_layer.objects.active = orig
    bpy.ops.object.mode_set(mode="OBJECT")

    for v in orig.data.vertices:
        v.select = v.index in small_verts

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Renombrar la pieza separada
    separated = [o for o in bpy.context.selected_objects if o.type == "MESH" and o.name != target_name]
    for s in separated:
        s.name = f"{target_name}_fixed"
        if s.data: s.data.name = f"{target_name}_fixed"
        print(f"  → {s.name}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
