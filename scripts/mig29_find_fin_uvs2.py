"""
Busca los UV de los timones verticales con criterios más estrictos:
- X < -15 (zona muy trasera del avión)
- Normal mayormente en ±Y (cara plana del timón)
- Polígono estrecho en Y (el timón es delgado)
"""
import bpy, mathutils, os

GLB_PATH = r"C:\devs\f35\public\mig-29.glb"
OUT_DIR  = r"C:\devs\f35\scripts\mig29_parts"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

all_pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
min_x = min(v.x for v in all_pts); max_x = max(v.x for v in all_pts)
min_z = min(v.z for v in all_pts); max_z = max(v.z for v in all_pts)

X_TAIL = min_x + (max_x - min_x) * 0.25   # Rear 25% only
Z_FIN  = min_z + (max_z - min_z) * 0.35    # Upper 65%

print(f"Filters: X < {X_TAIL:.1f}, Z > {Z_FIN:.1f}")

for obj in meshes:
    if not any(m and "airframe" in m.name.lower() for m in obj.data.materials):
        continue
    mesh = obj.data
    if not mesh.uv_layers:
        continue

    uv_layer = mesh.uv_layers[0]
    print(f"\n=== {obj.name} ===")

    right_polys = []  # normal +Y (right-facing)
    left_polys  = []  # normal -Y (left-facing)

    for poly in mesh.polygons:
        # World normal
        world_normal = obj.matrix_world.to_3x3() @ poly.normal

        # Only strongly Y-facing polygons (fin flat surfaces)
        if abs(world_normal.y) < 0.6:
            continue

        # World centroid
        world_verts = [obj.matrix_world @ mesh.vertices[mesh.loops[li].vertex_index].co
                       for li in poly.loop_indices]
        cen = mathutils.Vector(sum((v for v in world_verts), mathutils.Vector()) / len(world_verts))

        # Must be in tail area and high Z
        if cen.x > X_TAIL or cen.z < Z_FIN:
            continue

        # Poly must be narrow in Y (fin face has thin cross-section)
        ys = [v.y for v in world_verts]
        if max(ys) - min(ys) > 4.0:  # filter wide polys
            continue

        # UV centroid → canvas coords
        uv_verts = [uv_layer.data[li].uv for li in poly.loop_indices]
        uv_cx = sum(uv.x for uv in uv_verts) / len(uv_verts)
        uv_cy = sum(uv.y for uv in uv_verts) / len(uv_verts)
        canvas_x = uv_cx * 1024
        canvas_y = (1.0 - uv_cy) * 1024

        entry = (cen.x, cen.y, cen.z, uv_cx, uv_cy, canvas_x, canvas_y)
        if world_normal.y > 0:
            right_polys.append(entry)
        else:
            left_polys.append(entry)

    def summarize(polys, label):
        if not polys:
            print(f"  {label}: NONE")
            return
        xs = [p[5] for p in polys]
        ys = [p[6] for p in polys]
        wxs = [p[0] for p in polys]; wys = [p[1] for p in polys]; wzs = [p[2] for p in polys]
        avg_cx = sum(xs)/len(xs)
        avg_cy = sum(ys)/len(ys)
        print(f"  {label} ({len(polys)} polys):")
        print(f"    Canvas: X=[{min(xs):.0f},{max(xs):.0f}] avg={avg_cx:.0f}   Y=[{min(ys):.0f},{max(ys):.0f}] avg={avg_cy:.0f}")
        print(f"    World: X=[{min(wxs):.1f},{max(wxs):.1f}] Y=[{min(wys):.1f},{max(wys):.1f}] Z=[{min(wzs):.1f},{max(wzs):.1f}]")

        # Cluster by world Y position to separate left and right fins
        pos_y = [p for p in polys if p[1] > 0]
        neg_y = [p for p in polys if p[1] <= 0]
        if pos_y and neg_y:
            xs_p = [p[5] for p in pos_y]; ys_p = [p[6] for p in pos_y]
            xs_n = [p[5] for p in neg_y]; ys_n = [p[6] for p in neg_y]
            print(f"    → Fin at +Y (right fin):  canvas ({sum(xs_p)/len(xs_p):.0f}, {sum(ys_p)/len(ys_p):.0f})")
            print(f"    → Fin at -Y (left fin):   canvas ({sum(xs_n)/len(xs_n):.0f}, {sum(ys_n)/len(ys_n):.0f})")
        elif pos_y:
            print(f"    → Single cluster at +Y: canvas ({sum(xs)/len(xs):.0f}, {sum(ys)/len(ys):.0f})")
        elif neg_y:
            print(f"    → Single cluster at -Y: canvas ({sum(xs)/len(xs):.0f}, {sum(ys)/len(ys):.0f})")

    summarize(right_polys, "Right-facing (normal +Y)")
    summarize(left_polys,  "Left-facing  (normal -Y)")

print("\n=== DONE ===")
