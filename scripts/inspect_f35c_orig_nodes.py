import struct, json

GLB = "C:/devs/f35/public/F-35C.glb"

with open(GLB, "rb") as f:
    magic, version, length = struct.unpack("<III", f.read(12))
    chunk0_len, chunk0_type = struct.unpack("<II", f.read(8))
    json_data = json.loads(f.read(chunk0_len))

nodes     = json_data.get("nodes", [])
meshes    = json_data.get("meshes", [])
accessors = json_data.get("accessors", [])

def node_verts(mesh_idx):
    if mesh_idx is None: return 0
    return sum(accessors[p["attributes"]["POSITION"]]["count"]
               for p in meshes[mesh_idx]["primitives"]
               if "POSITION" in p["attributes"])

print("=== Nodos con 055 o 056 ===")
for i, n in enumerate(nodes):
    name = n.get("name", "")
    if "055" in name or "056" in name:
        midx = n.get("mesh")
        mname = meshes[midx]["name"] if midx is not None else "(no mesh)"
        verts = node_verts(midx)
        print(f"  node[{i}] '{name}'  mesh='{mname}'  verts={verts}")
