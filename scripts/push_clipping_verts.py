"""
For each vert that clips through the fuselage at max sweep,
push it outward just enough to be safe.

Safe condition (right wing): 0.669*lx + 0.743*ly >= 0
where lx = local.x (world.x - pivot.x), ly = -(world.z - pivot.z) = pivot.z - world.z

If vert clips (f = 0.669*lx + 0.743*ly < 0), push lx to:
  lx_safe = -0.743 * ly / 0.669   (keeping ly constant)
"""
import bpy, math
from mathutils import Vector

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

PIVOT_X  = 2.290
PIVOT_Z  = 0.600
S        = math.radians(48)
cosS     = math.cos(S)   # 0.669
sinS     = math.sin(S)   # 0.743

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def push_verts(obj_name, left_side=False):
    obj = bpy.data.objects.get(obj_name)
    if obj is None:
        print(f"[warn] {obj_name} not found"); return

    M     = obj.matrix_world
    M_inv = M.inverted()
    mesh  = obj.data
    n_pushed = 0

    for v in mesh.vertices:
        wv = M @ v.co
        wx, wz = wv.x, wv.z

        # For left side, mirror to right-side frame for the same formula
        if left_side:
            wx = -wx

        lx = wx - PIVOT_X
        ly = PIVOT_Z - wz   # ly = -(wz - PIVOT_Z)

        f = cosS * lx + sinS * ly
        if f < 0:
            # Push lx to safe value
            lx_safe = -sinS * ly / cosS  # = 0.743 * |ly| / 0.669
            delta_lx = lx_safe - lx      # amount to move in world X

            # Apply delta in world space (X only)
            if left_side:
                world_delta = Vector((-delta_lx, 0, 0))
            else:
                world_delta = Vector((delta_lx, 0, 0))

            # Convert world delta to local
            local_delta = M_inv.to_3x3() @ world_delta
            v.co += local_delta
            n_pushed += 1

    mesh.update()
    print(f"{obj_name}: pushed {n_pushed} verts")

push_verts("Object_27",                  left_side=False)
push_verts("Object_28",                  left_side=True)
push_verts("Object_10_R",               left_side=False)
push_verts("Object_10_L",               left_side=True)
push_verts("Object_20_tailwing2_R_fwd", left_side=False)
push_verts("Object_20_tailwing2_L_fwd", left_side=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"\n[done] -> {GLB_OUT}")
