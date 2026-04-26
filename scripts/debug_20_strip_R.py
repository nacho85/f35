"""
Prints centroid X and Z-height of all loose pieces in Object_20_strip_R
to find the natural separation between vertical tail and wing strip.
"""
import bpy, mathutils

GLB_PATH = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

base = bpy.data.objects.get("Object_20_strip_R")
if base is None:
    print("Object_20_strip_R not found — available objects:")
    for o in bpy.context.scene.objects:
        if "20" in o.name: print(" ", o.name)
    quit()

bpy.ops.object.select_all(action="DESELECT")
base.select_set(True)
bpy.context.view_layer.objects.active = base
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

pieces = [o for o in bpy.context.scene.objects
          if o.type == "MESH" and o.name.startswith("Object_20_strip_R")]
print(f"Total pieces: {len(pieces)}")

def centroid(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    cx = sum(v.x for v in vs)/len(vs)
    cy = sum(v.y for v in vs)/len(vs)
    cz = sum(v.z for v in vs)/len(vs)
    zspan = max(v.z for v in vs) - min(v.z for v in vs)
    return cx, cy, cz, zspan, len(vs)

data = sorted([centroid(p) for p in pieces], key=lambda r: r[0])

# Print histogram of X centroids
print("\n=== X centroid distribution ===")
buckets = {}
for cx, cy, cz, zspan, nv in data:
    b = round(cx * 2) / 2   # 0.5m buckets
    buckets[b] = buckets.get(b, 0) + 1

for k in sorted(buckets):
    print(f"  X≈{k:5.1f}  count={buckets[k]}")

# Print min/max Z for pieces at X>7 vs X<5
print("\n=== Pieces by X region ===")
print("X>6 (likely strip far end):")
for cx,cy,cz,zspan,nv in data:
    if cx > 6: print(f"  cx={cx:.2f} cy={cy:.2f} cz={cz:.2f} zspan={zspan:.3f} nv={nv}")

print("X 3.5-5.5 (likely near tail):")
for cx,cy,cz,zspan,nv in data:
    if 3.5 < cx < 5.5: print(f"  cx={cx:.2f} cy={cy:.2f} cz={cz:.2f} zspan={zspan:.3f} nv={nv}")
