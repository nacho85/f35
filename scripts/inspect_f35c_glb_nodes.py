import struct, json, sys

GLB = "C:/devs/f35/public/F-35C.glb"

with open(GLB, "rb") as f:
    magic, version, length = struct.unpack("<III", f.read(12))
    chunk0_len, chunk0_type = struct.unpack("<II", f.read(8))
    json_data = json.loads(f.read(chunk0_len))

nodes  = json_data.get("nodes", [])
meshes = json_data.get("meshes", [])
accessors = json_data.get("accessors", [])

# Buscar nodos que tengan "055" o "056" en el nombre
print("=== Nodos con 055 o 056 ===")
for i, n in enumerate(nodes):
    name = n.get("name", "")
    if "055" in name or "056" in name:
        mesh_idx = n.get("mesh")
        mesh_name = meshes[mesh_idx]["name"] if mesh_idx is not None else "(no mesh)"
        prims = meshes[mesh_idx]["primitives"] if mesh_idx is not None else []
        total_verts = 0
        for p in prims:
            pos_acc = p["attributes"].get("POSITION")
            if pos_acc is not None:
                total_verts += accessors[pos_acc]["count"]
        print(f"  node[{i}] '{name}'  mesh[{mesh_idx}]='{mesh_name}'  prims={len(prims)}  verts={total_verts}")

print("\n=== Meshes con 055 o 056 ===")
for i, m in enumerate(meshes):
    name = m.get("name", "")
    if "055" in name or "056" in name:
        total_verts = sum(accessors[p["attributes"]["POSITION"]]["count"] for p in m["primitives"] if "POSITION" in p["attributes"])
        print(f"  mesh[{i}] '{name}'  prims={len(m['primitives'])}  verts={total_verts}")
