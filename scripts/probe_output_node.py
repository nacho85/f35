import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
ntree = bpy.data.node_groups.new("C", 'CompositorNodeTree')
n = ntree.nodes.new('CompositorNodeOutputFile')
print("OutputFile attrs:", [a for a in dir(n) if not a.startswith('_')])
clip = bpy.data.movieclips.load(r"C:\Users\nacho\OneDrive\Desktop\f14.mp4")
cn = ntree.nodes.new('CompositorNodeMovieClip')
print("MovieClip outputs:", [o.name for o in cn.outputs])
print("MovieClip attrs:", [a for a in dir(cn) if not a.startswith('_') and 'frame' in a.lower()])
