// ¿La animación tiene movimiento real? Compara primer y último keyframe de rotación.
import { readFileSync } from "fs";

const src     = readFileSync("public/F-35C.glb");
const jsonLen = src.readUInt32LE(12);
const binOff  = 20 + jsonLen + 8;
const gltf    = JSON.parse(src.slice(20, 20 + jsonLen).toString("utf8"));

const rf = (o) => src.readFloatLE(o);

function getAccessorFloats(accIdx) {
  const acc = gltf.accessors[accIdx];
  const bv  = gltf.bufferViews[acc.bufferView];
  const base = binOff + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? (acc.type === "VEC4" ? 16 : acc.type === "VEC3" ? 12 : 4);
  const comps  = acc.type === "VEC4" ? 4 : acc.type === "VEC3" ? 3 : 1;
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const row = [];
    for (let c = 0; c < comps; c++) row.push(rf(base + i * stride + c * 4));
    out.push(row);
  }
  return out;
}

for (const animName of ["Armature.002", "Armature.009"]) {
  const anim = gltf.animations.find(a => a.name === animName);
  if (!anim) continue;
  console.log(`\n=== ${animName}: rango de movimiento (first vs last keyframe) ===`);
  let anyMotion = false;
  for (const ch of anim.channels) {
    if (ch.target.path !== "rotation") continue;
    const sampler = anim.samplers[ch.sampler];
    const vals    = getAccessorFloats(sampler.output);
    if (vals.length < 2) continue;
    const first = vals[0], last = vals[vals.length - 1];
    const diff  = first.reduce((s, v, i) => s + Math.abs(v - last[i]), 0);
    const node  = gltf.nodes[ch.target.node];
    if (diff > 0.001) {
      anyMotion = true;
      console.log(`  BONE ${node?.name ?? "?"}  Δ=${diff.toFixed(4)}  f0=${first.map(v=>v.toFixed(3)).join(",")}  fN=${last.map(v=>v.toFixed(3)).join(",")}`);
    }
  }
  if (!anyMotion) console.log("  → sin movimiento detectable (todos los keyframes iguales)");
}
