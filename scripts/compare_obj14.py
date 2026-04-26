import struct, json

def read_json(path):
    with open(path, "rb") as f:
        f.read(12)
        chunk_len, _ = struct.unpack("<II", f.read(8))
        return json.loads(f.read(chunk_len))

print("=== ORIGINAL (pbr) ===")
src = read_json(r"C:\devs\f35\public\f-14a_tomcat_iran_pbr.glb")
node = next((n for n in src["nodes"] if n.get("name") == "Object_14"), None)
print(f"Node: {node}")
if node and "mesh" in node:
    mesh = src["meshes"][node["mesh"]]
    print(f"Mesh: {mesh.get('name')}  primitives: {len(mesh['primitives'])}")
    for i, p in enumerate(mesh["primitives"]):
        mat = src["materials"][p["material"]] if "material" in p else None
        print(f"  prim[{i}] mat={mat.get('name','?')[:36] if mat else 'none'}")
        pbr = mat.get("pbrMetallicRoughness", {}) if mat else {}
        print(f"    baseColorFactor={pbr.get('baseColorFactor')}  tex={pbr.get('baseColorTexture')}")

print("\n=== CURRENT (iran) ===")
dst = read_json(r"C:\devs\f35\public\F-14-iran.glb")
node2 = next((n for n in dst["nodes"] if n.get("name") == "Object_3_fuselage"), None)
print(f"Node: {node2}")
if node2 and "mesh" in node2:
    mesh2 = dst["meshes"][node2["mesh"]]
    print(f"Mesh: {mesh2.get('name')}  primitives: {len(mesh2['primitives'])}")
    for i, p in enumerate(mesh2["primitives"]):
        mat = dst["materials"][p["material"]] if "material" in p else None
        print(f"  prim[{i}] mat={mat.get('name','?')[:36] if mat else 'none'}")
        pbr = mat.get("pbrMetallicRoughness", {}) if mat else {}
        print(f"    baseColorFactor={pbr.get('baseColorFactor')}  tex={pbr.get('baseColorTexture')}")
