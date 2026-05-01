// Conteo de tiles z15 que son agua (elev < -2m) usando heightmap z13 ya cacheado.
// Z13→Z15: cada tile z13 contiene 4×4 tiles z15. Cada tile z15 = 64×64 px de su z13 padre.
//
// inner15 area: 96×96 tiles z15 alrededor de (lat,lon) shifted +32 z15 al sur.
// En z13: 24×24 tiles z13, shifted +8 al sur.

import sharp from "sharp";
import { existsSync } from "fs";

const CENTER_LAT = 27.218;
const CENTER_LON = 56.378;
const Z15_GRID = 96;             // 96×96 z15 tiles
const Z15_SHIFT_Y = 32;          // shifted south
const SEA_THRESHOLD = -2;        // metros

function lonToTileX(lon, z) { return Math.floor(((lon + 180) / 360) * 2 ** z); }
function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  const m = Math.log(Math.tan(Math.PI / 4 + r / 2));
  return Math.floor(((1 - m / Math.PI) / 2) * 2 ** z);
}

const cx15 = lonToTileX(CENTER_LON, 15);
const cy15 = latToTileY(CENTER_LAT, 15) + Z15_SHIFT_Y;
const half15 = Z15_GRID / 2;

// Rango z15 a evaluar
const x15Min = cx15 - half15;
const x15Max = cx15 + half15 - 1;
const y15Min = cy15 - half15;
const y15Max = cy15 + half15 - 1;

// Convertir a rango z13 cubriente (cada z15 → z13 div 4)
const x13Min = Math.floor(x15Min / 4);
const x13Max = Math.floor(x15Max / 4);
const y13Min = Math.floor(y15Min / 4);
const y13Max = Math.floor(y15Max / 4);

console.log(`Z15 area: x=[${x15Min}..${x15Max}] y=[${y15Min}..${y15Max}] (${Z15_GRID}×${Z15_GRID} = ${Z15_GRID*Z15_GRID} tiles)`);
console.log(`Z13 cover: x=[${x13Min}..${x13Max}] y=[${y13Min}..${y13Max}]`);

// Cache decoded elevation por z13 tile (Float32Array 256×256)
const cache = new Map();
async function getZ13Elev(x, y) {
  const key = `${x},${y}`;
  if (cache.has(key)) return cache.get(key);
  const path = `public/tiles/terrain-rgb/13/${x}/${y}.png`;
  if (!existsSync(path)) {
    cache.set(key, null);
    return null;
  }
  const { data } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  // PNG raw = RGB(A). Decodificar terrain-rgb.
  const px = 256;
  const elev = new Float32Array(px * px);
  // sharp raw devuelve channels según el png. terrain-rgb es RGB sin alpha → 3 channels.
  const ch = data.length / (px * px);
  for (let i = 0; i < elev.length; i++) {
    const o = i * ch;
    elev[i] = -10000 + (data[o] * 65536 + data[o + 1] * 256 + data[o + 2]) * 0.1;
  }
  cache.set(key, elev);
  return elev;
}

let water = 0, land = 0, missing = 0;
let waterDeep = 0; // tiles con TODOS los samples en agua (más conservador)

for (let y15 = y15Min; y15 <= y15Max; y15++) {
  for (let x15 = x15Min; x15 <= x15Max; x15++) {
    const x13 = Math.floor(x15 / 4);
    const y13 = Math.floor(y15 / 4);
    const elev = await getZ13Elev(x13, y13);
    if (!elev) { missing++; continue; }
    // El tile z15 ocupa píxeles (subX*64..subX*64+63, subY*64..subY*64+63) dentro del z13.
    const subX = x15 - x13 * 4;
    const subY = y15 - y13 * 4;
    const px0 = subX * 64;
    const py0 = subY * 64;
    // Sample 9 puntos (3×3 grid) dentro del tile z15 para clasificación robusta
    let aboveCount = 0;
    let totalSamples = 0;
    for (let sy = 0; sy < 3; sy++) {
      for (let sx = 0; sx < 3; sx++) {
        const px = px0 + Math.floor((sx + 0.5) * 64 / 3);
        const py = py0 + Math.floor((sy + 0.5) * 64 / 3);
        const e = elev[py * 256 + px];
        if (e > SEA_THRESHOLD) aboveCount++;
        totalSamples++;
      }
    }
    if (aboveCount === 0) { water++; waterDeep++; }
    else if (aboveCount < totalSamples) { land++; } // mixto cuenta como tierra (costa)
    else { land++; }
  }
}

const total = Z15_GRID * Z15_GRID;
console.log("");
console.log(`Total z15 tiles: ${total}`);
console.log(`  Water (todos los 9 samples bajo ${SEA_THRESHOLD}m): ${water} (${((water/total)*100).toFixed(1)}%)`);
console.log(`  Land/coast: ${land} (${((land/total)*100).toFixed(1)}%)`);
console.log(`  Missing z13 tile: ${missing}`);
console.log("");
console.log(`Disk actual (157 MB para ${total} tiles): ~${(157/total).toFixed(3)} MB/tile`);
console.log(`Ahorro skip water: ~${(water * 157/total).toFixed(0)} MB`);
console.log("");
console.log(`Si extendemos a 4×4 z15 (16384 tiles, ~256 MB) y skipeamos misma proporción:`);
const ratioWater = water/total;
console.log(`  Water esperado: ~${Math.round(16384*ratioWater)} tiles, descarga real ~${Math.round(16384*(1-ratioWater)*157/total)} MB`);
