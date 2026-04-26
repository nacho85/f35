import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
ntree = bpy.data.node_groups.new("C", 'CompositorNodeTree')
print([n for n in dir(bpy.types) if 'Compositor' in n and ('Clip' in n or 'Movie' in n or 'Output' in n or 'Composite' in n)])
# Try to find output node type
for t in ['CompositorNodeComposite', 'NodeGroupOutput', 'CompositorNodeOutputFile', 'CompositorNodeViewer']:
    try:
        n = ntree.nodes.new(t)
        print(f"OK: {t}")
        ntree.nodes.remove(n)
    except Exception as e:
        print(f"FAIL {t}: {e}")
