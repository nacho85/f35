/**
 * Replace the airframe texture in a GLB without any coordinate conversion.
 * Usage: node scripts/replace_texture.mjs <input.glb> <new_texture.png> <output.glb>
 */
import { NodeIO } from "@gltf-transform/core";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const [,, glbIn, pngIn, glbOut] = process.argv;

if (!glbIn || !pngIn || !glbOut) {
  console.error("Usage: node replace_texture.mjs <input.glb> <new.png> <output.glb>");
  process.exit(1);
}

const io = new NodeIO();
const doc = await io.read(glbIn);

const textures = doc.getRoot().listTextures();
if (textures.length === 0) {
  console.error("No textures found in GLB");
  process.exit(1);
}

// Find the largest texture (the airframe)
const airframe = textures.reduce((a, b) =>
  a.getImage().byteLength > b.getImage().byteLength ? a : b
);

const newPng = readFileSync(pngIn);
airframe.setImage(newPng);
airframe.setMimeType("image/png");

const glb = await io.writeBinary(doc);
writeFileSync(glbOut, glb);
console.log(`OK ${glbOut}`);
