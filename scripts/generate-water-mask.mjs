// Genera water mask combinando 2 sources:
//   1. OSM natural=coastline ways (line-precision) → flood fill desde mar
//      abierto → water = pixeles alcanzados por el flood, land = el resto.
//   2. water-manifest-z15.json → filtra leakage del flood (lugares donde
//      OSM coastline tiene gaps y el flood se mete en ríos/canales no marítimos).
//
// Resultado = OSM-flood ∩ z15-manifest.
//   - Costa precisa (OSM line-precision)
//   - Islands respected (cerrados por su propia coastline → no flood)
//   - Sin leakage por gaps OSM (z15 manifest los filtra)

import sharp from "sharp";
import { mkdirSync, readFileSync } from "fs";
import { dirname } from "path";

const CENTER_LAT = 27.218;
const CENTER_LON = 56.378;
const MASK_KM = 400;
const RES = 16384; // 24m/px — alta resolución para coastline antialiased
const Z15 = 15;
const COASTLINE_STROKE = 8; // proporcional al RES bumpeado
const OUT_PATH = "public/textures/water/coastline-mask.png";

// Proyección que matchea EXACTAMENTE el scene world coord system:
//   world_x = (lon - CENTER_LON) * (EARTH_CIRC * cos(CENTER_LAT) / 360)
//   world_z = -(latToTileY(lat) - latToTileY(CENTER_LAT)) * METERS_PER_TILE
// Esta es la fórmula que usa terrainScale.js — Mercator pero anclado al
// METERS_PER_TILE_AT_CENTER, NO al equatorial R.
const EARTH_CIRC = 40075016.686;
const Z_REF = 14; // doesn't matter — independent of zoom
const N_REF = 2 ** Z_REF;
const METERS_PER_TILE_AT_CENTER = EARTH_CIRC * Math.cos(CENTER_LAT * Math.PI / 180) / N_REF;
const METERS_PER_DEG_LON = EARTH_CIRC * Math.cos(CENTER_LAT * Math.PI / 180) / 360;

function latToTileYFrac(lat) {
  const latRad = lat * Math.PI / 180;
  const m = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return ((1 - m / Math.PI) / 2) * N_REF;
}
const tileY_center = latToTileYFrac(CENTER_LAT);

function lonLatToWorldXZ(lon, lat) {
  const x = (lon - CENTER_LON) * METERS_PER_DEG_LON;
  const z = (latToTileYFrac(lat) - tileY_center) * METERS_PER_TILE_AT_CENTER;
  return [x, z];
}

// Bbox aproximado para Overpass (en lat/lon, generoso)
const KM_PER_DEG_LAT_APPROX = 110.574;
const KM_PER_DEG_LON_APPROX = METERS_PER_DEG_LON / 1000;
const HALF_LAT = (MASK_KM / 2) / KM_PER_DEG_LAT_APPROX * 1.1;
const HALF_LON = (MASK_KM / 2) / KM_PER_DEG_LON_APPROX * 1.1;
const BBOX = {
  s: CENTER_LAT - HALF_LAT,
  w: CENTER_LON - HALF_LON,
  n: CENTER_LAT + HALF_LAT,
  e: CENTER_LON + HALF_LON,
};

const HALF_M = MASK_KM * 1000 / 2;
function lonLatToPixel(lon, lat) {
  const [wx, wz] = lonLatToWorldXZ(lon, lat);
  return [
    (wx / (2 * HALF_M) + 0.5) * RES,
    (wz / (2 * HALF_M) + 0.5) * RES,
  ];
}

// ─── Step 1: rasterizar z15 manifest (fill macro) ───────────────────────────
console.log("Step 1: water-manifest-z15.json → mask coarse...");
const manifest = JSON.parse(readFileSync("public/water-manifest-z15.json", "utf8"));
const z15Mask = Buffer.alloc(RES * RES);
for (const key of manifest.water) {
  const [tx, ty] = key.split(",").map(Number);
  const N = 2 ** Z15;
  const lonW = (tx / N) * 360 - 180;
  const lonE = ((tx + 1) / N) * 360 - 180;
  const latN = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / N))) * 180 / Math.PI;
  const latS = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 1) / N))) * 180 / Math.PI;
  const [pxW, pyN] = lonLatToPixel(lonW, latN);
  const [pxE, pyS] = lonLatToPixel(lonE, latS);
  const xMin = Math.max(0, Math.floor(pxW)), xMax = Math.min(RES, Math.ceil(pxE));
  const yMin = Math.max(0, Math.floor(pyN)), yMax = Math.min(RES, Math.ceil(pyS));
  for (let y = yMin; y < yMax; y++) {
    const off = y * RES;
    for (let x = xMin; x < xMax; x++) z15Mask[off + x] = 255;
  }
}

