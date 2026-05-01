// Genera un PNG de 96×96 mostrando clasificación water/land/missing de los tiles
// z15 del área inner15. Además incluye los z13 sur que faltan, descargándolos
// on-the-fly si hace falta para tener cobertura completa.

import sharp from "sharp";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { dirname } from "path";

const CENTER_LAT = 27.218;
const CENTER_LON = 56.378;
const Z15_GRID = 96;
const Z15_SHIFT_Y = 32;
const SEA_THRESHOLD = -2;

const envText = readFileSync(".env.local", "utf8");
const TOKEN = envText.match(/NEXT_PUBLIC_MAPBOX_TOKEN\s*=\s*(\S+)/)[1].trim();

function lonToTileX(lon, z) { return Math.floor(((lon + 180) / 360) * 2 ** z); }
function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  const m = Math.log(Math.tan(Math.PI / 4 + r / 2));
  return Math.floor(((1 - m / Math.PI) / 2) * 2 ** z);
}

const cx15 = lonToTileX(CENTER_LON, 15);
const cy15 = latToTileY(CENTER_LAT, 15) + Z15_SHIFT_Y;
const half15 = Z15_GRID / 2;
const x15Min = cx15 - half15, y15Min = cy15 - half15;

const x13Min = Math.floor(x15Min / 4);
const x13Max = Math.floor((x15Min + Z15_GRID - 1) / 4);
const y13Min = Math.floor(y15Min / 4);
const y13Max = Math.floor((y15Min + Z15_GRID - 1) / 4);

console.log(`Z13 cover needed: x=[${x13Min}..${x13Max}] y=[${y13Min}..${y13Max}]`);

// Descargar z13 missing
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
let dl = 0;
const CONC = 16;
for (let i = 0; i < downloads.length; i += CONC) {
  await Promise.all(downloads.slice(i, i + CONC).map(async (t) => {
    const ok = await ensureZ13(t.x, t.y);
    if (ok && !existsSync(`public/tiles/terrain-rgb/13/${t.x}/${t.y}.png.was-cached`)) dl++;
  }));
  process.stdout.write(`\r  ${Math.min(i+CONC, downloads.length)}/${downloads.length}`);
}
console.log("");

const cache = new Map();
async function getZ13Elev(x, y) {
  const key = `${x},${y}`;
  if (cache.has(key)) return cache.get(key);
  const path = `public/tiles/terrain-rgb/13/${x}/${y}.png`;
  if (!existsSync(path)) { cache.set(key, null); return null; }
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const px = 256;
  const ch = data.length / (px * px);
  const elev = new Float32Array(px * px);
  for (let i = 0; i < elev.length; i++) {
    const o = i * ch;
    elev[i] = -10000 + (data[o] * 65536 + data[o+1] * 256 + data[o+2]) * 0.1;
  }
  cache.set(key, elev);
  return elev;
}

// Imagen 96×96 RGBA — un pixel por tile z15
const SCALE = 8; // upscale para verlo mejor
const W = Z15_GRID * SCALE;
const out = Buffer.alloc(W * W * 4);
function setPx(col, row, r, g, b) {
  for (let dy = 0; dy < SCALE; dy++)
    for (let dx = 0; dx < SCALE; dx++) {
      const i = ((row * SCALE + dy) * W + (col * SCALE + dx)) * 4;
      out[i] = r; out[i+1] = g; out[i+2] = b; out[i+3] = 255;
    }
}

let water = 0, land = 0, coast = 0, missing = 0;
for (let row = 0; row < Z15_GRID; row++) {
  for (let col = 0; col < Z15_GRID; col++) {
    const x15 = x15Min + col;
    const y15 = y15Min + row;
    const x13 = Math.floor(x15 / 4);
    const y13 = Math.floor(y15 / 4);
    const elev = await getZ13Elev(x13, y13);
    if (!elev) { setPx(col, row, 200, 200, 200); missing++; continue; }
    const subX = x15 - x13 * 4, subY = y15 - y13 * 4;
    const px0 = subX * 64, py0 = subY * 64;
    // Water = todos los samples a elev 0 (Mapbox no tiene batimetría, océano=0).
    // Tierra = cualquier sample > 0. Sampleamos denso (8×8 = 64) para detectar
    // costa fina.
    let aboveSamples = 0, total = 0;
    for (let sy = 0; sy < 8; sy++)
      for (let sx = 0; sx < 8; sx++) {
        const px = px0 + Math.floor((sx + 0.5) * 64 / 8);
        const py = py0 + Math.floor((sy + 0.5) * 64 / 8);
        if (elev[py * 256 + px] > 0) aboveSamples++;
        total++;
      }
    if (aboveSamples === 0) { setPx(col, row, 30, 80, 160); water++; }
    else if (aboveSamples === total) { setPx(col, row, 180, 140, 80); land++; }
    else { setPx(col, row, 200, 180, 100); coast++; }
  }
}

await sharp(out, { raw: { width: W, height: W, channels: 4 } })
  .png()
  .toFile("scripts/water-map.png");

const total = Z15_GRID * Z15_GRID;
console.log(`\nTotal z15 tiles: ${total}`);
console.log(`  Water (azul):     ${water} (${(water/total*100).toFixed(1)}%)`);
console.log(`  Coast (mixto):    ${coast} (${(coast/total*100).toFixed(1)}%)`);
console.log(`  Land (tierra):    ${land} (${(land/total*100).toFixed(1)}%)`);
console.log(`  Missing z13:      ${missing}`);
console.log(`\nGuardado: scripts/water-map.png (768×768, escalado 8x)`);
