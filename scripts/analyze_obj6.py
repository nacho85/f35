"""
Analiza los componentes conectados de Object_6_R y Object_6_L.
Muestra centroide y vértices de cada pieza aislada.
"""
import bpy, bmesh, shutil

GLB_IN = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

for target_name in ["Object_6_R", "Object_6_L"]:
    orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == target_name), None)
    if not orig:
        print(f"[!] {target_name} no encontrado")
        continue

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

    components.sort(key=lambda c: len(c), reverse=True)
    M = orig.matrix_world

    print(f"\n--- {target_name}: {len(components)} componentes ---")
    print(f"{'#':<4} {'Verts':>6}  {'cx':>8} {'cy':>8} {'cz':>8}")
    print("-" * 45)
    for i, comp in enumerate(components):
        verts = [M @ orig.data.vertices[vi].co for vi in comp]
        cx = sum(v.x for v in verts) / len(verts)
        cy = sum(v.y for v in verts) / len(verts)
        cz = sum(v.z for v in verts) / len(verts)
        print(f"{i:<4} {len(comp):>6}  {cx:>8.3f} {cy:>8.3f} {cz:>8.3f}")
