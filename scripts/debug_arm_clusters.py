"""
Compara clusters de ArmL vs ArmR para identificar qué falta en ArmL.
Muestra también los clusters de NosePivot cerca de donde debería estar ArmL.
"""
import bpy, bmesh, mathutils

GLB_IN = r"C:\devs\f35\public\F-14-iran-v4.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def get_clusters(obj):
    M = obj.matrix_world
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    visited = set(); clusters = []
    for start in bm.verts:
        if start.index in visited: continue
        comp = []; stack = [start]
        while stack:
            v = stack.pop()
            if v.index in visited: continue
            visited.add(v.index); comp.append(v.index)
            for e in v.link_edges:
                nb = e.other_vert(v)
                if nb.index not in visited: stack.append(nb)
        ws = [M @ obj.data.vertices[vi].co for vi in comp]
        cx = sum(v.x for v in ws)/len(ws)
        cy = sum(v.y for v in ws)/len(ws)
        cz = sum(v.z for v in ws)/len(ws)
        clusters.append((len(comp), mathutils.Vector((cx, cy, cz))))
    bm.free()
    return sorted(clusters, key=lambda c: -c[0])

arml  = next(o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_ArmL")
armr  = next(o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_ArmR")
pivot = next(o for o in bpy.data.objects if o.type == "MESH" and o.name == "Object_10_NosePivot")

cl_l = get_clusters(arml)
cl_r = get_clusters(armr)
cl_p = get_clusters(pivot)

print(f"\n=== ArmL ({len(arml.data.vertices)} verts, {len(cl_l)} clusters) ===")
print(f"{'verts':>6}  {'tx':>7}  {'ty':>7}  {'tz':>7}")
for n, c in cl_l[:20]:
    print(f"{n:>6}  {c.x:>7.3f}  {c.z:>7.3f}  {-c.y:>7.3f}")

print(f"\n=== ArmR ({len(armr.data.vertices)} verts, {len(cl_r)} clusters) ===")
print(f"{'verts':>6}  {'tx':>7}  {'ty':>7}  {'tz':>7}")
for n, c in cl_r[:20]:
    print(f"{n:>6}  {c.x:>7.3f}  {c.z:>7.3f}  {-c.y:>7.3f}")

# Buscar en NosePivot los clusters que no tienen espejo en ArmL pero sí en ArmR
# Para cada cluster en ArmR, buscar su espejo (-x) en ArmL
print(f"\n=== Clusters de ArmR SIN espejo en ArmL (posiblemente faltantes) ===")
THRESH = 0.05
for nr, cr in cl_r:
    # buscar espejo en ArmL: mismo tamaño ±20%, posición espejada en X
    mirror_x = -cr.x
    found = any(
        abs(nl - nr) / nr < 0.25 and
        abs(cl.x - mirror_x) < THRESH and
        abs(cl.y - cr.y) < THRESH and
        abs(cl.z - cr.z) < THRESH
        for nl, cl in cl_l
    )
    if not found:
        print(f"  ArmR {nr:>4}v @ tx={cr.x:.3f} ty={cr.z:.3f} tz={-cr.y:.3f}  → espejo esperado en ArmL @ tx={mirror_x:.3f}")
        # Buscar ese espejo en NosePivot
        candidates = [(np, cp) for np, cp in cl_p if
            abs(cp.x - mirror_x) < THRESH*2 and
            abs(cp.y - cr.y) < THRESH*2 and
            abs(cp.z - cr.z) < THRESH*2]
        for np, cp in candidates:
            print(f"    → NosePivot tiene {np}v @ tx={cp.x:.3f} ty={cp.z:.3f} tz={-cp.y:.3f}")

