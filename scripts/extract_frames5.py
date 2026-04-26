"""Extract frames from video using Blender movieclip pixel buffer"""
import bpy, os

VIDEO   = r"C:\Users\nacho\OneDrive\Desktop\f14.mp4"
OUT_DIR = r"C:\Users\nacho\OneDrive\Desktop"
N       = 8

bpy.ops.wm.read_factory_settings(use_empty=True)
clip  = bpy.data.movieclips.load(VIDEO)
total = clip.frame_duration
W, H  = clip.size
print(f"Frames: {total}  Size: {W}x{H}")

# Load as IMAGE with MOVIE source — set frame via image.pixels
img = bpy.data.images.load(VIDEO)
img.source = 'MOVIE'

for i in range(N):
    frame = 1 + int(total * i / (N - 1))
    img.frame = frame
    out_path = os.path.join(OUT_DIR, f"f14_frame_{i:02d}.png")
    img.save_render(filepath=out_path)
    print(f"  frame {i} (#{frame}) → {out_path}")

bpy.data.images.remove(img)
print("done")
