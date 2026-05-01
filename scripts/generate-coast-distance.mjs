// Genera distance-from-coast mask a partir de satellite-water-mask.png.
//
// Para cada pixel de agua, calcula la distancia (Manhattan) al pixel de tierra
// más cercano vía BFS layer-by-layer. Output: grayscale donde
//   0   = tierra (o pixel a 0 px de tierra)
//   255 = ≥ MAX_DIST pixels de cualquier tierra (mar profundo)
//
// MAX_DIST se elige en pixeles → metros: 50m/px × 20 px = 1km.
//
// Output: public/textures/water/coast-distance.png

import sharp from "sharp";
import { mkdirSync } from "fs";
import { dirname } from "path";

const IN_PATH  = "public/textures/water/satellite-water-mask.png";
const OUT_PATH = "public/textures/water/coast-distance.png";
const RES = 8192;
const MAX_DIST = 20; // pixels = 1km a 50m/px

console.log("Cargando satellite-water-mask.png...");
const { data: maskRaw, info } = await sharp(IN_PATH).raw().toBuffer({ resolveWithObject: true });
if (info.width !== RES || info.height !== RES) {
  throw new Error(`Mask debe ser ${RES}x${RES}, es ${info.width}x${info.height}`);
}
const ch = info.channels;

// water[i] = 1 si agua, 0 si tierra
const water = new Uint8Array(RES * RES);
for (let i = 0; i < RES * RES; i++) {
  water[i] = maskRaw[i * ch] >= 128 ? 1 : 0;
}
let waterPx = 0;
for (let i = 0; i < water.length; i++) waterPx += water[i];
console.log(`  water: ${(100 * waterPx / water.length).toFixed(2)}%`);

// out[i] = 0 (tierra) o distancia escalada [1..255]
const out = new Uint8Array(RES * RES);

// BFS desde toda la tierra hacia el agua.
// covered[i] = 1 si ya fue alcanzado por el frente
const covered = new Uint8Array(RES * RES);
let frontier = [];
for (let i = 0; i < RES * RES; i++) {
  if (water[i] === 0) {
    covered[i] = 1;
    frontier.push(i);
  }
}
console.log(`  Land seed: ${frontier.length.toLocaleString()} pixels`);

console.log(`BFS hasta ${MAX_DIST} pixels (${MAX_DIST * 50}m)...`);
for (let d = 1; d <= MAX_DIST; d++) {
  const next = [];
  const distVal = Math.round((d / MAX_DIST) * 255);
  for (let qi = 0; qi < frontier.length; qi++) {
    const idx = frontier[qi];
    const x = idx % RES;
    const y = (idx - x) / RES;
    // 4-connected
    if (x > 0) {
      const ni = idx - 1;
      if (!covered[ni] && water[ni]) { covered[ni] = 1; out[ni] = distVal; next.push(ni); }
    }
    if (x < RES - 1) {
      const ni = idx + 1;
      if (!covered[ni] && water[ni]) { covered[ni] = 1; out[ni] = distVal; next.push(ni); }
    }
    if (y > 0) {
      const ni = idx - RES;
      if (!covered[ni] && water[ni]) { covered[ni] = 1; out[ni] = distVal; next.push(ni); }
    }
    if (y < RES - 1) {
      const ni = idx + RES;
      if (!covered[ni] && water[ni]) { covered[ni] = 1; out[ni] = distVal; next.push(ni); }
    }
  }
  console.log(`  d=${d}: ${next.length.toLocaleString()} new pixels`);
  frontier = next;
  if (frontier.length === 0) break;
}

// Pixels de agua que NO fueron alcanzados (más allá de MAX_DIST) → 255 = deep
let deepPx = 0;
for (let i = 0; i < RES * RES; i++) {
  if (water[i] === 1 && covered[i] === 0) {
    out[i] = 255;
    deepPx++;
  }
}
console.log(`  Deep (≥${MAX_DIST}px): ${deepPx.toLocaleString()}`);

// Blur el resultado del BFS — el BFS produce solo MAX_DIST niveles discretos
// (cada step = 1px), y al interpolar lineal en el shader se ven los escalones
// como líneas. Box blur radio 4px (=200m) suaviza el gradiente sin perder
// la silueta de la costa.
console.log("Box blur sobre coast distance para suavizar steps...");
function boxBlur1D(src, dst, w, h, r, isHorizontal) {
  if (isHorizontal) {
    for (let y = 0; y < h; y++) {
      const off = y * w;
      let sum = 0;
      for (let x = 0; x <= r && x < w; x++) sum += src[off + x];
      let n = Math.min(r + 1, w);
      dst[off] = Math.round(sum / n);
      for (let x = 1; x < w; x++) {
        if (x - r - 1 >= 0) { sum -= src[off + x - r - 1]; n--; }
        if (x + r < w) { sum += src[off + x + r]; n++; }
        dst[off + x] = Math.round(sum / n);
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = 0; y <= r && y < h; y++) sum += src[y * w + x];
      let n = Math.min(r + 1, h);
      dst[x] = Math.round(sum / n);
      for (let y = 1; y < h; y++) {
        if (y - r - 1 >= 0) { sum -= src[(y - r - 1) * w + x]; n--; }
        if (y + r < h) { sum += src[(y + r) * w + x]; n++; }
        dst[y * w + x] = Math.round(sum / n);
      }
    }
  }
}
const tmp = new Uint8Array(RES * RES);
const smooth = new Uint8Array(RES * RES);
boxBlur1D(out, tmp, RES, RES, 4, true);
boxBlur1D(tmp, smooth, RES, RES, 4, false);

mkdirSync(dirname(OUT_PATH), { recursive: true });
await sharp(smooth, {
  raw: { width: RES, height: RES, channels: 1 },
}).png({ compressionLevel: 9 }).toFile(OUT_PATH);

console.log("");
console.log(`✓ ${OUT_PATH}`);
console.log(`  ${RES}×${RES} grayscale, ${MAX_DIST * 50}m fade-out`);
