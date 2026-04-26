// Lee el GLB y lista los track names de Armature.002 y Armature.009
import { readFileSync } from "fs";

const src     = readFileSync("public/F-35C.glb");
const jsonLen = src.readUInt32LE(12);
const gltf    = JSON.parse(src.slice(20, 20 + jsonLen).toString("utf8"));

const targets = ["Armature.002", "Armature.009", "Armature.026",
                 "Armature", "Armature.001", "Armature.003"];

for (const animName of targets) {
  const anim = gltf.animations.find(a => a.name === animName);
  if (!anim) { console.log(`\n[${animName}] NOT FOUND`); continue; }
  console.log(`\n=== ${animName} (${anim.channels.length} channels) ===`);
  const seen = new Set();
  for (const ch of anim.channels) {
    const node = gltf.nodes[ch.target.node];
    const key  = `${node?.name ?? "?"}  .${ch.target.path}`;
    if (!seen.has(key)) { seen.add(key); console.log(`  ${key}`); }
  }
}
