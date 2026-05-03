// Recovery de z17 tiles faltantes en la zona costera del playable.
//
// El script principal `download-tiles.mjs` skipea tiles cuyo parent z15 está
// marcado como agua. Pero el manifest z15 tiene falsos positivos en tiles
// costeros (que tienen tierra+agua). Resultado: huecos visibles cerca de costa.
//
// Esta recovery detecta los z15 marcados como agua que tienen AL MENOS UN
// VECINO no-agua (= costeros) y re-descarga sus z17 hijos.
//
// Usage:
//   node scripts/download-tiles-recovery.mjs

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

// Mismo bbox que el ring "playable_z17" del script principal.
const CENTER_LAT = 27.218;
const CENTER_LON = 56.378;
const ZOOM = 17;
const GRID = 640;
const SHIFT_Y = 256;
const CONCURRENCY = 24;

const envText = readFileSync(".env.local", "utf8");
const tokenMatch = envText.match(/NEXT_PUBLIC_MAPBOX_TOKEN\s*=\s*(\S+)/);
if (!tokenMatch) throw new Error("NEXT_PUBLIC_MAPBOX_TOKEN no está en .env.local");
const TOKEN = tokenMatch[1].trim();

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function latToTileY(lat, z) {
  const latRad = (lat * Math.PI) / 180;
  const m = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.floor(((1 - m / Math.PI) / 2) * 2 ** z);
}

// Cargar water manifest z15
const waterManifest = JSON.parse(readFileSync("public/water-manifest-z15.json", "utf8"));
const waterSet = new Set(waterManifest.water);
console.log(`z15 water manifest: ${waterSet.size} tiles agua`);

// Detectar tiles z15 COSTEROS = agua con al menos un vecino no-agua.
// Iteramos los 14k water tiles y chequeamos sus 8 vecinos.
const coastalSet = new Set();
for (const key of waterSet) {
  const [tx, ty] = key.split(",").map(Number);
  let hasLandNeighbor = false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nKey = (tx + dx) + "," + (ty + dy);
      if (!waterSet.has(nKey)) {
        hasLandNeighbor = true;
        break;
      }
    }
    if (hasLandNeighbor) break;
  }
  if (hasLandNeighbor) coastalSet.add(key);
}
console.log(`z15 coastal (water + land neighbor): ${coastalSet.size} tiles`);

// Compute bbox z17 del playable
const cx = lonToTileX(CENTER_LON, ZOOM);
const cy = latToTileY(CENTER_LAT, ZOOM) + SHIFT_Y;
const half = Math.floor(GRID / 2);
const tx0 = cx - half, tx1 = cx + half;
const ty0 = cy - half, ty1 = cy + half;
console.log(`z17 bbox: x[${tx0}, ${tx1}], y[${ty0}, ${ty1}]`);

// Enumerar todos los z17 tiles, skipear los que ya están en disco o cuyo
// parent NO es coastal (= deep water → leave skipped).
const tasks = [];
let alreadyOnDisk = 0, deepWaterSkipped = 0, landSkipped = 0;
for (let y = ty0; y < ty1; y++) {
  for (let x = tx0; x < tx1; x++) {
    const localPath = `public/tiles/satellite/17/${x}/${y}.jpg`;
    if (existsSync(localPath)) { alreadyOnDisk++; continue; }
    // Parent z15 = (x>>2, y>>2)
    const px = x >> 2, py = y >> 2;
    const pKey = px + "," + py;
    if (!waterSet.has(pKey)) {
      // Parent es land (no estaba en water set) — sin embargo no está en disco.
      // Bug raro: el ring principal debería haberlo descargado. Lo intentamos.
      landSkipped++;
      tasks.push({ x, y, localPath });
      continue;
    }
    // Parent es water. Si NO es coastal, es deep water → leave skipped.
    if (!coastalSet.has(pKey)) { deepWaterSkipped++; continue; }
    // Parent es coastal → re-intentar download.
    tasks.push({ x, y, localPath });
  }
}
console.log(`Tasks: ${tasks.length} a descargar`);
console.log(`  ya en disco: ${alreadyOnDisk}`);
console.log(`  deep water skipped: ${deepWaterSkipped}`);
console.log(`  land sin disco (raro): ${landSkipped}`);

// Confirmación
console.log(`\nMapbox calls estimados: ${tasks.length}`);
console.log("Continuando en 3 segundos... Ctrl+C para abortar.");
await new Promise((r) => setTimeout(r, 3000));

async function fetchTile(url, localPath, attempt = 1) {
  if (existsSync(localPath)) return "cached";
  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        return fetchTile(url, localPath, attempt + 1);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(localPath), { recursive: true });
    writeFileSync(localPath, buf);
    return "downloaded";
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return fetchTile(url, localPath, attempt + 1);
    }
    throw new Error(`${url}: ${err.message}`);
  }
}

let downloaded = 0, errors = 0, cached = 0;
const startMs = Date.now();
for (let i = 0; i < tasks.length; i += CONCURRENCY) {
  const batch = tasks.slice(i, i + CONCURRENCY);
  const results = await Promise.allSettled(
    batch.map((t) => {
      const url = `https://api.mapbox.com/v4/mapbox.satellite/${ZOOM}/${t.x}/${t.y}.jpg90?access_token=${TOKEN}`;
      return fetchTile(url, t.localPath);
    })
  );
  for (const r of results) {
    if (r.status === "rejected") errors++;
    else if (r.value === "cached") cached++;
    else downloaded++;
  }
  const done = downloaded + cached + errors;
  const pct = ((done / tasks.length) * 100).toFixed(1);
  process.stdout.write(
    `\r  ${done}/${tasks.length} (${pct}%) — ${downloaded} new, ${cached} cached, ${errors} errors`
  );
}
const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
console.log(`\n✓ done in ${elapsed}s — ${downloaded} downloaded, ${errors} errors`);
