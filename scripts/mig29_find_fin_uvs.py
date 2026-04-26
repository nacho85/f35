"""
Encuentra las UV de los dos timones verticales del MiG-29 analizando
los polígonos del mesh por su posición 3D (Z alto = timón vertical).
Imprime los centroides UV de los polígonos del área de los timones.
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

# Find all verts and model extents
all_pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
min_x = min(v.x for v in all_pts); max_x = max(v.x for v in all_pts)
min_z = min(v.z for v in all_pts); max_z = max(v.z for v in all_pts)
model_height = max_z - min_z

print(f"Model: X=[{min_x:.1f},{max_x:.1f}] Z=[{min_z:.1f},{max_z:.1f}]")
print(f"Tail region: X < {min_x + (max_x-min_x)*0.4:.1f}")
print(f"Fin area: Z > {min_z + model_height*0.5:.1f}")

# Threshold: vertical fin polys are in the rear and have HIGH Z
x_tail_max = min_x + (max_x - min_x) * 0.4   # rear 40% of model
z_fin_min   = min_z + model_height * 0.45      # upper 55% of height

for obj in meshes:
    if not any(m and "airframe" in m.name.lower() for m in obj.data.materials):
        continue
    mesh = obj.data
    if not mesh.uv_layers:
        continue

    uv_layer = mesh.uv_layers[0]
    print(f"\n=== {obj.name} ===")

    # Collect UV centroids of fin polygons
    fin_polys_right = []  # Y > 0 (right fin)
    fin_polys_left  = []  # Y < 0 (left fin)

    for poly in mesh.polygons:
        # World-space centroid of this polygon
        world_verts = [obj.matrix_world @ mesh.vertices[mesh.loops[li].vertex_index].co
                       for li in poly.loop_indices]
        cx = sum(v.x for v in world_verts) / len(world_verts)
        cy = sum(v.y for v in world_verts) / len(world_verts)
        cz = sum(v.z for v in world_verts) / len(world_verts)

        # Is this poly in the tail + high-Z region? (likely a fin poly)
        if cx < x_tail_max and cz > z_fin_min:
            # UV centroid
            uv_verts = [uv_layer.data[li].uv for li in poly.loop_indices]
            uv_cx = sum(uv.x for uv in uv_verts) / len(uv_verts)
            uv_cy = sum(uv.y for uv in uv_verts) / len(uv_verts)

            # Canvas coords: canvas_x = uv_cx * 1024, canvas_y = (1 - uv_cy) * 1024
            canvas_x = uv_cx * 1024
            canvas_y = (1.0 - uv_cy) * 1024

            entry = (cx, cy, cz, uv_cx, uv_cy, canvas_x, canvas_y)

            # Normal to determine which face
            if poly.normal.y > 0.1:      # normal points +Y → right-facing (visible from right)
                fin_polys_right.append(entry)
            elif poly.normal.y < -0.1:   # normal points -Y → left-facing
                fin_polys_left.append(entry)

    # Summarize: avg UV centroid and range for each fin face
    def summarize(polys, label):
        if not polys:
            print(f"  {label}: NO POLYS FOUND")
            return
        xs = [p[5] for p in polys]
        ys = [p[6] for p in polys]
        print(f"  {label} ({len(polys)} polys):")
        print(f"    Canvas X: [{min(xs):.0f}, {max(xs):.0f}]  avg={sum(xs)/len(xs):.0f}")
        print(f"    Canvas Y: [{min(ys):.0f}, {max(ys):.0f}]  avg={sum(ys)/len(ys):.0f}")
        # World position
        wxs = [p[0] for p in polys]; wys = [p[1] for p in polys]; wzs = [p[2] for p in polys]
        print(f"    World X=[{min(wxs):.1f},{max(wxs):.1f}] Y=[{min(wys):.1f},{max(wys):.1f}] Z=[{min(wzs):.1f},{max(wzs):.1f}]")

    summarize(fin_polys_right, "Right-facing fin (normal +Y)")
    summarize(fin_polys_left,  "Left-facing fin  (normal -Y)")

    # Also show all unique UV clusters in the tail+fin area regardless of normal
    all_fin = fin_polys_right + fin_polys_left
    if all_fin:
        xs = [p[5] for p in all_fin]; ys = [p[6] for p in all_fin]
        print(f"  Combined fin area: canvas X=[{min(xs):.0f},{max(xs):.0f}] Y=[{min(ys):.0f},{max(ys):.0f}]")
        print(f"    Suggested flag A center: canvas ({sum(xs)/len(xs):.0f}, {sum(ys)/len(ys):.0f})")

print("\n=== DONE ===")
