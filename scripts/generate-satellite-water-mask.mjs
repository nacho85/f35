// Genera water mask de 400km × 400km a 8192×8192 px (~50m/px) basada en
// la heurística de color del satélite + OR con OSM coastline mask existente.
//
// Match exacto de la heurística applyWaterDiscard runtime (en linear color):
//   isWater = (b > r * 1.4) && (r < 0.15) && (b > 0.005)
// OR el coastline-mask.png existente (OSM precision).
//
// Estrategia (forward map):
//   1. Inicializar output = 0 (tierra)
//   2. Up-sample coastline-mask.png 4096→8192 → OR sobre output
//   3. Para cada tile z14 cacheado en /public/tiles/mapbox.satellite/14/:
//        - Cargar pixels
//        - Para cada pixel del tile, proyectar lat/lon → world XZ → output uv
//        - Aplicar heurística sobre el pixel sRGB → linear
//        - OR sobre output
//   4. Para los gaps que queden (outside z14 cached area), usar z10 tiles
//   5. Save PNG
//
// Output: public/textures/water/satellite-water-mask.png

import sharp from "sharp";
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";

const CENTER_LAT = 27.218;
const CENTER_LON = 56.378;
const MASK_KM    = 400;
const RES        = 8192;
const OUT_PATH   = "public/textures/water/satellite-water-mask.png";

const TILES_ROOT = "public/tiles/satellite";
const COASTLINE_MASK_PATH = "public/textures/water/coastline-mask.png";

// ─── Proyección scene-matched (mismo que generate-water-mask.mjs) ───────────
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
function worldXZToPixel(wx, wz) {
  return [
    (wx / (2 * HALF_M) + 0.5) * RES,
    (wz / (2 * HALF_M) + 0.5) * RES,
  ];
}

// Tile (zoom, x, y) → bbox lat/lon
function tileBbox(zoom, tx, ty) {
  const N = 2 ** zoom;
  const lonW = (tx / N) * 360 - 180;
  const lonE = ((tx + 1) / N) * 360 - 180;
  const latN = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / N))) * 180 / Math.PI;
  const latS = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 1) / N))) * 180 / Math.PI;
  return { lonW, lonE, latN, latS };
}

// Pixel (i, j) within a tile of `zoom` → lat/lon (top-left of pixel)
function tilePixelToLonLat(zoom, tx, ty, i, j, tilePxSize = 256) {
  const N = 2 ** zoom;
  const tilePxX = tx + i / tilePxSize;
  const tilePxY = ty + j / tilePxSize;
  const lon = (tilePxX / N) * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * tilePxY / N))) * 180 / Math.PI;
  return [lon, lat];
}

