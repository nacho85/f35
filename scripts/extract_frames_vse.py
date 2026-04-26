"""Extract frames via Blender VSE with proper context"""
import bpy, os

VIDEO   = r"C:\Users\nacho\OneDrive\Desktop\f14.mp4"
OUT_DIR = r"C:\Users\nacho\OneDrive\Desktop"
N       = 8

bpy.ops.wm.read_factory_settings(use_empty=True)

clip  = bpy.data.movieclips.load(VIDEO)
total = int(clip.frame_duration)
W, H  = clip.size
print(f"Frames: {total}  Size: {W}x{H}")
bpy.data.movieclips.remove(clip)

scene = bpy.context.scene
scene.sequence_editor_create()
scene.render.resolution_x = W
scene.render.resolution_y = H
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.use_sequencer = True
scene.render.use_compositing = False
scene.frame_start = 1
scene.frame_end = total

# Add strip directly via Python API (no operator needed)
seq_editor = scene.sequence_editor
strip = seq_editor.strips.new_movie(
    name="f14",
    filepath=VIDEO,
    channel=1,
    frame_start=1
)
strip.frame_final_end = total + 1
print(f"Strip added: {strip.name}, frames: {strip.frame_duration}")

for i in range(N):
    frame = 1 + int((total - 1) * i / (N - 1))
    scene.frame_set(frame)
    path = os.path.join(OUT_DIR, f"f14_frame_{i:02d}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"  frame {i} (#{frame}) → {path}")

print("done")
