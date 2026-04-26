"""
Separa el rectángulo fijo (6 verts, cx≈±2.26) de Object_6_R y Object_6_L.
Estrategia: seleccionar las puntas (verts grandes) y separarlas como Object_6_R/L.
El original queda solo con el rectángulo → renombrar a Object_6_R_fixed / Object_6_L_fixed.
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

    # El más pequeño es el rectángulo (6 verts) — los demás son las puntas del ala
    components.sort(key=lambda c: len(c))
    small_verts = components[0]
    large_verts = set()
    for comp in components[1:]:
        large_verts.update(comp)

    M = orig.matrix_world
    sv = [M @ orig.data.vertices[vi].co for vi in small_verts]
    lv = [M @ orig.data.vertices[vi].co for vi in large_verts]
    print(f"{target_name}: rect={len(small_verts)} verts cx={sum(v.x for v in sv)/len(sv):.2f} | puntas={len(large_verts)} verts cx={sum(v.x for v in lv)/len(lv):.2f}")

    # Seleccionar PUNTAS (large) y separarlas → nuevo objeto = "Object_6_R/L"
    bpy.ops.object.select_all(action="DESELECT")
    orig.select_set(True)
    bpy.context.view_layer.objects.active = orig
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in orig.data.vertices:
        v.select = v.index in large_verts
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Nuevo objeto = puntas del ala → mantener nombre original (Object_6_R/L)
    # Original = queda con el rectángulo → renombrar a Object_6_R/L_fixed
    separated = [o for o in bpy.context.selected_objects if o.type == "MESH" and o.name != target_name]
    for s in separated:
        s.name = target_name  # las puntas mantienen el nombre original
        if s.data: s.data.name = target_name

    # El original (rectángulo) pasa a ser _fixed
    orig.name = f"{target_name}_fixed"
    if orig.data: orig.data.name = f"{target_name}_fixed"
    print(f"  → {target_name}_fixed (rect) + {target_name} (puntas)")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] → {GLB_OUT}")
