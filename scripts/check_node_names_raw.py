import struct, json

for path, label in [
    ("C:/devs/f35/public/F-35C.glb", "NEW (post-split)"),
    ("C:/devs/f35/public/F-35C.glb.bak_presplit", "ORIGINAL (pre-split)"),
]:
    print(f"\n=== {label} ===")
    with open(path, "rb") as f:
        magic, version, length = struct.unpack("<III", f.read(12))
        chunk0_len, chunk0_type = struct.unpack("<II", f.read(8))
        data = json.loads(f.read(chunk0_len))
    nodes = data.get("nodes", [])
    for n in nodes:
        name = n.get("name", "")
        if "055" in name or "056" in name:
            print(f"  '{name}'  has_mesh={n.get('mesh') is not None}")
