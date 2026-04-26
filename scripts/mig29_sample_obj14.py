import bpy, mathutils, math, sys

GLB = r"C:\devs\f35\public\mig-29-iran.glb"

bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=True)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
bpy.ops.import_scene.gltf(filepath=GLB)

obj14 = bpy.data.objects.get("Object_14")
mw = obj14.matrix_world

verts = []
for v in obj14.data.vertices:
    wv = mw @ v.co
    if 38 < wv.x < 55 and 1 < abs(wv.y) < 5 and -8 < wv.z < 0:
        verts.append((wv.y, wv.z))

verts.sort()
print("\n=== Object_14 nariz (X=38-55, |Y|=1-5, Z<0) ===")
for y,z in verts:
    print(f"  y={y:.3f}  z={z:.3f}")

r = [(y,z) for y,z in verts if y>0]
l = [(y,z) for y,z in verts if y<0]
print(f"\nDerecha (Y>0) n={len(r)}: Y={sum(y for y,z in r)/max(len(r),1):.3f}  Z={sum(z for y,z in r)/max(len(r),1):.3f}")
print(f"Izquierda (Y<0) n={len(l)}: Y={sum(y for y,z in l)/max(len(l),1):.3f}  Z={sum(z for y,z in l)/max(len(l),1):.3f}")

# También ver Object_16 compuertas grandes como referencia open
def separate_obj(name):
    obj = bpy.data.objects.get(name)
    if not obj: return []
    for o in bpy.data.objects: o.hide_set(o != obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE"); bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.data.objects: o.hide_set(False)
    return [o for o in bpy.data.objects if o.type=="MESH" and (o.name==name or o.name.startswith(name+"."))]

parts16 = separate_obj("Object_16")
print("\n=== Object_16 compuertas animadas (vol>=50, zona nariz) ===")
for o in parts16:
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    cx=sum(v.x for v in bb)/8; cy=sum(v.y for v in bb)/8; cz=sum(v.z for v in bb)/8
    xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
    vol=(max(xs)-min(xs))*(max(ys)-min(ys))*(max(zs)-min(zs))
    if 38<cx<55 and abs(cy)>1.5 and -8<cz<0 and vol>=50:
        print(f"  {o.name}: cy={cy:.3f} cz={cz:.3f}  ymin={min(ys):.3f} ymax={max(ys):.3f}  zmin={min(zs):.3f} zmax={max(zs):.3f}")
        # Calcular ángulo necesario usando centroide Object_14 como target
        hinge_y = max(ys) if cy > 0 else min(ys)
        hinge_z = max(zs)
        side = "R" if cy>0 else "L"
        tgt_y = sum(y for y,z in r)/len(r) if cy>0 else sum(y for y,z in l)/len(l)
        tgt_z = sum(z for y,z in r)/len(r) if cy>0 else sum(z for y,z in l)/len(l)
        # Vector open y closed relativo a bisagra
        dy_o = cy - hinge_y; dz_o = cz - hinge_z
        dy_c = tgt_y - hinge_y; dz_c = tgt_z - hinge_z
        a_o = math.degrees(math.atan2(dy_o, dz_o))
        a_c = math.degrees(math.atan2(dy_c, dz_c))
        print(f"    bisagra: y={hinge_y:.3f} z={hinge_z:.3f}")
        print(f"    open:  dy={dy_o:.3f} dz={dz_o:.3f} ang={a_o:.1f}°")
        print(f"    target (O14 avg): dy={dy_c:.3f} dz={dz_c:.3f} ang={a_c:.1f}°")
        print(f"    ► ROT necesaria: {a_c-a_o:.1f}° (rx={'neg' if cy>0 else 'pos'})")
sys.stdout.flush()
