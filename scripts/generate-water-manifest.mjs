// Genera public/water-manifest-z15.json — lista de tiles z15 que son agua
// pura (sin tierra) para skipear en descarga / runtime.
//
// Usa heightmap z13 de Mapbox terrain-rgb (1 z13 tile = 4×4 z15 tiles, 64×64 px
// por z15). Mapbox NO tiene batimetría: océano = elev 0 exactamente. Así que
// agua = todos los samples = 0; tierra = cualquier sample > 0.
//
// Auto-descarga z13 missing on-the-fly. Re-ejecutable.

import sharp from "sharp";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { dirname } from "path";

const CENTER_LAT = 27.218;
const CENTER_LON = 56.378;
const Z15_GRID = 160;            // 5×5 sub-meshes × 32 = 160
const Z15_SHIFT_Y = 64;          // south shift
const SAMPLES_PER_TILE = 8;      // 8×8 = 64 samples por tile z15

const envText = readFileSync(".env.local", "utf8");
const TOKEN = envText.match(/NEXT_PUBLIC_MAPBOX_TOKEN\s*=\s*(\S+)/)[1].trim();

const lonToTileX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToTileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  const m = Math.log(Math.tan(Math.PI / 4 + r / 2));
  return Math.floor(((1 - m / Math.PI) / 2) * 2 ** z);
};

const cx15 = lonToTileX(CENTER_LON, 15);
const cy15 = latToTileY(CENTER_LAT, 15) + Z15_SHIFT_Y;
const half = Z15_GRID / 2;
const x15Min = cx15 - half, x15Max = cx15 + half - 1;
const y15Min = cy15 - half, y15Max = cy15 + half - 1;

const x13Min = Math.floor(x15Min / 4);
const x13Max = Math.floor(x15Max / 4);
const y13Min = Math.floor(y15Min / 4);
const y13Max = Math.floor(y15Max / 4);

console.log(`Z15 area: x=[${x15Min}..${x15Max}] y=[${y15Min}..${y15Max}] (${Z15_GRID}×${Z15_GRID} = ${Z15_GRID*Z15_GRID} tiles)`);
console.log(`Z13 cover: x=[${x13Min}..${x13Max}] y=[${y13Min}..${y13Max}] (${(x13Max-x13Min+1)*(y13Max-y13Min+1)} tiles)`);

