"""
For each known UV position, find the 3D world position and surface normal
on Object_4. Outputs JSON-ready data for use in React Decal components.
"""
import bpy, json
import mathutils

MIG_IN = r"C:\devs\f35\public\mig-29.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=MIG_IN)

obj = next(o for o in bpy.context.scene.objects if o.type=="MESH" and o.name=="Object_4")
mesh   = obj.data
uv_lyr = mesh.uv_layers.active.data
mat    = obj.matrix_world

# UV targets (u,v in 0-1 space). Converted from pixel coords / 1024.
# Position in 1024-space: (cx, cy) with y=0 at TOP → v = 1 - cy/1024
targets = {
    # tail_L (cx=746, island y 130-425)
    "tail_L_number": (746/1024, 1 - 375/1024),
    "tail_L_flag":   (746/1024, 1 - 305/1024),
    "tail_L_eagle":  (746/1024, 1 - 225/1024),

    # tail_R (cx=71, island y 327-622)
    "tail_R_number": ( 71/1024, 1 - 395/1024),
    "tail_R_flag":   ( 71/1024, 1 - 490/1024),

    # wings top
    "wing_top_L_roundel": ( 85/1024, 1 - 426/1024),
    "wing_top_R_roundel": (542/1024, 1 - 426/1024),

    # wing bottom eagle
    "wing_bot_L_eagle": (428/1024, 1 - 781/1024),
}

def uv_to_3d(obj, mesh, uv_lyr, target_u, target_v, tol=0.02):
    """Find closest polygon to (target_u, target_v) and return world pos + normal."""
    best_dist = float("inf")
    best_pos  = None
    best_norm = None

    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        # Fan-triangulate and do barycentric lookup
        uv0 = uv_lyr[loops[0]].uv
        v0  = mesh.vertices[mesh.loops[loops[0]].vertex_index].co

        for i in range(1, len(loops)-1):
            uv1 = uv_lyr[loops[i]].uv
            uv2 = uv_lyr[loops[i+1]].uv
            v1  = mesh.vertices[mesh.loops[loops[i]].vertex_index].co
            v2  = mesh.vertices[mesh.loops[loops[i+1]].vertex_index].co

            # Barycentric coords in UV space
            def bary(p, a, b, c):
                v0_ = (b[0]-a[0], b[1]-a[1])
                v1_ = (c[0]-a[0], c[1]-a[1])
                v2_ = (p[0]-a[0], p[1]-a[1])
                d00 = v0_[0]*v0_[0]+v0_[1]*v0_[1]
                d01 = v0_[0]*v1_[0]+v0_[1]*v1_[1]
                d11 = v1_[0]*v1_[0]+v1_[1]*v1_[1]
                d20 = v2_[0]*v0_[0]+v2_[1]*v0_[1]
                d21 = v2_[0]*v1_[0]+v2_[1]*v1_[1]
                denom = d00*d11 - d01*d01
                if abs(denom) < 1e-10: return None
                lam1 = (d11*d20 - d01*d21) / denom
                lam2 = (d00*d21 - d01*d20) / denom
                lam0 = 1.0 - lam1 - lam2
                return lam0, lam1, lam2

            p = (target_u, target_v)
            bc = bary(p, uv0, uv1, uv2)
            if bc is None: continue
            lam0, lam1, lam2 = bc
            if lam0 < -tol or lam1 < -tol or lam2 < -tol: continue

            # Inside (or near) triangle — interpolate 3D position
            pos3d = lam0*v0 + lam1*v1 + lam2*v2
            world = mat @ pos3d

            # Distance to target UV centre (for picking best match)
            cu = lam0*uv0[0] + lam1*uv1[0] + lam2*uv2[0]
            cv = lam0*uv0[1] + lam1*uv1[1] + lam2*uv2[1]
            dist = ((cu-target_u)**2 + (cv-target_v)**2)**0.5

            if dist < best_dist:
                best_dist = dist
                best_pos  = world
                # World-space normal
                local_norm = poly.normal
                world_norm = (mat.to_3x3() @ local_norm).normalized()
                best_norm  = world_norm

    return best_pos, best_norm

print("\n// Decal positions for React (Three.js coordinates)")
print("const DECALS = {")
results = {}
for name, (tu, tv) in targets.items():
    pos, norm = uv_to_3d(obj, mesh, uv_lyr, tu, tv)
    if pos:
        p = [round(float(pos.x),4), round(float(pos.y),4), round(float(pos.z),4)]
        n = [round(float(norm.x),4), round(float(norm.y),4), round(float(norm.z),4)]
        print(f'  "{name}": {{ pos: {p}, normal: {n} }},')
        results[name] = {"pos": p, "normal": n}
    else:
        print(f'  "{name}": null,  // not found')
print("};")

with open(r"C:\devs\f35\scripts\mig29_decal_positions.json", "w") as f:
    json.dump(results, f, indent=2)
print("\n✓ Saved to mig29_decal_positions.json")
