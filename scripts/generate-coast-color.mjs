// Genera coast-color.png — textura RGB 1024×1024 (~390m/px) con el color
// promediado de la satelital en cada pixel del agua. Para usar como
// uShallowColor variable regional en el shader del FFT.
//
// Estrategia:
//   1. Para cada z14 tile cacheado, iterar sus pixels (subsample para
//      velocidad). Si el pixel cae sobre WATER (según satellite-water-mask),
//      acumular sum_R/G/B y count en el bin correspondiente del output.
//   2. Box blur grande (radio 12px = ~4.7km) sobre sum y count.
//   3. Color final = blurred_sum / blurred_count → smooth gradients regionales.
//   4. Donde blurred_count == 0 (alguna isla rodeada de tierra) → fallback turquesa.
//
// Output: public/textures/water/coast-color.png

import sharp from "sharp";
import { mkdirSync, readdirSync, existsSync, statSync } from "fs";
import { dirname, join } from "path";

const CENTER_LAT = 27.218;
const CENTER_LON = 56.378;
const MASK_KM    = 400;
const RES        = 1024;
const MASK_RES   = 8192;
const BLUR_RADIUS = 3; // ~1.2km — preserva detalles locales (harbor cyan, shallow turquesa)
const TILES_ROOT = "public/tiles/satellite";
const MASK_PATH  = "public/textures/water/satellite-water-mask.png";
const OUT_PATH   = "public/textures/water/coast-color.png";

// Fallback color (turquesa)
const FALLBACK = { r: 76, g: 181, b: 196 }; // 0x4cb5c4

// ─── Proyección scene-matched ───────────────────────────────────────────────
const EARTH_CIRC = 40075016.686;
const Z_REF = 14;
const N_REF = 2 ** Z_REF;
const METERS_PER_TILE_AT_CENTER = EARTH_CIRC * Math.cos(CENTER_LAT * Math.PI / 180) / N_REF;
const METERS_PER_DEG_LON = EARTH_CIRC * Math.cos(CENTER_LAT * Math.PI / 180) / 360;

function latToTileYFrac(lat, zoom = Z_REF) {
  const latRad = lat * Math.PI / 180;
  const m = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return ((1 - m / Math.PI) / 2) * (2 ** zoom);
}
const tileY_center_z14 = latToTileYFrac(CENTER_LAT, Z_REF);

function lonLatToWorldXZ(lon, lat) {
  const x = (lon - CENTER_LON) * METERS_PER_DEG_LON;
  const z = (latToTileYFrac(lat) - tileY_center_z14) * METERS_PER_TILE_AT_CENTER;
  return [x, z];
}

const HALF_M = MASK_KM * 1000 / 2;
function worldXZToOutPixel(wx, wz) {
  const px = (wx / (2 * HALF_M) + 0.5) * RES;
  const py = (wz / (2 * HALF_M) + 0.5) * RES;
  return [px, py];
}

function tileBbox(zoom, tx, ty) {
  const N = 2 ** zoom;
  const lonW = (tx / N) * 360 - 180;
  const lonE = ((tx + 1) / N) * 360 - 180;
  const latN = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / N))) * 180 / Math.PI;
  const latS = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 1) / N))) * 180 / Math.PI;
  return { lonW, lonE, latN, latS };
}

function tilePixelToLonLat(zoom, tx, ty, i, j, tilePxSize = 256) {
  const N = 2 ** zoom;
  const tilePxX = tx + i / tilePxSize;
  const tilePxY = ty + j / tilePxSize;
  const lon = (tilePxX / N) * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * tilePxY / N))) * 180 / Math.PI;
  return [lon, lat];
}

// ─── Cargar mask ────────────────────────────────────────────────────────────
console.log("Cargando satellite-water-mask.png...");
const { data: maskRaw, info: maskInfo } = await sharp(MASK_PATH)
  .raw().toBuffer({ resolveWithObject: true });
const maskCh = maskInfo.channels;
function isWaterAtOutPx(px, py) {
  // Mapea (px,py) en RES → posición en MASK_RES
  const mx = Math.floor((px + 0.5) / RES * MASK_RES);
  const my = Math.floor((py + 0.5) / RES * MASK_RES);
  if (mx < 0 || mx >= MASK_RES || my < 0 || my >= MASK_RES) return false;
  return maskRaw[(my * MASK_RES + mx) * maskCh] >= 128;
}

// ─── Forward map z14 tiles → sum, count ─────────────────────────────────────
const sumR = new Uint32Array(RES * RES);
const sumG = new Uint32Array(RES * RES);
const sumB = new Uint32Array(RES * RES);
const count = new Uint32Array(RES * RES);

const HALF_LAT_DEG = MASK_KM / 2 / 110.574;
const HALF_LON_DEG = MASK_KM / 2 / (METERS_PER_DEG_LON / 1000);

