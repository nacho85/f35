import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
img = bpy.data.images.load(r"C:\Users\nacho\OneDrive\Desktop\f14.mp4")
img.source = 'MOVIE'
attrs = [a for a in dir(img) if not a.startswith('_') and any(k in a.lower() for k in ['frame', 'seq', 'movie', 'time', 'pack'])]
print("Movie-related attrs:", attrs)
print("All attrs:", [a for a in dir(img) if not a.startswith('_')])
