import subprocess, os, sys

video = r"C:\Users\nacho\OneDrive\Desktop\f14.mp4"
out_dir = r"C:\Users\nacho\OneDrive\Desktop"

# Try ffmpeg locations
ffmpeg_paths = [
    r"C:\ffmpeg\bin\ffmpeg.exe",
    r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    r"C:\tools\ffmpeg.exe",
]

# Use Blender's bundled ffmpeg
blender_ffmpeg = r"C:\Program Files\Blender Foundation\Blender 5.1\ffmpeg.exe"
ffmpeg_paths.insert(0, blender_ffmpeg)

ffmpeg = None
for p in ffmpeg_paths:
    if os.path.exists(p):
        ffmpeg = p
        break

if not ffmpeg:
    # Try to find it
    import glob
    found = glob.glob(r"C:\Program Files\Blender Foundation\**\ffmpeg.exe", recursive=True)
    if found:
        ffmpeg = found[0]

if ffmpeg:
    print(f"Found ffmpeg: {ffmpeg}")
    cmd = [ffmpeg, "-i", video, "-vf", "fps=2", "-frames:v", "10",
           os.path.join(out_dir, "f14_frame_%02d.png"), "-y"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    print(result.stdout)
    print(result.stderr[-500:] if result.stderr else "")
else:
    print("ffmpeg not found")
    # List what's in Blender dir
    for root, dirs, files in os.walk(r"C:\Program Files\Blender Foundation\Blender 5.1"):
        for f in files:
            if f.endswith('.exe'):
                print(os.path.join(root, f))
        break
