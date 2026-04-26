"""
Extrae solo las loose parts pequeñas (rectángulos aislados) de Object_27 y Object_28.
La pieza principal del ala (la más grande por vértices) queda intacta.
Las piezas pequeñas se nombran Object_27_rect_00, Object_27_rect_01, etc.
"""
import bpy, bmesh, shutil

GLB_IN  = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
GLB_BAK = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb.bak16"
GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

shutil.copy2(GLB_IN, GLB_BAK)
print(f"Backup → {GLB_BAK}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

for target_name in ["Object_27", "Object_28"]:
    orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == target_name), None)
    if not orig:
        print(f"[!] {target_name} no encontrado")
        continue

    # Analizar componentes conectados con BMesh
    bm = bmesh.new()
    bm.from_mesh(orig.data)
    bm.verts.ensure_lookup_table()

    visited = set()
    components = []
    for v in bm.verts:
        if v.index in visited:
            continue
        # BFS para encontrar componente conectado
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

    # Ordenar por tamaño — el más grande es la geometría principal del ala
    components.sort(key=lambda c: len(c), reverse=True)
    print(f"\n--- {target_name}: {len(components)} componentes ---")
    M = orig.matrix_world
    for i, comp in enumerate(components):
        verts = [orig.data.vertices[vi].co for vi in comp]
        xs = [M @ v for v in verts]
        cx = sum(v.x for v in xs) / len(xs)
        cy = sum(v.y for v in xs) / len(xs)
        cz = sum(v.z for v in xs) / len(xs)
        label = "PRINCIPAL" if i == 0 else f"rect_{i-1:02d}"
        print(f"  [{i}] {len(comp):>6} verts  cx={cx:.2f} cy={cy:.2f} cz={cz:.2f}  → {label}")

    if len(components) <= 1:
        print(f"  Solo 1 componente, nada que separar")
        continue

    # Seleccionar solo los vértices de los componentes pequeños (no el principal)
    small_verts = set()
    for comp in components[1:]:
        small_verts.update(comp)

    # Entrar en edit mode y seleccionar los vértices pequeños
    bpy.ops.object.select_all(action="DESELECT")
    orig.select_set(True)
    bpy.context.view_layer.objects.active = orig
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")

    for vi in small_verts:
        orig.data.vertices[vi].select = True

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Renombrar las piezas separadas
    separated = [o for o in bpy.context.selected_objects if o.type == "MESH" and o.name != target_name]
    for i, s in enumerate(separated):
        new_name = f"{target_name}_rect_{i:02d}"
        s.name = new_name
        if s.data: s.data.name = new_name
        print(f"  Separado: {new_name}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
