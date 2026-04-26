import bpy, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"C:\devs\f35\public\f-14a_tomcat_iran_fixed.glb")

PIVOT_X, PIVOT_Y = 2.290, -1.119
SWEEP_MAX = math.radians(48)

for base_name in ["Object_21_R", "Object_21_L"]:
    base = bpy.data.objects.get(base_name)
    if base is None:
        print(f"[warn] {base_name} not found"); continue

    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True); bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    pieces = [o for o in bpy.context.scene.objects
              if o.type=="MESH" and o.name.startswith(base_name)]

    print(f"\n{base_name}: {len(pieces)} loose pieces")
    print(f"{'cx_world':>10}  {'cy_world':>10}  {'cx_local':>10}  {'cy_local':>10}  {'min_wx@48':>10}  {'verts':>6}")
    for p in sorted(pieces, key=lambda o: (o.matrix_world @ o.data.vertices[0].co).x):
        vs = [p.matrix_world @ v.co for v in p.data.vertices]
        cx = sum(v.x for v in vs)/len(vs)
        cy = sum(v.y for v in vs)/len(vs)
        lx = cx - PIVOT_X
        ly = cy - PIVOT_Y
        # min world X at max sweep (worst case = inner-forward corner)
        min_x_inner = PIVOT_X + lx*math.cos(SWEEP_MAX) - ly*math.sin(SWEEP_MAX)
        print(f"{cx:>10.3f}  {cy:>10.3f}  {lx:>10.3f}  {ly:>10.3f}  {min_x_inner:>10.3f}  {len(p.data.vertices):>6}")
