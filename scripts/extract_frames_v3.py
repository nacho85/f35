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

ntree = bpy.data.node_groups.new("Compositor", 'CompositorNodeTree')
scene.compositing_node_group = ntree
ntree.nodes.clear()

clip_node = ntree.nodes.new('CompositorNodeMovieClip')
clip_node.clip = clip

out_node = ntree.nodes.new('CompositorNodeOutputFile')
out_node.directory = OUT_DIR
# Don't touch out_node.format — use scene render settings
ntree.links.new(clip_node.outputs['Image'], out_node.inputs[0])

for i in range(N):
    frame = 1 + int((total - 1) * i / (N - 1))
    scene.frame_set(frame)
    out_node.file_name = f"f14_frame_{i:02d}"
    bpy.ops.render.render(write_still=False)
    print(f"  rendered frame {i} (#{frame})")

print("done — check Desktop for f14_frame_*.png")
