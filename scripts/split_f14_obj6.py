import bpy, mathutils

GLB_IN = GLB_OUT = r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb"
PIVOT_X = 2.0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)

def cx(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return sum(v.x for v in vs) / max(len(vs), 1)

base = bpy.data.objects.get("Object_6")
if base is None: print("Object_6 not found!"); quit()

bpy.ops.object.select_all(action="DESELECT")
base.select_set(True); bpy.context.view_layer.objects.active = base
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

pieces = [o for o in bpy.context.scene.objects if o.type=="MESH" and o.name.startswith("Object_6")]
print(f"Object_6: {len(pieces)} pieces")

right, left, center = [], [], []
for p in pieces:
    x = cx(p)
    if   x >  PIVOT_X: right.append(p)
    elif x < -PIVOT_X: left.append(p)
    else:               center.append(p)

print(f"  right={len(right)}  left={len(left)}  center={len(center)}")

def merge(lst, name):
    if not lst: return
    bpy.ops.object.select_all(action="DESELECT")
    for p in lst: p.select_set(True)
    bpy.context.view_layer.objects.active = lst[0]
    if len(lst) > 1: bpy.ops.object.join()
    bpy.context.active_object.name = name
    print(f"  → {name}")

merge(right,  "Object_6_R")
merge(left,   "Object_6_L")
merge(center, "Object_6_C")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_yup=True)
print(f"[done] → {GLB_OUT}")
