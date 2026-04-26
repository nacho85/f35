/**
 * Extract the airframe texture from a GLB as-is (no coordinate conversion).
 * Usage: node scripts/extract_texture.mjs <input.glb> <output.png>
 */
import { NodeIO } from "@gltf-transform/core";
import { writeFileSync } from "fs";

const [,, glbIn, pngOut] = process.argv;

if (!glbIn || !pngOut) {
  console.error("Usage: node extract_texture.mjs <input.glb> <output.png>");
  process.exit(1);
}

const io = new NodeIO();
const doc = await io.read(glbIn);

const textures = doc.getRoot().listTextures();
const airframe = textures.reduce((a, b) =>
  a.getImage().byteLength > b.getImage().byteLength ? a : b
);

writeFileSync(pngOut, airframe.getImage());
console.log(`OK ${pngOut}  (${airframe.getImage().byteLength} bytes)`);
