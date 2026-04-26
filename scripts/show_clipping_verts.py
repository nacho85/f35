import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

PIVOT_X = 2.290
PIVOT_Z = 0.600
FUSE_X  = 2.287
SWEEP_MAX = math.radians(48)

def sweep_wx(wx, wz):
    return PIVOT_X + math.cos(SWEEP_MAX)*(wx-PIVOT_X) - math.sin(SWEEP_MAX)*(wz-PIVOT_Z)

for name in ["Object_27", "Object_10_R", "Object_20_tailwing2_R_fwd"]:
    obj = bpy.data.objects.get(name)
    if not obj: continue
    clips = []
    for v in obj.data.vertices:
        wv = obj.matrix_world @ v.co
        wx_a = sweep_wx(wv.x, wv.z)
        if wx_a < FUSE_X:
            clips.append((wx_a, wv.x, wv.z, wv.y))
    clips.sort()
    print(f"\n{name}: {len(clips)} clipping verts")
    print(f"{'wx_after':>10}  {'wx_orig':>10}  {'wz_orig':>10}  {'wy(height)':>10}")
    for wx_a, wx, wz, wy in clips:
        print(f"{wx_a:>10.3f}  {wx:>10.3f}  {wz:>10.3f}  {wy:>10.3f}")
    # World Z range (forward-back range) of clipping verts
    wzs = [e[2] for e in clips]
    wxs = [e[1] for e in clips]
    print(f"  world X orig: {min(wxs):.3f} → {max(wxs):.3f}")
    print(f"  world Z orig: {min(wzs):.3f} → {max(wzs):.3f}")
