import bpy, os

VIDEO   = r"C:\Users\nacho\OneDrive\Desktop\f14.mp4"
OUT_DIR = r"C:\Users\nacho\OneDrive\Desktop"
N       = 8

bpy.ops.wm.read_factory_settings(use_empty=True)

clip  = bpy.data.movieclips.load(VIDEO)
total = clip.frame_duration
W, H  = clip.size
print(f"Frames: {total}  Size: {W}x{H}")

scene = bpy.context.scene
scene.render.resolution_x = W
scene.render.resolution_y = H
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.use_compositing = True

# Create compositing node group (Blender 5.x)
ntree = bpy.data.node_groups.new("Compositor", 'CompositorNodeTree')
scene.compositing_node_group = ntree

ntree.nodes.clear()
clip_node = ntree.nodes.new('CompositorNodeMovieClip')
clip_node.clip = clip
comp_node = ntree.nodes.new('CompositorNodeComposite')
ntree.links.new(clip_node.outputs['Image'], comp_node.inputs['Image'])

for i in range(N):
    frame = 1 + int((total - 1) * i / (N - 1))
    scene.frame_set(frame)
    path = os.path.join(OUT_DIR, f"f14_frame_{i:02d}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"  frame {i} (#{frame}) → {path}")

print("done")
