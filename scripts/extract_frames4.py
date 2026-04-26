"""Extract frames using Blender image loading per-frame"""
import bpy, os

VIDEO = r"C:\Users\nacho\OneDrive\Desktop\f14.mp4"
OUT   = r"C:\Users\nacho\OneDrive\Desktop"
N_FRAMES = 8

bpy.ops.wm.read_factory_settings(use_empty=True)

# Load as image sequence / movie clip
clip = bpy.data.movieclips.load(VIDEO)
total = clip.frame_duration
print(f"Total frames: {total}, size: {clip.size[0]}x{clip.size[1]}")

scene = bpy.context.scene
scene.render.resolution_x = clip.size[0]
scene.render.resolution_y = clip.size[1]
scene.render.image_settings.file_format = 'PNG'

for i in range(N_FRAMES):
    frame = 1 + int(total * i / (N_FRAMES - 1))
    clip.colorspace_settings.name = 'sRGB'

    # Get the image at this frame
    img = bpy.data.images.load(VIDEO)
    img.source = 'MOVIE'
    img.colorspace_settings.name = 'sRGB'

    path = os.path.join(OUT, f"f14_frame_{i:02d}.png")

    # Render via compositor
    scene.use_nodes = True
    tree = scene.node_tree
    tree.nodes.clear()

    img_node = tree.nodes.new('CompositorNodeImage')
    img_node.image = img
    img_node.frame_duration = total
    img_node.frame_offset = frame - 1

    comp_node = tree.nodes.new('CompositorNodeComposite')
    tree.links.new(img_node.outputs['Image'], comp_node.inputs['Image'])

    scene.frame_set(1)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"Saved frame {i} -> {path}")

    bpy.data.images.remove(img)
    break  # test with one frame first
