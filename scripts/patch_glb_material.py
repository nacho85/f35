"""
Toma el material "353cc5b5..." del f-14a_tomcat_iran_pbr.glb (original correcto)
y lo copia al F-14-iran.glb parcheando solo el JSON, sin re-exportar por Blender.
"""
import struct, json, shutil

def read_glb(path):
    with open(path, "rb") as f:
        raw = f.read()
    json_len, _ = struct.unpack_from("<II", raw, 12)
    data = json.loads(raw[20:20+json_len])
    return raw, data, json_len

TARGET = "353cc5b5-9dd1-43ef-8543-2dd94e334791"

# Leer material correcto del PBR
_, src, _ = read_glb(r"C:\devs\f35\public\f-14a_tomcat_iran_pbr.glb")
src_mat = next((m for m in src.get("materials", []) if m.get("name", "").startswith(TARGET[:8])), None)
print(f"Material fuente (pbr): {json.dumps(src_mat, indent=2)}")

# Parchear el destino
GLB_IN  = r"C:\devs\f35\public\F-14-iran.glb"
GLB_OUT = r"C:\devs\f35\public\F-14-iran.glb"
GLB_BAK = r"C:\devs\f35\public\F-14-iran.glb.bak"
shutil.copy2(GLB_IN, GLB_BAK)

raw, dst, json_len = read_glb(GLB_IN)
patched = 0
for i, mat in enumerate(dst.get("materials", [])):
    if mat.get("name", "").startswith(TARGET[:8]):
        dst["materials"][i] = src_mat
        print(f"Reemplazado mat[{i}]")
        patched += 1

if patched == 0:
    print("[!] Material no encontrado en destino"); exit()

# Reescribir GLB
new_json = json.dumps(dst, separators=(',', ':')).encode("utf-8")
pad = (4 - len(new_json) % 4) % 4
new_json += b' ' * pad

magic, version, _ = struct.unpack_from("<III", raw, 0)
bin_rest = raw[20 + json_len:]
new_total = 12 + 8 + len(new_json) + len(bin_rest)
with open(GLB_OUT, "wb") as f:
    f.write(struct.pack("<III", magic, version, new_total))
    f.write(struct.pack("<II", len(new_json), 0x4E4F534A))
    f.write(new_json)
    f.write(bin_rest)

print(f"[done] → {GLB_OUT}")
