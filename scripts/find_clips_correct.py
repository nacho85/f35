"""
Object_27 world matrix shows:
  world.x = local.x + 2.290
  world.y = local.z - 1.119   (local Z = vertical = sweep axis)
  world.z = -local.y + 0.600

Wing sweep = rotation around LOCAL Z axis = world Y axis (vertical).
Sweep happens in the world X-Z plane.

Clip condition: after sweep, wx < FUSE_X
  wx_after = pivot_x + cos(s)*(wx-pivot_x) - sin(s)*(wz-pivot_z)
  wz_after = pivot_z + sin(s)*(wx-pivot_x) + cos(s)*(wz-pivot_z)
"""
import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

PIVOT_X = 2.290
PIVOT_Z = 0.600
FUSE_X  = 2.287
SWEEP_MAX = math.radians(48)

def sweep_wx(wx, wz, sweep=SWEEP_MAX):
    return PIVOT_X + math.cos(sweep)*(wx-PIVOT_X) - math.sin(sweep)*(wz-PIVOT_Z)

# Check each EXTRA
EXTRAS = ["Object_10_R","Object_21_R","Object_20_wingflap_R","Object_6_R",
          "Object_7_wing_R","Object_3_wingtip","Object_19_R_glove_outer",
          "Object_20_tailwing2_R_fwd"]

print(f"\n{'Object':30}  {'min_wx@48':>10}  {'verts_clip':>10}  {'wz_range':>20}")
for name in EXTRAS:
    obj = bpy.data.objects.get(name)
    if obj is None:
        print(f"{name:30}  NOT FOUND"); continue
    verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    wxs_after = [sweep_wx(v.x, v.z) for v in verts]
    min_wx = min(wxs_after)
    n_clip = sum(1 for w in wxs_after if w < FUSE_X)
    wz_vals = [v.z for v in verts]
    print(f"{name:30}  {min_wx:>10.3f}  {n_clip:>10}  [{min(wz_vals):.2f} → {max(wz_vals):.2f}]")

# Also check Object_27 itself
obj = bpy.data.objects.get("Object_27")
verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
wxs_after = [sweep_wx(v.x, v.z) for v in verts]
min_wx = min(wxs_after)
n_clip = sum(1 for w in wxs_after if w < FUSE_X)
print(f"\n{'Object_27 (main wing)':30}  {min_wx:>10.3f}  {n_clip:>10}")
