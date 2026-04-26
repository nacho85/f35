import bpy, os

VIDEO   = r"C:\Users\nacho\OneDrive\Desktop\f14.mp4"
OUT_DIR = r"C:\Users\nacho\OneDrive\Desktop\f14frames"
N       = 20

os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
clip  = bpy.data.movieclips.load(VIDEO)
total = int(clip.frame_duration)
W, H  = clip.size
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

seq_editor = scene.sequence_editor
strip = seq_editor.strips.new_movie(name="f14", filepath=VIDEO, channel=1, frame_start=1)

for i in range(N):
    frame = 1 + int((total - 1) * i / (N - 1))
    scene.frame_set(frame)
    path = os.path.join(OUT_DIR, f"frame_{i:02d}_f{frame:03d}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"frame {i} (#{frame}) → {path}")

print("done")
