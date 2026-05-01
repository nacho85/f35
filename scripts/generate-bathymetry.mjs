// Genera bathymetry mask de 400×400 km a 8192×8192 (~50m/px) extrayendo
// elevation negativa de los tiles terrain-rgb cacheados (Mapbox).
//
// Mapbox terrain-rgb encoding:
//   elevation = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
// Negativos = bajo el nivel del mar = profundidad.
//
// Output:
//   public/textures/water/bathymetry.png
//   1-channel grayscale, R = clamp(depth_meters / 50, 0, 1) * 255
//   0   = costa o tierra (depth ≤ 0)
//   255 = ≥50m profundidad
//
// Estrategia: forward-map z13 tiles + z10 tiles (z13 tiene cobertura central
// alta-res, z10 cubre todo el resto). Para cada pixel del tile, proyectamos
// a output uv y guardamos la profundidad (en metros) en un Float32 buffer
// para precisión, luego encode a 8-bit al final.

import sharp from "sharp";
import { mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";

const CENTER_LAT = 27.218;
const CENTER_LON = 56.378;
const MASK_KM    = 400;
const RES        = 8192;
const MAX_DEPTH  = 50; // m, saturación del encoding 8-bit
const TILES_ROOT = "public/tiles/terrain-rgb";
const OUT_PATH   = "public/textures/water/bathymetry.png";

// ─── Proyección scene-matched ───────────────────────────────────────────────
const EARTH_CIRC = 40075016.686;
const Z_REF = 14;
const N_REF = 2 ** Z_REF;
const METERS_PER_TILE_AT_CENTER = EARTH_CIRC * Math.cos(CENTER_LAT * Math.PI / 180) / N_REF;
const METERS_PER_DEG_LON = EARTH_CIRC * Math.cos(CENTER_LAT * Math.PI / 180) / 360;

function latToTileYFrac(lat, zoom) {
  const latRad = lat * Math.PI / 180;
  const m = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return ((1 - m / Math.PI) / 2) * (2 ** zoom);
}
const tileY_center_z14 = latToTileYFrac(CENTER_LAT, Z_REF);

function lonLatToWorldXZ(lon, lat) {
  const x = (lon - CENTER_LON) * METERS_PER_DEG_LON;
  const z = (latToTileYFrac(lat, Z_REF) - tileY_center_z14) * METERS_PER_TILE_AT_CENTER;
  return [x, z];
}

const HALF_M = MASK_KM * 1000 / 2;
function worldXZToPixel(wx, wz) {
  return [
    (wx / (2 * HALF_M) + 0.5) * RES,
    (wz / (2 * HALF_M) + 0.5) * RES,
  ];
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

// Float32 buffer guarda la profundidad (metros) por pixel del output.
// Inicializamos en NaN. Pixeles que reciben un valor válido lo sobreescriben.
// Como prioridad usamos z13 (alta res) ANTES que z10 (baja res); el orden
// del processing es z13 primero, luego z10 — z10 solo escribe donde z13 no.
const depthBuf = new Float32Array(RES * RES);
depthBuf.fill(NaN);

function decodeElevation(r, g, b) {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1;
}

async function processZoom(zoom, onlyEmpty) {
  const root = join(TILES_ROOT, String(zoom));
  if (!existsSync(root)) {
    console.log(`  zoom ${zoom}: no hay tiles cacheados, skip`);
    return 0;
  }
  let tilesProcessed = 0;
  let pixelsWritten = 0;

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
      const m = yFile.match(/^(\d+)\.(png|jpg|jpeg)$/);
      if (!m) continue;
      const ty = Number(m[1]);
      const bbox = tileBbox(zoom, tx, ty);
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

      // Resolución del tile en metros y del output:
      //   tilePx = METERS_PER_TILE_AT_CENTER * (2^Z_REF / 2^zoom) / raw.w
      //   outPx  = MASK_KM * 1000 / RES = ~48.8m
      const tilePxMeters = METERS_PER_TILE_AT_CENTER * (N_REF / (2 ** zoom)) / raw.w;
      const outPxMeters = (MASK_KM * 1000) / RES;
      const step = Math.max(1, Math.floor(tilePxMeters / outPxMeters * 0.5));

      for (let j = 0; j < raw.h; j += step) {
        for (let i = 0; i < raw.w; i += step) {
          const idx = (j * raw.w + i) * raw.ch;
          const elev = decodeElevation(raw.data[idx], raw.data[idx + 1], raw.data[idx + 2]);
          if (elev >= 0) continue; // tierra
          const depth = -elev; // metros, > 0 bajo el mar
          const [lon, lat] = tilePixelToLonLat(zoom, tx, ty, i + 0.5, j + 0.5, raw.w);
          const [wx, wz] = lonLatToWorldXZ(lon, lat);
          const [px, py] = worldXZToPixel(wx, wz);
          const xx = Math.floor(px), yy = Math.floor(py);
          if (xx < 0 || xx >= RES || yy < 0 || yy >= RES) continue;
          const oi = yy * RES + xx;
          if (onlyEmpty && !isNaN(depthBuf[oi])) continue; // z13 ya escribió ahí
          depthBuf[oi] = depth;
          pixelsWritten++;
        }
      }
      tilesProcessed++;
      if (tilesProcessed % 100 === 0) {
        console.log(`    z${zoom} processed ${tilesProcessed} tiles, ${pixelsWritten.toLocaleString()} px water`);
      }
    }
  }
  console.log(`  z${zoom}: ${tilesProcessed} tiles, ${pixelsWritten.toLocaleString()} px water`);
  return pixelsWritten;
}

console.log("Step 1: bathymetry de z13 terrain-rgb (alta res)...");
await processZoom(13, false);

console.log("Step 2: bathymetry de z10 terrain-rgb (cobertura outer)...");
await processZoom(10, true);

// ─── Encode a 8-bit grayscale ──────────────────────────────────────────────
console.log("Step 3: encode depth → 8-bit (0=land, 255=≥50m)...");
const out = Buffer.alloc(RES * RES);
let waterPx = 0;
for (let i = 0; i < depthBuf.length; i++) {
  const d = depthBuf[i];
  if (isNaN(d)) {
    out[i] = 0; // land/no data
  } else {
    const v = Math.round(Math.min(d / MAX_DEPTH, 1) * 255);
    out[i] = v;
    if (v > 0) waterPx++;
  }
}
console.log(`  Water pixels: ${(100 * waterPx / out.length).toFixed(2)}%`);

mkdirSync(dirname(OUT_PATH), { recursive: true });
await sharp(out, {
  raw: { width: RES, height: RES, channels: 1 },
}).png({ compressionLevel: 9 }).toFile(OUT_PATH);

console.log("");
console.log(`✓ ${OUT_PATH}`);
console.log(`  ${RES}×${RES} grayscale, depth scale: 0=tierra, 255=≥${MAX_DEPTH}m`);
console.log(`  Source: terrain-rgb z13 (alta res) + z10 (fallback)`);
