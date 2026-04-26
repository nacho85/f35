"""
Extract frames by loading video as image sequence via bpy.data.images,
then saving each frame using pixels buffer.
"""
import bpy, os, struct, zlib

VIDEO   = r"C:\Users\nacho\OneDrive\Desktop\f14.mp4"
OUT_DIR = r"C:\Users\nacho\OneDrive\Desktop"
N       = 8

bpy.ops.wm.read_factory_settings(use_empty=True)

# Load video as image with MOVIE source
img = bpy.data.images.load(VIDEO)
img.source = 'MOVIE'
img.colorspace_settings.name = 'sRGB'

W = img.size[0]
H = img.size[1]
total = 75  # known from previous run

print(f"Image size: {W}x{H}")
print(f"Channels: {img.channels}")

# Force GL update and grab pixels for each frame
scene = bpy.context.scene

for i in range(N):
    frame = 1 + int((total - 1) * i / (N - 1))

    # Set the image frame
    img.user_clear()

    # Use image_user approach
    scene.frame_set(frame)
    img.frame_start = frame
    img.frame_offset = 0
    img.reload()

    pixels = list(img.pixels)
    print(f"  frame {i} (#{frame}): {len(pixels)} pixels, first4={pixels[:4]}")

    # Write PNG manually
    path = os.path.join(OUT_DIR, f"f14_frame_{i:02d}.png")
    img.save_render(filepath=path)
    print(f"  → saved {path}")

print("done")
