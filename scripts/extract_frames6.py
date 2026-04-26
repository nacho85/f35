"""Extract frames using Blender VSE with context override"""
import bpy, os

VIDEO   = r"C:\Users\nacho\OneDrive\Desktop\f14.mp4"
OUT_DIR = r"C:\Users\nacho\OneDrive\Desktop"
N       = 8

bpy.ops.wm.read_factory_settings(use_empty=True)

# Get total frames via movieclip
clip  = bpy.data.movieclips.load(VIDEO)
total = clip.frame_duration
W, H  = clip.size
print(f"Frames: {total}  Size: {W}x{H}")
bpy.data.movieclips.remove(clip)

# Set up scene for rendering
scene = bpy.context.scene
scene.render.resolution_x = W
scene.render.resolution_y = H
scene.render.image_settings.file_format = 'PNG'

# Use VSE
scene.sequence_editor_create()

# Need proper context for sequencer ops — use screen area override
window = bpy.context.window_manager.windows[0]
screen = window.screen

# Find or create a sequencer area
seq_area = None
for area in screen.areas:
    if area.type == 'SEQUENCE_EDITOR':
        seq_area = area
        break

if not seq_area:
    # Change first area to sequencer
    area = screen.areas[0]
    area.type = 'SEQUENCE_EDITOR'
    seq_area = area

with bpy.context.temp_override(window=window, screen=screen, area=seq_area):
    bpy.ops.sequencer.movie_strip_add(
        filepath=VIDEO, channel=1, frame_start=1, sound=False)

strips = list(scene.sequence_editor.strips)
print(f"Strips: {len(strips)}")
if not strips:
    raise RuntimeError("No strips added")

strip = strips[0]
total = strip.frame_duration
scene.render.fps = round(strip.fps)
scene.render.use_sequencer = True

for i in range(N):
    frame = 1 + int((total - 1) * i / (N - 1))
    scene.frame_set(frame)
    path = os.path.join(OUT_DIR, f"f14_frame_{i:02d}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"  frame {i} (#{frame}) → {path}")

print("done")