// ─── Step 2: OSM coastlines ─────────────────────────────────────────────────
console.log("Step 2: query OSM natural=coastline...");
const QUERY = `
[out:json][timeout:60];
way["natural"="coastline"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
out geom;
`;
const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "f35-terrain-mask-gen/1.0",
    "Accept": "application/json",
  },
  body: "data=" + encodeURIComponent(QUERY),
});
const json = await res.json();
console.log(`  ${json.elements.length} coastline ways`);

const polylines = [];
for (const el of json.elements) {
  if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
  polylines.push(el.geometry.map(g => lonLatToPixel(g.lon, g.lat)));
}

// SVG con coastlines como strokes negros sobre fondo blanco
const paths = polylines.map(pts => {
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  return `<path d="${d}" stroke="black" stroke-width="${COASTLINE_STROKE}" fill="none"/>`;
}).join("\n");
const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${RES}" height="${RES}" viewBox="0 0 ${RES} ${RES}"><rect width="${RES}" height="${RES}" fill="white"/>${paths}</svg>`;
const coastBuf = Buffer.from(await sharp(Buffer.from(svg), { limitInputPixels: 1e9 }).grayscale().raw().toBuffer());

// ─── Step 3: flood fill desde seed conocido del Golfo ──────────────────────
// Seed = primer tile del manifest dentro del bbox que también esté en blanco
// en el coastBuf (no es coastline).
console.log("Step 3: flood fill desde seed del Golfo...");
let seedIdx = -1;
for (const key of manifest.water) {
  const [tx, ty] = key.split(",").map(Number);
  const N = 2 ** Z15;
  const lonC = ((tx + 0.5) / N) * 360 - 180;
  const latCRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 0.5) / N)));
  const latC = latCRad * 180 / Math.PI;
  if (latC < BBOX.s || latC > BBOX.n || lonC < BBOX.w || lonC > BBOX.e) continue;
  const [pxC, pyC] = lonLatToPixel(lonC, latC);
  const xC = Math.round(pxC), yC = Math.round(pyC);
  if (xC < 0 || xC >= RES || yC < 0 || yC >= RES) continue;
  const idx = yC * RES + xC;
  if (coastBuf[idx] > 128) { seedIdx = idx; break; }
}
if (seedIdx < 0) { console.error("  No seed found"); process.exit(1); }
console.log(`  Seed pixel (${seedIdx % RES}, ${(seedIdx / RES) | 0})`);

// BFS flood fill
const flooded = Buffer.alloc(RES * RES);
const stack = [seedIdx];
flooded[seedIdx] = 255;
let filled = 0;
while (stack.length > 0) {
  const idx = stack.pop();
  filled++;
  const x = idx % RES, y = (idx - x) / RES;
  // 4-connected; pixel candidato si NO es coastline (>128 white)
  if (x > 0)         { const ni = idx - 1;   if (coastBuf[ni] > 128 && flooded[ni] === 0) { flooded[ni] = 255; stack.push(ni); } }
  if (x < RES - 1)   { const ni = idx + 1;   if (coastBuf[ni] > 128 && flooded[ni] === 0) { flooded[ni] = 255; stack.push(ni); } }
  if (y > 0)         { const ni = idx - RES; if (coastBuf[ni] > 128 && flooded[ni] === 0) { flooded[ni] = 255; stack.push(ni); } }
  if (y < RES - 1)   { const ni = idx + RES; if (coastBuf[ni] > 128 && flooded[ni] === 0) { flooded[ni] = 255; stack.push(ni); } }
}
console.log(`  Flood: ${filled.toLocaleString()} pixeles (${(100 * filled / (RES * RES)).toFixed(1)}%)`);

// ─── Step 4: final = OSM-flood (sin filtro z15) ───────────────────────────
// El filtro z15 dilated estaba creando escalones cuadrados visibles. Mejor
// confiar solo en OSM coastline + flood. Stroke 5px sella gaps menores.
console.log("Step 4: final = OSM-flood directo");
const finalMask = flooded;
let waterPx = 0;
for (let i = 0; i < finalMask.length; i++) if (finalMask[i] === 255) waterPx++;
console.log(`  Water final: ${(100 * waterPx / finalMask.length).toFixed(1)}%`);

// ─── Save ───────────────────────────────────────────────────────────────────
mkdirSync(dirname(OUT_PATH), { recursive: true });
await sharp(finalMask, {
  raw: { width: RES, height: RES, channels: 1 },
  limitInputPixels: 1e9,
}).png({ compressionLevel: 9 }).toFile(OUT_PATH);

console.log("");
console.log(`✓ ${OUT_PATH}`);
console.log(`  ${RES}×${RES} = ${(MASK_KM*1000/RES).toFixed(1)} m/px sobre ${MASK_KM}×${MASK_KM} km`);
console.log(`  Sources: OSM coastline (filo line-precision) + z15 manifest (filtro anti-leak)`);
