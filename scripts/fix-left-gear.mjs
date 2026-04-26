// Corrige F-35C-BODY.049: keyframes f22-f29 tienen datos corruptos.
//
// Diagnóstico (ejecutar diagnose-gear-interpolation.mjs para confirmar):
//   f22: Δ22.8°  f23: Δ26.0°  f24: Δ53.1°  f25: Δ13.0°  f26: Δ6.7°
//   f27: Δ75.4°  ← salto masivo (Y/Z vuelven de golpe a ~0)
//   f28: Δ1.7°   ← f28 es el ÚNICO frame limpio en la zona corrupta
//   f29: Δ108.6° ← stow final también corrupto
//
// Observación clave: la trayectoria suave f16-f21 extrapola exactamente hacia
// f28=[0.982,-0.005,-0.004,0.189]. Es el punto de reposo real.
//
// Fix:
//   • SLERP suave f22-f28 entre f21 (último limpio) y f29 (posición plegada correcta).
//   • f29 queda sin tocar (es la posición estacionada visualmente correcta).
//   • f0-f21 NO se tocan.
import { readFileSync, writeFileSync, copyFileSync } from "fs";

const src     = readFileSync("public/F-35C.glb");
const jsonLen = src.readUInt32LE(12);
const binData = 20 + jsonLen + 8;
const gltf    = JSON.parse(src.slice(20, 20 + jsonLen).toString("utf8"));

const getBase = (accIdx) => {
  const acc = gltf.accessors[accIdx];
  const bv  = gltf.bufferViews[acc.bufferView];
  return binData + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
};
const rf = (buf, off) => buf.readFloatLE(off);
const wf = (buf, off, v) => buf.writeFloatLE(v, off);

const qNorm  = q => { const m = Math.sqrt(q.reduce((s,v)=>s+v*v,0)); return q.map(v=>v/m); };
const qSlerp = (a, b, t) => {
  let dot = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];
  const bv = dot < 0 ? b.map(v=>-v) : b;
  dot = Math.abs(dot);
  if (dot > 0.9995) return qNorm(a.map((v,i)=>v+t*(bv[i]-v)));
  const th0 = Math.acos(dot), th = th0*t;
  const s0 = Math.cos(th) - dot*Math.sin(th)/Math.sin(th0);
  const s1 = Math.sin(th)/Math.sin(th0);
  return qNorm(a.map((v,i)=>s0*v+s1*bv[i]));
};
const readQ  = (buf, base, i) => [0,4,8,12].map(o => rf(buf, base + i*16 + o));
const writeQ = (buf, base, i, q) => [0,4,8,12].forEach((o,j) => wf(buf, base + i*16 + o, q[j]));

const anim = gltf.animations.find(a => a.name === "F-35C-BODY.049");
const ch   = anim.channels.find(c => c.target.path === "rotation");
const base = getBase(anim.samplers[ch.sampler].output);

const qF21 = readQ(src, base, 21);  // último frame limpio: [0.899,-0.020,-0.007,0.438]
const qF29 = readQ(src, base, 29);  // posición plegada correcta: [0.535,-0.710,-0.362,0.282]

console.log("=== F-35C-BODY.049 ANTES (f21-f29) ===");
for (let i = 21; i <= 29; i++)
  console.log(`  f${i}: ${readQ(src,base,i).map(v=>v.toFixed(4)).join(" ")}`);

console.log(`\nEndpoints elegidos:`);
console.log(`  f21 (último limpio): ${qF21.map(v=>v.toFixed(4)).join(" ")}`);
console.log(`  f29 (plegado real):  ${qF29.map(v=>v.toFixed(4)).join(" ")}`);

const mod = Buffer.from(src);

// SLERP f22-f28 entre f21 y f29 — f29 queda sin tocar
for (let i = 22; i <= 28; i++) {
  const t = (i - 21) / (29 - 21);   // 0 en f21, 1 en f29
  writeQ(mod, base, i, qSlerp(qF21, qF29, t));
}

console.log("\n=== F-35C-BODY.049 DESPUÉS (f21-f29) ===");
for (let i = 21; i <= 29; i++)
  console.log(`  f${i}: ${readQ(mod,base,i).map(v=>v.toFixed(4)).join(" ")}`);

copyFileSync("public/F-35C.glb", "public/F-35C.glb.bak");
writeFileSync("public/F-35C.glb", mod);
console.log("\n✓ public/F-35C.glb actualizado  (backup: F-35C.glb.bak)");