async function ensureZ13(x, y) {
  const path = `public/tiles/terrain-rgb/13/${x}/${y}.png`;
  if (existsSync(path)) return true;
  const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/13/${x}/${y}.pngraw?access_token=${TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return true;
}

const downloads = [];
for (let y = y13Min; y <= y13Max; y++)
  for (let x = x13Min; x <= x13Max; x++)
    downloads.push({ x, y });
console.log(`Asegurando ${downloads.length} z13 tiles…`);
for (let i = 0; i < downloads.length; i += 16) {
  await Promise.all(downloads.slice(i, i + 16).map((t) => ensureZ13(t.x, t.y)));
  process.stdout.write(`\r  ${Math.min(i+16, downloads.length)}/${downloads.length}`);
}
console.log("");

const cache = new Map();
async function getZ13Elev(x, y) {
  const key = `${x},${y}`;
  if (cache.has(key)) return cache.get(key);
  const path = `public/tiles/terrain-rgb/13/${x}/${y}.png`;
  if (!existsSync(path)) { cache.set(key, null); return null; }
  const { data } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const ch = data.length / (256 * 256);
  const elev = new Float32Array(256 * 256);
  for (let i = 0; i < elev.length; i++) {
    const o = i * ch;
    elev[i] = -10000 + (data[o] * 65536 + data[o+1] * 256 + data[o+2]) * 0.1;
  }
  cache.set(key, elev);
  return elev;
}

// Debug PNG (1 px por tile, escalado)
const SCALE = 4;
const W = Z15_GRID * SCALE;
const debugBuf = Buffer.alloc(W * W * 4);
const setPx = (col, row, r, g, b) => {
  for (let dy = 0; dy < SCALE; dy++)
    for (let dx = 0; dx < SCALE; dx++) {
      const i = ((row * SCALE + dy) * W + (col * SCALE + dx)) * 4;
      debugBuf[i]=r; debugBuf[i+1]=g; debugBuf[i+2]=b; debugBuf[i+3]=255;
    }
};

// Phase 1: clasificación cruda — water / coast / land
const rawWater = new Set();
const nonWater = new Set(); // land + coast (todo lo que tiene algún pixel de tierra)
let waterRaw = 0, coastRaw = 0, landRaw = 0, missing = 0;

for (let row = 0; row < Z15_GRID; row++) {
  for (let col = 0; col < Z15_GRID; col++) {
    const x15 = x15Min + col, y15 = y15Min + row;
    const x13 = Math.floor(x15 / 4), y13 = Math.floor(y15 / 4);
    const elev = await getZ13Elev(x13, y13);
    if (!elev) { setPx(col, row, 200,200,200); missing++; continue; }
    const px0 = (x15 - x13 * 4) * 64, py0 = (y15 - y13 * 4) * 64;
    let above = 0;
    for (let sy = 0; sy < SAMPLES_PER_TILE; sy++)
      for (let sx = 0; sx < SAMPLES_PER_TILE; sx++) {
        const px = px0 + Math.floor((sx + 0.5) * 64 / SAMPLES_PER_TILE);
        const py = py0 + Math.floor((sy + 0.5) * 64 / SAMPLES_PER_TILE);
        if (elev[py * 256 + px] > 0) above++;
      }
    const key = `${x15},${y15}`;
    if (above === 0) {
      rawWater.add(key);
      waterRaw++;
    } else if (above === SAMPLES_PER_TILE * SAMPLES_PER_TILE) {
      nonWater.add(key);
      landRaw++;
    } else {
      nonWater.add(key);
      coastRaw++;
    }
  }
}

// Phase 2: buffer costero. Cualquier water tile adyacente (8-conn) a un tile
// land/coast se saca del set water → se descargará con imagen real de Mapbox.
// Esto crea un anillo de ~272m (1 tile z15) de agua real alrededor de toda
// costa, evitando bordes duros entre fill solid y satelital.
const BUFFER_RADIUS = 1;
const bufferedKeep = new Set();
for (const key of nonWater) {
  const [xs, ys] = key.split(",").map(Number);
  for (let dy = -BUFFER_RADIUS; dy <= BUFFER_RADIUS; dy++)
    for (let dx = -BUFFER_RADIUS; dx <= BUFFER_RADIUS; dx++)
      bufferedKeep.add(`${xs+dx},${ys+dy}`);
}

const waterTiles = [];
for (const key of rawWater) {
  if (!bufferedKeep.has(key)) waterTiles.push(key);
}
const bufferKept = rawWater.size - waterTiles.length;

// Pintar debug PNG con la clasificación final
for (let row = 0; row < Z15_GRID; row++) {
  for (let col = 0; col < Z15_GRID; col++) {
    const x15 = x15Min + col, y15 = y15Min + row;
    const key = `${x15},${y15}`;
    if (rawWater.has(key)) {
      if (waterTiles.includes(key)) setPx(col, row, 30,80,160);   // skip (azul)
      else                          setPx(col, row, 80,130,200);  // buffer (azul claro)
    } else if (nonWater.has(key)) {
      const x13 = Math.floor(x15 / 4), y13 = Math.floor(y15 / 4);
      const elev = cache.get(`${x13},${y13}`);
      if (!elev) continue;
      const px0 = (x15 - x13 * 4) * 64, py0 = (y15 - y13 * 4) * 64;
      let above = 0;
      for (let sy = 0; sy < SAMPLES_PER_TILE; sy++)
        for (let sx = 0; sx < SAMPLES_PER_TILE; sx++) {
          const px = px0 + Math.floor((sx + 0.5) * 64 / SAMPLES_PER_TILE);
          const py = py0 + Math.floor((sy + 0.5) * 64 / SAMPLES_PER_TILE);
          if (elev[py * 256 + px] > 0) above++;
        }
      if (above === SAMPLES_PER_TILE * SAMPLES_PER_TILE) setPx(col, row, 180,140,80);
      else setPx(col, row, 200,180,100);
    }
  }
}

const water = waterTiles.length;
const coast = coastRaw;
const land = landRaw;

const total = Z15_GRID * Z15_GRID;
console.log(`\nTotal z15 tiles: ${total}`);
console.log(`  Water (skip):       ${water} (${(water/total*100).toFixed(1)}%)`);
console.log(`  Buffer (downloaded): ${bufferKept} tiles agua adyacentes a costa`);
console.log(`  Coast (mixto):      ${coast} (${(coast/total*100).toFixed(1)}%)`);
console.log(`  Land:               ${land} (${(land/total*100).toFixed(1)}%)`);
console.log(`  Missing:            ${missing}`);

// Phase 3: sample water color desde tiles costeros descargados. Sampleamos
// solo los pixels que el z13 marca como agua (elev=0) — el resto es tierra y
// la contaminaría. Esto da el tono "Golfo Pérsico abierto" real de Mapbox.
//
// NOTA: el sampling tiende a verdoso por sedimentos del Estrecho de Hormuz.
// El usuario prefirió fijar manualmente #151d2c (azul oscuro standard) — si
// querés re-samplear, comenta la línea de OVERRIDE_COLOR abajo.
const OVERRIDE_COLOR = "#0c1321";
let waterColor = "#3a5878"; // fallback default
let r = 0, g = 0, b = 0, n = 0, sampledTiles = 0;
for (const key of nonWater) {
  const [xs, ys] = key.split(",").map(Number);
  const path = `public/tiles/satellite/15/${xs}/${ys}.jpg`;
  if (!existsSync(path)) continue;
  try {
    const x13 = Math.floor(xs / 4), y13 = Math.floor(ys / 4);
    const elev = await getZ13Elev(x13, y13);
    if (!elev) continue;
    const px0 = (xs - x13 * 4) * 64, py0 = (ys - y13 * 4) * 64;
    // Resize tile a 64×64 para alinear 1:1 con la grilla del z13.
    const buf = await sharp(path).resize(64, 64).raw().toBuffer({ resolveWithObject: true });
    const data = buf.data;
    const ch = data.length / (64 * 64);
    let tileN = 0;
    for (let py = 0; py < 64; py++) {
      for (let px = 0; px < 64; px++) {
        const elevAtPx = elev[(py0 + py) * 256 + (px0 + px)];
        if (elevAtPx > 0) continue; // skip pixels que el heightmap dice tierra
        const o = (py * 64 + px) * ch;
        r += data[o]; g += data[o+1]; b += data[o+2];
        n++; tileN++;
      }
    }
    if (tileN > 0) sampledTiles++;
    if (sampledTiles >= 200) break;
  } catch {}
}
if (n > 0) {
  const ar = Math.round(r / n), ag = Math.round(g / n), ab = Math.round(b / n);
  const sampled = `#${ar.toString(16).padStart(2,"0")}${ag.toString(16).padStart(2,"0")}${ab.toString(16).padStart(2,"0")}`;
  waterColor = OVERRIDE_COLOR ?? sampled;
  console.log(`  Water color:        ${waterColor}` +
    (OVERRIDE_COLOR ? ` (override; sampling sería ${sampled})` : ` (sampled de ${sampledTiles} tiles, ${n} pixels)`));
} else {
  waterColor = OVERRIDE_COLOR ?? waterColor;
  console.log(`  Water color:        ${waterColor} (${OVERRIDE_COLOR ? "override" : "fallback"})`);
}

const manifest = {
  zoom: 15,
  centerLat: CENTER_LAT,
  centerLon: CENTER_LON,
  z15Grid: Z15_GRID,
  z15ShiftY: Z15_SHIFT_Y,
  bufferRadius: BUFFER_RADIUS,
  waterColor,
  generatedAt: new Date().toISOString(),
  water: waterTiles,
};
mkdirSync("public", { recursive: true });
writeFileSync("public/water-manifest-z15.json", JSON.stringify(manifest));
console.log(`\nManifest: public/water-manifest-z15.json (${(JSON.stringify(manifest).length/1024).toFixed(1)} KB, ${waterTiles.length} tiles)`);

await sharp(debugBuf, { raw: { width: W, height: W, channels: 4 } })
  .png().toFile("scripts/water-map-5x5.png");
console.log(`Debug: scripts/water-map-5x5.png (${W}×${W})`);
