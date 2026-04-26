"""
Bisect Object_27/28 (and clipping extras) along the "safe sweep boundary" plane.
At max sweep (48°), the inner leading edge must not cross X = FUSE_X = 2.287.

Safe boundary plane (in world XZ):
  f(x,z) = cos(48°)*(x - PIVOT_X) - sin(48°)*(z - PIVOT_Z) = 0
  plane_co  = (PIVOT_X, 0, PIVOT_Z)   = (2.290, 0, 0.600)
  plane_no  = (cos48, 0, -sin48)       = (0.669, 0, -0.743)  [points toward safe side]

Delete geometry where f < 0  (inner/clipping side).
"""
import bpy, bmesh, math
from mathutils import Vector

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

S = math.radians(48)

# Right wing: rotation.z = +sweep, pivot at (+2.290, _, 0.600)
# Clips when wx_after < 2.287
# Safe plane: cos(S)*(wx-2.290) - sin(S)*(wz-0.600) = 0
# Normal toward safe (outer) side: (cos S, 0, -sin S)
R_PLANE_CO = Vector(( 2.290, 0.0,  0.600))
R_PLANE_NO = Vector(( math.cos(S), 0.0, -math.sin(S)))

# Left wing: rotation.z = -sweep, pivot at (-2.290, _, 0.600)
# Clips when wx_after > -2.287
# Safe plane: cos(S)*(wx+2.290) + sin(S)*(wz-0.600) = 0
# Normal toward safe (outer/left) side: (-cos S, 0, -sin S)
L_PLANE_CO = Vector((-2.290, 0.0,  0.600))
L_PLANE_NO = Vector((-math.cos(S), 0.0, -math.sin(S)))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def bisect_trim(obj_name, plane_co, plane_no):
    obj = bpy.data.objects.get(obj_name)
    if obj is None:
        print(f"[warn] {obj_name} not found"); return

    M_inv = obj.matrix_world.inverted()
    local_co = M_inv @ plane_co
    # Correct normal transform world→local: R^T @ world_no  (R = model rotation)
    local_no = (obj.matrix_world.to_3x3().transposed() @ plane_no).normalized()

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    verts_before = len(bm.verts)
    faces_before = len(bm.faces)

    bmesh.ops.bisect_plane(
        bm,
        geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
        plane_co=local_co,
        plane_no=local_no,
        clear_inner=True,   # remove clipping side (opposite to normal)
        clear_outer=False,
    )

    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    verts_after = len(obj.data.vertices)
    faces_after = len(obj.data.polygons)
    print(f"{obj_name}: faces {faces_before}→{faces_after} (removed {faces_before-faces_after})")

bisect_trim("Object_27",                  R_PLANE_CO, R_PLANE_NO)
bisect_trim("Object_28",                  L_PLANE_CO, L_PLANE_NO)
bisect_trim("Object_10_R",               R_PLANE_CO, R_PLANE_NO)
bisect_trim("Object_10_L",               L_PLANE_CO, L_PLANE_NO)
bisect_trim("Object_20_tailwing2_R_fwd", R_PLANE_CO, R_PLANE_NO)
bisect_trim("Object_20_tailwing2_L_fwd", L_PLANE_CO, L_PLANE_NO)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
