"""Debug: busca clusters grandes en zona nariz para distinguir compuerta de struts."""
import bpy, bmesh

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\F-14-iran.glb")

orig = next((o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10"), None)
M = orig.matrix_world

bm = bmesh.new()
bm.from_mesh(orig.data)
bm.verts.ensure_lookup_table()

visited = set()
clusters = []

for start in bm.verts:
    if start.index in visited:
        continue
    comp = []
    stack = [start]
    while stack:
        v = stack.pop()
        if v.index in visited:
            continue
        visited.add(v.index)
        comp.append(v.index)
        for e in v.link_edges:
            nb = e.other_vert(v)
            if nb.index not in visited:
                stack.append(nb)
    ws = [M @ orig.data.vertices[vi].co for vi in comp]
    cx = sum(v.x for v in ws)/len(ws)
    cy = sum(v.y for v in ws)/len(ws)
    cz = sum(v.z for v in ws)/len(ws)
    # tz=-cy, ty=cz (Three.js)
    clusters.append((len(comp), cx, cz, -cy))  # (n, tx, ty, tz)

bm.free()

# Clusters en zona nariz (tz>3) ordenados por tamaño
nosegear = [(n, tx, ty, tz) for n, tx, ty, tz in clusters if tz > 3.0]
nosegear.sort(key=lambda r: -r[0])

print(f"\nTop 40 clusters zona nariz (tz>3), {len(nosegear)} total:")
print(f"{'#verts':>7}  {'tx':>7}  {'ty(h)':>7}  {'tz':>7}  note")
for n, tx, ty, tz in nosegear[:40]:
    note = ""
    if ty > -0.1:
        note = "← alto (compuerta?)"
    elif ty < -0.5:
        note = "← bajo (rueda/strut)"
    print(f"{n:>7}  {tx:>7.3f}  {ty:>7.3f}  {tz:>7.3f}  {note}")

# Resumen por altura
alto   = [(n,tx,ty,tz) for n,tx,ty,tz in nosegear if ty > -0.1]
medio  = [(n,tx,ty,tz) for n,tx,ty,tz in nosegear if -0.1 >= ty >= -0.45]
bajo   = [(n,tx,ty,tz) for n,tx,ty,tz in nosegear if ty < -0.45]
print(f"\nPor altura (ty):")
print(f"  alto   ty>-0.1  : {len(alto):4d} clusters, {sum(n for n,*_ in alto):6d} verts")
print(f"  medio           : {len(medio):4d} clusters, {sum(n for n,*_ in medio):6d} verts")
print(f"  bajo   ty<-0.45 : {len(bajo):4d} clusters, {sum(n for n,*_ in bajo):6d} verts")
