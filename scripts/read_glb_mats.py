"""Lee el chunk JSON del GLB y muestra los materiales"""
import struct, json, sys

path = r"C:\devs\f35\public\mig-29-nose-gear-groups.glb"
with open(path, "rb") as f:
    magic, version, length = struct.unpack("<III", f.read(12))
    chunk0_len, chunk0_type = struct.unpack("<II", f.read(8))
    json_data = json.loads(f.read(chunk0_len))

mats = json_data.get("materials", [])
print(f"Materiales en GLB ({len(mats)}):")
for m in mats:
    pbr = m.get("pbrMetallicRoughness", {})
    col = pbr.get("baseColorFactor", "NO FACTOR")
    tex = pbr.get("baseColorTexture", None)
    print(f"  {m['name']:40s}  color={col}  tex={'SI' if tex else 'no'}")
