"""
Blender script: imports patuxent.fbx, applies texture, scales to real size, exports GLB.
Run with: blender --background --python scripts/convert_patuxent.py

USNS Patuxent (Henry J. Kaiser-class T-AO) real length: ~206m
Project scale: 1 unit = 1 meter
"""

import bpy
import os

FBX_PATH   = r"C:\Users\nacho\OneDrive\Desktop\cadnav\patuxent.fbx"
TEX_PATH   = r"C:\Users\nacho\OneDrive\Desktop\cadnav\bu_ji_jian_01.jpg"
OUT_PATH   = r"C:\devs\f35\public\usns_patuxent.glb"

REAL_LENGTH_M = 206.0  # Henry J. Kaiser class: 206m

# ── 1. Clear scene ──────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

# ── 2. Import FBX ───────────────────────────────────────────────────────────
bpy.ops.import_scene.fbx(filepath=FBX_PATH)

imported = [o for o in bpy.context.scene.objects if o.type == "MESH"]
print(f"[patuxent] Imported {len(imported)} mesh objects")

if not imported:
    raise RuntimeError("No meshes imported — check FBX path")

# ── 3. Measure bounding box & scale to real size ────────────────────────────
import mathutils

min_x = min_y = min_z =  1e9
max_x = max_y = max_z = -1e9

for obj in imported:
    for corner in obj.bound_box:
        world = obj.matrix_world @ mathutils.Vector(corner)
        min_x = min(min_x, world.x); max_x = max(max_x, world.x)
        min_y = min(min_y, world.y); max_y = max(max_y, world.y)
        min_z = min(min_z, world.z); max_z = max(max_z, world.z)

dims = (max_x - min_x, max_y - min_y, max_z - min_z)
current_length = max(dims)
scale_factor = REAL_LENGTH_M / current_length if current_length > 0 else 1.0

print(f"[patuxent] Current longest dim: {current_length:.4f}  →  scale: {scale_factor:.6f}")

for obj in imported:
    obj.scale *= scale_factor

bpy.ops.object.select_all(action="DESELECT")
for obj in imported:
    obj.select_set(True)
bpy.context.view_layer.objects.active = imported[0]
bpy.ops.object.transform_apply(scale=True)

# Centre on origin (waterline at Y=0)
bpy.ops.object.select_all(action="DESELECT")
for obj in imported:
    obj.select_set(True)
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")

# Recalculate bounding box after scale
min_z2 = min(
    (obj.matrix_world @ mathutils.Vector(c)).z
    for obj in imported for c in obj.bound_box
)
for obj in imported:
    obj.location.z -= min_z2        # hull bottom at z=0
    obj.location.x  = 0
    obj.location.y  = 0

bpy.ops.object.transform_apply(location=True)

# ── 4. Apply texture to all materials ───────────────────────────────────────
tex_image = bpy.data.images.load(TEX_PATH)

def apply_texture(mat):
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # Check if already has an image texture node
    for n in nodes:
        if n.type == "TEX_IMAGE" and n.image:
            return  # already has texture

    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return

    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = tex_image
    tex_node.location = (-300, 300)
    links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])

for obj in imported:
    for slot in obj.material_slots:
        if slot.material:
            apply_texture(slot.material)

print(f"[patuxent] Texture applied: {TEX_PATH}")

# ── 5. Export GLB ────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="DESELECT")
for obj in imported:
    obj.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=OUT_PATH,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_yup=True,
)

print(f"[patuxent] Exported → {OUT_PATH}")
