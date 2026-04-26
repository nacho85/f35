import bpy, bmesh

GLB_IN = r"C:\devs\f35\public\F-14-iran.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_14_C"), None)
if not orig:
    print("[!] Object_14_C no encontrado"); exit()

bm = bmesh.new()
bm.from_mesh(orig.data)
bm.verts.ensure_lookup_table()

visited = set()
components = []
for v in bm.verts:
    if v.index in visited: continue
    comp = set()
    queue = [v]
    while queue:
        cur = queue.pop()
        if cur.index in visited: continue
        visited.add(cur.index)
        comp.add(cur.index)
        for e in cur.link_edges:
            other = e.other_vert(cur)
            if other.index not in visited: queue.append(other)
    components.append(comp)
bm.free()

components.sort(key=lambda c: len(c), reverse=True)
M = orig.matrix_world
print(f"\n--- Object_14_C: {len(components)} componentes ---")
print(f"{'#':<4} {'Verts':>6}  {'cx':>8} {'cy':>8} {'cz':>8}")
print("-" * 45)
for i, comp in enumerate(components):
    verts = [M @ orig.data.vertices[vi].co for vi in comp]
    cx = sum(v.x for v in verts) / len(verts)
    cy = sum(v.y for v in verts) / len(verts)
    cz = sum(v.z for v in verts) / len(verts)
    print(f"{i:<4} {len(comp):>6}  {cx:>8.3f} {cy:>8.3f} {cz:>8.3f}")
