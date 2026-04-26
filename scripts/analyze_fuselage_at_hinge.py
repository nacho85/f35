"""
Busca la superficie superior del fuselaje en la zona de bisagra del canopy (Y ≈ -2.25).
Revisa varios objetos candidatos del fuselaje.
"""
import bpy

GLB_IN = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

CANDIDATES = ["Object_11", "Object_2", "Object_1", "Object_8", "Object_9", "Object_12", "Object_13"]
Y_TARGET = -2.25
Y_BAND   = 0.4   # verts dentro de Y_TARGET ± Y_BAND

for name in CANDIDATES:
    obj = bpy.data.objects.get(name)
    if not obj or obj.type != "MESH": continue
    M = obj.matrix_world
    verts_in_band = [M @ v.co for v in obj.data.vertices
                     if abs((M @ v.co).y - Y_TARGET) < Y_BAND]
    if not verts_in_band: continue
    max_z = max(v.z for v in verts_in_band)
    print(f"  {name}: max Z en Y≈{Y_TARGET} → {max_z:.4f}  ({len(verts_in_band)} verts)")

print("[done]")
