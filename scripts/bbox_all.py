"""Print centroid and bbox extents for all fixed mesh objects."""
import bpy, mathutils

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

ANIMATED = {
    "Object_27","Object_28",
    "Object_10_R","Object_10_L",
    "Object_21_R","Object_21_L",
    "Object_19_L","Object_19_R",
    "Object_20_wingflap_R","Object_20_wingflap_L",
    "Object_6_R","Object_6_L",
    "Object_7_wing_R","Object_7_wing_L",
    "Object_3_wingtip","Object_4_wingtip",
    "Object_5",
}

def bbox_info(obj):
    ws = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    xs = [v.x for v in ws]; ys = [v.y for v in ws]; zs = [v.z for v in ws]
    return (min(xs),max(xs)), (min(ys),max(ys)), (min(zs),max(zs))

print(f"{'Name':<28} {'X min':>7} {'X max':>7} {'Y min':>7} {'Y max':>7} {'Z min':>6} {'Z max':>6}  size_x  size_y")
for o in sorted(bpy.context.scene.objects, key=lambda o: o.name):
    if o.type != "MESH": continue
    if o.name in ANIMATED: continue
    (xmin,xmax),(ymin,ymax),(zmin,zmax) = bbox_info(o)
    sx = xmax-xmin; sy = ymax-ymin
    print(f"{o.name:<28} {xmin:>7.2f} {xmax:>7.2f} {ymin:>7.2f} {ymax:>7.2f} {zmin:>6.2f} {zmax:>6.2f}  {sx:>6.2f}  {sy:>6.2f}")
