// Genera Signed Distance Field (SDF) del coastline-mask.png usando BFS
// (mucho menos memoria que Felzenszwalb 1D EDT — no crashea con 16k).
//
// Para cada pixel cerca del coastline, calcula la distancia (chebyshev/8-conn)
// al pixel de borde más cercano. El SIGN indica de qué lado:
//   positivo = water (offshore)
//   negativo = land (inland)
//
// Limitamos el BFS a ±MAX_DIST pixels — no necesitamos distancias enormes,
// solo lo suficiente para AA edge + shallow gradient.
//
// Encoding: byte = 128 + signed_distance * SCALE, clamped [0, 255]
//
// Output: public/textures/water/coastline-sdf.png

import sharp from "sharp";
import { mkdirSync } from "fs";
import { dirname } from "path";

const IN_PATH  = "public/textures/water/coastline-mask.png";
const OUT_PATH = "public/textures/water/coastline-sdf.png";
const RES = 16384;        // matches input mask resolution
const MAX_DIST = 25;       // pixels (24.4m/px → ~600m max range)
const ENCODE_SCALE = 10;   // 10 bytes/pixel-SDF → range ±12.5px = ±305m
                            // Cada byte = 2.44m → AA edge ultra-fino
const ENCODE_OFFSET = 128;

console.log(`Cargando ${IN_PATH}...`);
const { data, info } = await sharp(IN_PATH, { limitInputPixels: 1e9 })
  .raw().toBuffer({ resolveWithObject: true });
if (info.width !== RES || info.height !== RES) {
  throw new Error(`Mask ${info.width}x${info.height} != ${RES}x${RES}`);
}
const ch = info.channels;

// water[i] = 1 si water (>=128), 0 si land
console.log("Construyendo water/land mask...");
const water = new Uint8Array(RES * RES);
for (let i = 0; i < RES * RES; i++) water[i] = data[i * ch] >= 128 ? 1 : 0;

// Output: distance to nearest boundary, signed.
// Inicializamos con MAX_DIST+1 (= "más allá del rango")
const dist = new Int8Array(RES * RES);
dist.fill(MAX_DIST + 1);

// Boundary pixels = 0. BFS de ahí hacia afuera.
console.log("Detectando boundary pixels...");
const queue = new Int32Array(RES * RES * 4); // pre-alloc
let qHead = 0, qTail = 0;

for (let y = 0; y < RES; y++) {
  for (let x = 0; x < RES; x++) {
    const i = y * RES + x;
    const w_ = water[i];
    let isBoundary = false;
    if (x > 0       && water[i - 1]   !== w_) { isBoundary = true; }
    else if (x < RES - 1 && water[i + 1]   !== w_) { isBoundary = true; }
    else if (y > 0       && water[i - RES] !== w_) { isBoundary = true; }
    else if (y < RES - 1 && water[i + RES] !== w_) { isBoundary = true; }
    if (isBoundary) {
      dist[i] = 0;
      queue[qTail++] = i;
    }
  }
}
console.log(`  Boundary: ${qTail.toLocaleString()} pixels`);

console.log(`BFS hasta ${MAX_DIST}px (chebyshev/8-conn)...`);
const t0 = Date.now();
// 8-connected BFS — chebyshev distance es buena aproximación de euclidea
// para SDF visual. Cada step incrementa en 1.
while (qHead < qTail) {
  const idx = queue[qHead++];
  const d = dist[idx];
  if (d >= MAX_DIST) continue;
  const x = idx % RES;
  const y = (idx - x) / RES;
  const nd = d + 1;
  // 8-connected
  for (let dy = -1; dy <= 1; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= RES) continue;
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const xx = x + dx;
      if (xx < 0 || xx >= RES) continue;
      const ni = yy * RES + xx;
      if (dist[ni] > nd) {
        dist[ni] = nd;
        if (nd < MAX_DIST) queue[qTail++] = ni;
      }
    }
  }
}
console.log(`  BFS done in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${qTail.toLocaleString()} pixel pushes`);

console.log("Encoding SDF a 8-bit...");
const out = Buffer.alloc(RES * RES);
for (let i = 0; i < RES * RES; i++) {
  let d = dist[i];
  if (d > MAX_DIST) d = MAX_DIST; // beyond range
  const sign = water[i] ? 1 : -1;
  const sdf = d * sign;
  const encoded = ENCODE_OFFSET + sdf * ENCODE_SCALE;
  out[i] = Math.max(0, Math.min(255, encoded));
}

mkdirSync(dirname(OUT_PATH), { recursive: true });
await sharp(out, {
  raw: { width: RES, height: RES, channels: 1 },
  limitInputPixels: 1e9,
}).png({ compressionLevel: 9 }).toFile(OUT_PATH);

console.log("");
console.log(`✓ ${OUT_PATH}`);
console.log(`  ${RES}×${RES} grayscale signed distance field`);
console.log(`  128=costa, >128=water (offshore), <128=land (inland)`);
console.log(`  1 SDF unit = 24.4m, range ±${MAX_DIST}px = ±${(MAX_DIST*24.4).toFixed(0)}m`);
