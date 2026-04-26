// Analiza todos los canales de rotación del GLB y encuentra cuáles tienen
// las transiciones más violentas entre keyframes consecutivos.
// Un dot product bajo entre quaterniones adyacentes → arco de 180° → artefacto violento.
import { readFileSync } from "fs";

const src     = readFileSync("public/F-35C.glb");
const jsonLen = src.readUInt32LE(12);
const binData = 20 + jsonLen + 8;
const gltf    = JSON.parse(src.slice(20, 20 + jsonLen).toString("utf8"));

const rf = (buf, off) => buf.readFloatLE(off);

const readQ = (buf, base, i) => [0,4,8,12].map(o => rf(buf, base + i*16 + o));

const dotQ = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];
const angleDeg = (a, b) => {
  const d = Math.min(1, Math.abs(dotQ(a, b)));
  return Math.acos(d) * 2 * 180 / Math.PI;
};

// Recoger todos los resultados para ordenar después
const results = [];

for (const anim of gltf.animations) {
  for (const ch of anim.channels) {
    if (ch.target.path !== "rotation") continue;

    const sampler = anim.samplers[ch.sampler];
    const acc = gltf.accessors[sampler.output];
    const count = acc.count;
    const bv  = gltf.bufferViews[acc.bufferView];
    const base = binData + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);

    const nodeIdx = ch.target.node;
    const nodeName = gltf.nodes[nodeIdx]?.name ?? `node[${nodeIdx}]`;

    // Buscar la transición más brusca entre frames consecutivos
    let maxAngle = 0;
    let maxFrame = -1;
    let prevQ = null;

    for (let i = 0; i < count; i++) {
      const q = readQ(src, base, i);
      if (prevQ !== null) {
        const ang = angleDeg(prevQ, q);
        if (ang > maxAngle) {
          maxAngle = ang;
          maxFrame = i;
        }
      }
      prevQ = q;
    }

    if (maxAngle > 0.1) {
      results.push({ animName: anim.name, nodeName, maxAngle, maxFrame, count });
    }
  }
}

// Ordenar de mayor a menor ángulo máximo
results.sort((a, b) => b.maxAngle - a.maxAngle);

console.log("=== PEORES TRANSICIONES ENTRE KEYFRAMES (por ángulo máximo) ===");
console.log(`${"animación".padEnd(35)} ${"nodo".padEnd(30)} ${"ángulo°".padStart(9)}  ${"en frame".padStart(8)}`);
console.log("-".repeat(90));
for (const r of results.slice(0, 30)) {
  console.log(
    `${r.animName.padEnd(35)} ${r.nodeName.padEnd(30)} ${r.maxAngle.toFixed(1).padStart(9)}°  frame ${r.maxFrame}/${r.count-1}`
  );
}

// Detalle específico de las animaciones del tren trasero
const gearAnims = ["F-35C-BODY.046","F-35C-BODY.047","F-35C-BODY.048",
                   "F-35C-BODY.049","F-35C-BODY.050","F-35C-BODY.051","F-35C-BODY.052",
                   "F-35C-BODY.053","F-35C-BODY.054"];

console.log("\n=== DETALLE TREN TRASERO: ángulo entre keyframes consecutivos ===");
for (const animName of gearAnims) {
  const anim = gltf.animations.find(a => a.name === animName);
  if (!anim) continue;

  for (const ch of anim.channels) {
    if (ch.target.path !== "rotation") continue;
    const sampler = anim.samplers[ch.sampler];
    const acc = gltf.accessors[sampler.output];
    const count = acc.count;
    const bv  = gltf.bufferViews[acc.bufferView];
    const base = binData + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);

    console.log(`\n  ${animName} (${count} frames):`);
    let prevQ = null;
    for (let i = 0; i < count; i++) {
      const q = readQ(src, base, i);
      const qs = q.map(v => v.toFixed(3)).join(" ");
      if (prevQ !== null) {
        const ang = angleDeg(prevQ, q);
        const flag = ang > 10 ? " *** BRUSCO" : (ang > 5 ? " ** notable" : "");
        console.log(`    f${String(i).padStart(2)}: [${qs}]  Δ${ang.toFixed(1)}°${flag}`);
      } else {
        console.log(`    f${String(i).padStart(2)}: [${qs}]  (base)`);
      }
      prevQ = q;
    }
  }
}
