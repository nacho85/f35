"""
Lista todos los fragmentos de Object_16 en la zona del tren delantero.
Exporta un GLB con cada fragmento pintado de color único para identificarlos.
"""
import bpy, mathutils, math, sys

GLB_IN  = r"C:\devs\f35\public\mig-29-iran.glb"
GLB_OUT = r"C:\devs\f35\public\mig-29-nose-debug.glb"

bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

obj16 = bpy.data.objects.get("Object_16")
for o in bpy.data.objects: o.hide_set(o != obj16)
bpy.context.view_layer.objects.active = obj16
bpy.ops.object.select_all(action="DESELECT"); obj16.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.hide_set(False)

parts = [o for o in bpy.data.objects
         if o.type=="MESH" and (o.name=="Object_16" or o.name.startswith("Object_16."))]

def obj_bbox(o):
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    return (min(v.x for v in bb), max(v.x for v in bb),
            min(v.y for v in bb), max(v.y for v in bb),
            min(v.z for v in bb), max(v.z for v in bb))

# Filtrar zona tren delantero (X≈35-60, |Y|<6, Z<0)
nose_parts = []
for o in parts:
    x0,x1,y0,y1,z0,z1 = obj_bbox(o)
    cx=(x0+x1)/2; cy=(y0+y1)/2; cz=(z0+z1)/2
    vol=(x1-x0)*(y1-y0)*(z1-z0)
    if 30 < cx < 62 and abs(cy) < 7 and z0 < 0:
        nose_parts.append((o, cx, cy, cz, vol))

nose_parts.sort(key=lambda t: -t[4])

print(f"\n=== Partes Object_16 zona nariz ({len(nose_parts)} total) ===")
COLORS = [
    (1,0,0), (0,1,0), (0,0,1), (1,1,0), (1,0,1), (0,1,1),
    (1,.5,0), (.5,0,1), (0,1,.5), (1,0,.5), (.5,1,0), (0,.5,1),
    (.8,.8,.2), (.2,.8,.8), (.8,.2,.8),
]
for i,(o, cx, cy, cz, vol) in enumerate(nose_parts):
    x0,x1,y0,y1,z0,z1 = obj_bbox(o)
    print(f"  [{i:2d}] cx={cx:5.1f} cy={cy:5.2f} cz={cz:5.2f} vol={vol:6.1f} nverts={len(o.data.vertices):4d}  {o.name}")
    # Pintar con color único
    mat = bpy.data.materials.new(name=f"dbg_{i}")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        r,g,b = COLORS[i % len(COLORS)]
        bsdf.inputs["Base Color"].default_value = (r,g,b,1)
        bsdf.inputs["Roughness"].default_value = 0.4
    o.data.materials.clear()
    o.data.materials.append(mat)

sys.stdout.flush()

# Exportar solo las partes de nariz
bpy.ops.object.select_all(action="DESELECT")
for o,*_ in nose_parts:
    o.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format="GLB",
    use_selection=True,
    export_image_format="AUTO",
    export_animations=False,
)
print(f"\nOK → {GLB_OUT}")
