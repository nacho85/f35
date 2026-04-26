"""
Identifica todos los meshes circulares (ruedas/llantas) en el F-35C
usando análisis de bounding box: dos ejes grandes similares + uno pequeño (disco).
"""
import bpy, mathutils

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/devs/f35/public/F-35C.glb")

candidates = []
for obj in bpy.data.objects:
    if obj.type != 'MESH': continue
    verts = obj.data.vertices
    if len(verts) < 100: continue

    # Bounding box en local space
    xs = [v.co.x for v in verts]; ys = [v.co.y for v in verts]; zs = [v.co.z for v in verts]
    sx = max(xs)-min(xs); sy = max(ys)-min(ys); sz = max(zs)-min(zs)
    dims = sorted([sx, sy, sz])
    d0, d1, d2 = dims  # pequeño, medio, grande

    if d2 < 0.15: continue                       # demasiado chico
    circ  = d1 / (d2 or 0.001)                  # qué tan circular
    width = d0 / (d2 or 0.001)                  # qué tan delgado (disco)

    if circ > 0.55 and width < 0.65:
        candidates.append((obj.name, len(verts), round(d0,3), round(d1,3), round(d2,3), round(circ,2), round(width,2)))

candidates.sort(key=lambda x: -x[4])
print(f"\nCandidatos ruedas/llantas ({len(candidates)}):")
print(f"  {'Nombre':<30} {'verts':>6}  {'thin':>6} {'mid':>6} {'wide':>6}  {'circ':>5} {'width':>5}")
for name, v, d0, d1, d2, c, w in candidates:
    print(f"  {name:<30} {v:>6}  {d0:>6} {d1:>6} {d2:>6}  {c:>5} {w:>5}")
