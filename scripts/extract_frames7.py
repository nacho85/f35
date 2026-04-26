"""Extract frames using Blender movieclip + offscreen render"""
import bpy, os, struct, zlib

VIDEO   = r"C:\Users\nacho\OneDrive\Desktop\f14.mp4"
OUT_DIR = r"C:\Users\nacho\OneDrive\Desktop"
N       = 8

bpy.ops.wm.read_factory_settings(use_empty=True)
clip = bpy.data.movieclips.load(VIDEO)
total = clip.frame_duration
W, H  = clip.size
print(f"Frames: {total}  Size: {W}x{H}")

scene = bpy.context.scene
scene.render.resolution_x = W
scene.render.resolution_y = H
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'

for i in range(N):
    frame = 1 + int((total - 1) * i / (N - 1))

    # Get pixels from movieclip at this frame
    clip.frame_start = 1 - frame + 1  # shift so desired frame is at scene frame 1

    # Create a viewer image from movieclip
    img = bpy.data.images.new(f"frame_{i}", W, H, float_buffer=False)
    img.source = 'GENERATED'

    # Use clip.get_frame() equivalent via image pixels
    # Actually read via clip buffer
    scene.frame_set(frame)

    # Try via image pixels from clip
    pixels = clip.grease_pencil  # nope, wrong

    # Use render with movie clip as texture
    mat = bpy.data.materials.new("tmp")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    tex_node = nodes.new('ShaderNodeTexImage')
    img_clip = bpy.data.images.load(VIDEO)
    img_clip.source = 'MOVIE'
    img_clip.colorspace_settings.name = 'sRGB'
    tex_node.image = img_clip
    # frame is set via image_user
    tex_node.image_user.frame_current = frame
    tex_node.image_user.use_auto_refresh = True

    path = os.path.join(OUT_DIR, f"f14_frame_{i:02d}.png")
    # Save the image directly by loading it at a specific frame
    img_clip.frame_start = frame
    bpy.context.scene.frame_set(frame)

    # Force reload at frame
    img_clip.reload()
    img_clip.save_render(filepath=path)
    print(f"  frame {i} (#{frame}) saved")
    bpy.data.images.remove(img_clip)
    bpy.data.images.remove(img)
    bpy.data.materials.remove(mat)

print("done")
