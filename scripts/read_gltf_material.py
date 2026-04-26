import struct, json

with open(r"C:\devs\f35\public\f-14a_tomcat_iran.glb", "rb") as f:
    f.read(12)
    chunk_len, _ = struct.unpack("<II", f.read(8))
    data = json.loads(f.read(chunk_len))

# Dump completo del primer material con textura
for i, mat in enumerate(data.get('materials', [])):
    print(f"\n=== mat[{i}] ===")
    print(json.dumps(mat, indent=2))
    if i >= 3: break

print("\n=== extensions used ===")
print(data.get('extensionsUsed', []))
print(data.get('extensionsRequired', []))
