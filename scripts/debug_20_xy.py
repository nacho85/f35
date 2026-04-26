"""
Prints X AND Y centroids of all loose pieces in Object_20_strip_R.
Vertical tail pieces should cluster at a different Y than wing strip pieces.
"""
import bpy, mathutils

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

base = bpy.data.objects.get("Object_20_strip_R")
if base is None:
    print("Not found"); quit()

bpy.ops.object.select_all(action="DESELECT")
base.select_set(True)
bpy.context.view_layer.objects.active = base
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

pieces = [o for o in bpy.context.scene.objects
          if o.type=="MESH" and o.name.startswith("Object_20_strip_R")]

def stats(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    cx = sum(v.x for v in vs)/len(vs)
    cy = sum(v.y for v in vs)/len(vs)
    zs = [v.z for v in vs]
    zspan = max(zs)-min(zs)
    return cx, cy, zspan

print(f"\n{len(pieces)} pieces  (cx, cy, zspan)")

# Y histogram
y_hist = {}
for p in pieces:
    cx,cy,zspan = stats(p)
    b = round(cy*2)/2
    y_hist[b] = y_hist.get(b,0)+1

print("\n=== Y centroid histogram ===")
for k in sorted(y_hist):
    print(f"  Y≈{k:6.1f}  count={y_hist[k]}")

# Pieces with extreme Y values
data = sorted([stats(p) for p in pieces], key=lambda r: r[1])
print("\nMin Y pieces (front/strip area):")
for cx,cy,zspan in data[:10]:
    print(f"  cx={cx:.2f} cy={cy:.2f} zspan={zspan:.3f}")
print("Max Y pieces (rear/tail area):")
for cx,cy,zspan in data[-10:]:
    print(f"  cx={cx:.2f} cy={cy:.2f} zspan={zspan:.3f}")