// sRGB byte → linear [0..1]
function srgbToLinear(b) {
  const v = b / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function isWaterHeuristic(rByte, gByte, bByte) {
  const r = srgbToLinear(rByte);
  const g = srgbToLinear(gByte);
  const b = srgbToLinear(bByte);
  return (b > r * 1.4) && (r < 0.15) && (b > 0.005);
}

// ─── Output buffer ─────────────────────────────────────────────────────────
const out = Buffer.alloc(RES * RES); // grayscale, 0 = land, 255 = water

// ─── Step 1: down-sample coastline-mask.png (16384→8192) con LANCZOS3 ─────
// Coastline base es 16k (24m/px). Downsample a 8k (50m/px) con lanczos3
// genera un gradient 0-255 en los bordes (AA), preservando sub-pixel
// precision del coastline. Threshold 128 para binarizar al final.
console.log("Step 1: cargar coastline-mask.png + lanczos3 downsample → out...");
{
  const { data, info } = await sharp(COASTLINE_MASK_PATH, { limitInputPixels: 1e9 })
    .resize(RES, RES, { kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== RES || info.height !== RES) {
    throw new Error(`coastline-mask resize: ${info.width}x${info.height}`);
  }
  const ch = info.channels;
  // Preserve full byte gradient — el smoothstep del shader lo interpretará
  // como AA edge sub-pixel.
  for (let i = 0; i < RES * RES; i++) {
    out[i] = data[i * ch];
  }
}
let waterPxAfterStep1 = 0;
for (let i = 0; i < out.length; i++) if (out[i] === 255) waterPxAfterStep1++;
console.log(`  Step 1 water: ${(100 * waterPxAfterStep1 / out.length).toFixed(2)}%`);

// ─── Step 2: forward map cada tile z14 cacheado ─────────────────────────────
async function forwardMapZoom(zoom) {
  const root = join(TILES_ROOT, String(zoom));
  if (!existsSync(root)) {
    console.log(`  zoom ${zoom}: no hay tiles cacheados, skip`);
    return 0;
  }
  let tilesProcessed = 0;
  let pixelsAdded = 0;

  // Determinar bbox aproximado del mask para filtrar tiles fuera del rango
  const HALF_LAT_DEG = MASK_KM / 2 / 110.574;
  const HALF_LON_DEG = MASK_KM / 2 / (METERS_PER_DEG_LON / 1000);
  const latMin = CENTER_LAT - HALF_LAT_DEG;
  const latMax = CENTER_LAT + HALF_LAT_DEG;
  const lonMin = CENTER_LON - HALF_LON_DEG;
  const lonMax = CENTER_LON + HALF_LON_DEG;

  const xDirs = readdirSync(root).filter(d => /^\d+$/.test(d));
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
      // Skip tile si está fuera del bbox
      if (bbox.latS > latMax || bbox.latN < latMin ||
          bbox.lonE < lonMin || bbox.lonW > lonMax) continue;

      const tilePath = join(xPath, yFile);
      let raw;
      try {
        const r = await sharp(tilePath).raw().toBuffer({ resolveWithObject: true });
        raw = { data: r.data, w: r.info.width, h: r.info.height, ch: r.info.channels };
      } catch (e) {
        console.warn(`  ⚠ skip ${tilePath}: ${e.message}`);
        continue;
      }

      // Submuestrear el tile: cada 'step' píxeles, evaluar heurística y escribir
      // sobre el output. Step se elige para que tile-step ≤ output pixel size,
      // garantizando coverage sin gaps (oversample levemente).
      // tile pixel size en metros (zoom z, tile=256):
      //   tilePxMeters = METERS_PER_TILE_AT_CENTER * (2^Z_REF / 2^zoom) / 256
      const tilePxMeters = METERS_PER_TILE_AT_CENTER * (N_REF / (2 ** zoom)) / raw.w;
      const outPxMeters = (MASK_KM * 1000) / RES;
      const step = Math.max(1, Math.floor(tilePxMeters / outPxMeters * 0.5));

      for (let j = 0; j < raw.h; j += step) {
        for (let i = 0; i < raw.w; i += step) {
          const idx = (j * raw.w + i) * raw.ch;
          const rB = raw.data[idx + 0];
          const gB = raw.data[idx + 1];
          const bB = raw.data[idx + 2];
          if (!isWaterHeuristic(rB, gB, bB)) continue;
          const [lon, lat] = tilePixelToLonLat(zoom, tx, ty, i + 0.5, j + 0.5, raw.w);
          const [wx, wz] = lonLatToWorldXZ(lon, lat);
          const [px, py] = worldXZToPixel(wx, wz);
          const xx = Math.floor(px), yy = Math.floor(py);
          if (xx < 0 || xx >= RES || yy < 0 || yy >= RES) continue;
          const oi = yy * RES + xx;
          if (out[oi] !== 255) {
            out[oi] = 255;
            pixelsAdded++;
          }
        }
      }
      tilesProcessed++;
      if (tilesProcessed % 100 === 0) {
        console.log(`    z${zoom} processed ${tilesProcessed} tiles, +${pixelsAdded} px`);
      }
    }
  }
  console.log(`  z${zoom}: ${tilesProcessed} tiles, +${pixelsAdded} px water`);
  return pixelsAdded;
}

console.log("Step 2: forward map z14 satellite (heurística color)...");
await forwardMapZoom(14);

console.log("Step 3: forward map z10 satellite (heurística color, fallback)...");
await forwardMapZoom(10);

// ─── Step 4: save (sin procesamiento extra — match exacto del terreno) ────
// REMOVED: morph opening, erode+flood+dilate+AND, OSM land-override,
// blur. El user explícitamente pidió que el FFT respete el satellite map
// sin borroneos: solo OSM coastline + heurística color, OR'd. La cobertura
// del FFT matchea exactamente al área que el terreno descarta en runtime.
let waterFinal = 0;
for (let i = 0; i < out.length; i++) if (out[i] === 255) waterFinal++;
console.log(`Final water: ${(100 * waterFinal / out.length).toFixed(2)}%`);

mkdirSync(dirname(OUT_PATH), { recursive: true });
await sharp(out, {
  raw: { width: RES, height: RES, channels: 1 },
}).png({ compressionLevel: 9 }).toFile(OUT_PATH);

console.log("");
console.log(`✓ ${OUT_PATH}`);
console.log(`  ${RES}×${RES} = ${(MASK_KM * 1000 / RES).toFixed(1)} m/px sobre ${MASK_KM}×${MASK_KM} km`);
console.log(`  Sources: coastline-mask (OSM) + heurística color sobre z14+z10 satellite`);
process.exit(0);
