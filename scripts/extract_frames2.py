"""Extract frames from video using Blender's VSE (Video Sequence Editor)"""
import bpy, os

VIDEO = r"C:\Users\nacho\OneDrive\Desktop\f14.mp4"
OUT   = r"C:\Users\nacho\OneDrive\Desktop"
N_FRAMES = 8

bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
scene.sequence_editor_create()
vse = scene.sequence_editor

strip = vse.sequences.new_movie(name="f14", filepath=VIDEO, channel=1, frame_start=1)
scene.render.resolution_x = strip.elements[0].orig_width
scene.render.resolution_y = strip.elements[0].orig_height
scene.render.image_settings.file_format = 'PNG'
scene.render.fps = int(strip.fps)

total = strip.frame_duration
print(f"Total frames: {total}, FPS: {strip.fps}")

for i in range(N_FRAMES):
    frame = 1 + int(total * i / (N_FRAMES - 1))
    scene.frame_set(frame)
    path = os.path.join(OUT, f"f14_frame_{i:02d}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"Saved frame {i} (#{frame}): {path}")
