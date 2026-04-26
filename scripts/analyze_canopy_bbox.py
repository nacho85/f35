"""
Imprime el bounding box y centroide de Object_5 (canopy) en coordenadas mundo.
No modifica el GLB.
"""
import bpy

GLB_IN = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj = bpy.data.objects.get("Object_5")
if not obj:
    print("Object_5 no encontrado"); raise SystemExit

M = obj.matrix_world
verts = [M @ v.co for v in obj.data.vertices]

xs = [v.x for v in verts]
ys = [v.y for v in verts]
zs = [v.z for v in verts]

print(f"\nObject_5 (canopy) — {len(verts)} verts")
print(f"  X: {min(xs):.4f} → {max(xs):.4f}  (centro {sum(xs)/len(xs):.4f})")
print(f"  Y: {min(ys):.4f} → {max(ys):.4f}  (centro {sum(ys)/len(ys):.4f})")
print(f"  Z: {min(zs):.4f} → {max(zs):.4f}  (centro {sum(zs)/len(zs):.4f})")
print(f"\n  Origin actual (world): {M.translation}")
print("[done — GLB no modificado]")
