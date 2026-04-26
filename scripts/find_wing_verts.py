"""
Find fixed objects that have vertices in the inner wing zone (X 1.5-3.5, Y -2 to 3).
These are the candidates for the floating inner wing panels.
"""
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

# Inner wing zone — RIGHT side (mirror for left)
X_MIN, X_MAX = 1.5, 3.5
Y_MIN, Y_MAX = -3.0, 3.0

print("Objects with verts in right inner wing zone (X 1.5-3.5, Y -3 to 3):")
for o in sorted(bpy.context.scene.objects, key=lambda o: o.name):
    if o.type != "MESH": continue
    if o.name in ANIMATED: continue
    count = 0
    for v in o.data.vertices:
        wv = o.matrix_world @ v.co
        if X_MIN < wv.x < X_MAX and Y_MIN < wv.y < Y_MAX:
            count += 1
    if count > 0:
        # Get a sample centroid of those verts
        ws = [o.matrix_world @ v.co for v in o.data.vertices
              if X_MIN < (o.matrix_world @ v.co).x < X_MAX and Y_MIN < (o.matrix_world @ v.co).y < Y_MAX]
        cx = sum(v.x for v in ws)/len(ws)
        cy = sum(v.y for v in ws)/len(ws)
        cz = sum(v.z for v in ws)/len(ws)
        print(f"  {o.name:<28}  {count:>5} verts  centroid=({cx:.2f}, {cy:.2f}, {cz:.2f})")