async function processZoom(zoom) {
  const root = join(TILES_ROOT, String(zoom));
  if (!existsSync(root)) return 0;
  const xDirs = readdirSync(root).filter(d => /^\d+$/.test(d));
  let processed = 0;
  for (const xDir of xDirs) {
    const xPath = join(root, xDir);
    if (!statSync(xPath).isDirectory()) continue;
    const tx = Number(xDir);
    const yFiles = readdirSync(xPath);
    for (const yFile of yFiles) {
      const m = yFile.match(/^(\d+)\.(jpg|jpeg|png)$/);
      if (!m) continue;
      const ty = Number(m[1]);
      const bbox = tileBbox(zoom, tx, ty);
      if (bbox.latS > CENTER_LAT + HALF_LAT_DEG ||
          bbox.latN < CENTER_LAT - HALF_LAT_DEG ||
          bbox.lonE < CENTER_LON - HALF_LON_DEG ||
          bbox.lonW > CENTER_LON + HALF_LON_DEG) continue;

      const tilePath = join(xPath, yFile);
      let raw;
      try {
        const r = await sharp(tilePath).raw().toBuffer({ resolveWithObject: true });
        raw = { data: r.data, w: r.info.width, h: r.info.height, ch: r.info.channels };
      } catch { continue; }

      // Subsample: cada output pixel cubre ~400m. z14 tile es 2.4km → step
      // de 16 (cubre cada 150m del tile). Suficiente.
      const step = 4;
      for (let j = 0; j < raw.h; j += step) {
        for (let i = 0; i < raw.w; i += step) {
          const idx = (j * raw.w + i) * raw.ch;
          const rB = raw.data[idx + 0];
          const gB = raw.data[idx + 1];
          const bB = raw.data[idx + 2];
          const [lon, lat] = tilePixelToLonLat(zoom, tx, ty, i + 0.5, j + 0.5, raw.w);
          const [wx, wz] = lonLatToWorldXZ(lon, lat);
          const [opx, opy] = worldXZToOutPixel(wx, wz);
          const px = Math.floor(opx), py = Math.floor(opy);
          if (px < 0 || px >= RES || py < 0 || py >= RES) continue;
          if (!isWaterAtOutPx(px, py)) continue;
          const oi = py * RES + px;
          sumR[oi] += rB;
          sumG[oi] += gB;
          sumB[oi] += bB;
          count[oi]++;
        }
      }
      processed++;
      if (processed % 500 === 0) console.log(`    z${zoom} ${processed} tiles`);
    }
  }
  console.log(`  z${zoom}: ${processed} tiles`);
  return processed;
}

console.log("Forward map z14 tiles → sum/count...");
await processZoom(14);
console.log("Forward map z10 tiles (fallback)...");
await processZoom(10);

// ─── Box blur sum y count ───────────────────────────────────────────────────
console.log(`Box blur radio ${BLUR_RADIUS} sobre sum y count...`);

function boxBlur1D(src, dst, w, h, r, isHorizontal) {
  if (isHorizontal) {
    for (let y = 0; y < h; y++) {
      const off = y * w;
      let sum = 0;
      for (let x = 0; x <= r && x < w; x++) sum += src[off + x];
      let n = Math.min(r + 1, w);
      dst[off] = sum / n;
      for (let x = 1; x < w; x++) {
        if (x - r - 1 >= 0) { sum -= src[off + x - r - 1]; n--; }
        if (x + r < w) { sum += src[off + x + r]; n++; }
        dst[off + x] = sum / n;
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = 0; y <= r && y < h; y++) sum += src[y * w + x];
      let n = Math.min(r + 1, h);
      dst[x] = sum / n;
      for (let y = 1; y < h; y++) {
        if (y - r - 1 >= 0) { sum -= src[(y - r - 1) * w + x]; n--; }
        if (y + r < h) { sum += src[(y + r) * w + x]; n++; }
        dst[y * w + x] = sum / n;
      }
    }
  }
}

function blur2D(src, w, h, r) {
  const tmp = new Float64Array(src.length);
  const dst = new Float64Array(src.length);
  boxBlur1D(src, tmp, w, h, r, true);
  boxBlur1D(tmp, dst, w, h, r, false);
  return dst;
}

const blurR = blur2D(sumR, RES, RES, BLUR_RADIUS);
const blurG = blur2D(sumG, RES, RES, BLUR_RADIUS);
const blurB = blur2D(sumB, RES, RES, BLUR_RADIUS);
const blurC = blur2D(count, RES, RES, BLUR_RADIUS);

// ─── Final RGB ──────────────────────────────────────────────────────────────
console.log("Computing final RGB...");
const out = Buffer.alloc(RES * RES * 3);
let filled = 0;
for (let i = 0; i < RES * RES; i++) {
  if (blurC[i] > 0.001) {
    out[i * 3 + 0] = Math.min(255, Math.max(0, Math.round(blurR[i] / blurC[i])));
    out[i * 3 + 1] = Math.min(255, Math.max(0, Math.round(blurG[i] / blurC[i])));
    out[i * 3 + 2] = Math.min(255, Math.max(0, Math.round(blurB[i] / blurC[i])));
    filled++;
  } else {
    out[i * 3 + 0] = FALLBACK.r;
    out[i * 3 + 1] = FALLBACK.g;
    out[i * 3 + 2] = FALLBACK.b;
  }
}
console.log(`  Filled: ${(100 * filled / (RES * RES)).toFixed(2)}%`);

mkdirSync(dirname(OUT_PATH), { recursive: true });
await sharp(out, {
  raw: { width: RES, height: RES, channels: 3 },
}).png({ compressionLevel: 9 }).toFile(OUT_PATH);

console.log("");
console.log(`✓ ${OUT_PATH}`);
console.log(`  ${RES}×${RES} RGB · ${(MASK_KM * 1000 / RES).toFixed(0)}m/px · blur σ≈${BLUR_RADIUS * (MASK_KM / RES)}km`);
