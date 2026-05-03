// Pre-descarga de tiles de Mapbox a /public/tiles/<dataset>/<z>/<x>/<y>.<ext>
// Una vez descargado, la app sirve desde local — sin hits a la API de Mapbox.
//
// Uso:
//   node scripts/download-tiles.mjs
//
// Re-ejecutable: skip de tiles ya descargados.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

// ─── Config ──────────────────────────────────────────────────────────────────
const CENTER_LAT = 27.218;   // Bandar Abbas TFB.9
const CENTER_LON = 56.378;
const CONCURRENCY = 24;       // peticiones paralelas

const RINGS = [
  { name: "outer",  zoom: 10, gridSize: 32, dataset: "mapbox.satellite",   ext: "jpg90",  localExt: "jpg" },
  { name: "mid",    zoom: 13, gridSize: 32, dataset: "mapbox.satellite",   ext: "jpg90",  localExt: "jpg" },
  { name: "inner",  zoom: 16, gridSize: 32, dataset: "mapbox.satellite",   ext: "jpg90",  localExt: "jpg" },
  // Inner: zoom 14 nativo cubriendo 80×80 tiles (~175 km × 175 km), shifted 32
  // tiles al sur (~70 km). En runtime: 5×5 sub-meshes de 16×16. Sin water-skip
  // — todo se descarga, Mapbox sirve agua/tierra fotográfica.
  { name: "inner14", zoom: 14, gridSize: 80, tileShiftX: 0, tileShiftY: 32, dataset: "mapbox.satellite", ext: "jpg90", localExt: "jpg" },
  // Airport overlay: z17 patch ~8.7 km centrado en TFB.9 — alta resolución para volar bajo
  { name: "airport", zoom: 17, gridSize: 48, dataset: "mapbox.satellite", ext: "jpg90", localExt: "jpg" },
  // PLAYABLE z17: 640×640 tiles (~174 km cuadrado), shifted ~70km al sur para
  // matchear el playable map (centrado en inner14 center). Skip-water usando
  // manifest z15 (parent tile) → ~150k tiles reales, ~4.5 GB en disco.
  // Re-ejecutable: existSync skipea, así se puede partir entre quotas mensuales.
  {
    name: "playable_z17",
    zoom: 17,
    gridSize: 640,
    tileShiftY: 256,    // ~70 km al sur (256 tiles × 272m = 69.6 km)
    dataset: "mapbox.satellite",
    ext: "jpg90",
    localExt: "jpg",
    skipWater: true,
    skipWaterFromZoom: 15,  // usa parent tile z15 para consultar manifest
  },
  { name: "h_out",  zoom: 10, gridSize: 32, dataset: "mapbox.terrain-rgb", ext: "pngraw", localExt: "png" },
  { name: "h_fine", zoom: 13, gridSize: 48, tileShiftY: 16, dataset: "mapbox.terrain-rgb", ext: "pngraw", localExt: "png" },
];

// ─── Token ───────────────────────────────────────────────────────────────────
const envText = readFileSync(".env.local", "utf8");
const tokenMatch = envText.match(/NEXT_PUBLIC_MAPBOX_TOKEN\s*=\s*(\S+)/);
if (!tokenMatch) throw new Error("NEXT_PUBLIC_MAPBOX_TOKEN no está en .env.local");
const TOKEN = tokenMatch[1].trim();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}
function latToTileY(lat, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const m = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.floor(((1 - m / Math.PI) / 2) * 2 ** zoom);
}

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

async function downloadRing(ring) {
  const cx = lonToTileX(CENTER_LON, ring.zoom) + (ring.tileShiftX || 0);
  const cy = latToTileY(CENTER_LAT, ring.zoom) + (ring.tileShiftY || 0);
  const half = Math.floor(ring.gridSize / 2);

  // Si el ring tiene skipWater, cargar el manifest y skipear los tiles agua.
  // Si skipWaterFromZoom está set, usa el manifest de ese zoom (típicamente
  // más bajo) y consulta por parent tile — útil cuando el manifest del zoom
  // del ring no existe.
  let waterSet = null;
  let waterShift = 0; // ring.zoom - manifestZoom → bit shift para parent
  if (ring.skipWater) {
    const wmZoom = ring.skipWaterFromZoom ?? ring.zoom;
    waterShift = ring.zoom - wmZoom;
    const manifestPath = `public/water-manifest-z${wmZoom}.json`;
    if (existsSync(manifestPath)) {
      const m = JSON.parse(readFileSync(manifestPath, "utf8"));
      waterSet = new Set(m.water);
      console.log(`  → skip-water z${wmZoom}: ${waterSet.size} tiles agua del manifest (shift=${waterShift})`);
    } else {
      console.warn(`  ! ${manifestPath} no existe — corré scripts/generate-water-manifest.mjs primero`);
    }
  }

  const tasks = [];
  let skipped = 0;
  for (let row = 0; row < ring.gridSize; row++) {
    for (let col = 0; col < ring.gridSize; col++) {
      const x = cx - half + col;
      const y = cy - half + row;
      if (waterSet) {
        const px = x >> waterShift;
        const py = y >> waterShift;
        if (waterSet.has(`${px},${py}`)) { skipped++; continue; }
      }
      const url = `https://api.mapbox.com/v4/${ring.dataset}/${ring.zoom}/${x}/${y}.${ring.ext}?access_token=${TOKEN}`;
      const datasetPath = ring.dataset.replace("mapbox.", "");
      const localPath = `public/tiles/${datasetPath}/${ring.zoom}/${x}/${y}.${ring.localExt}`;
      tasks.push({ url, localPath });
    }
  }
  if (skipped) console.log(`  → ${skipped} tiles agua skipeados (no se descargan)`);

  let downloaded = 0, cached = 0, errors = 0, totalBytes = 0;
  const startMs = Date.now();

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((t) => fetchTile(t.url, t.localPath))
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "rejected") {
        errors++;
        if (errors < 5) console.error(`\n  ✗ ${r.reason.message}`);
      } else if (r.value === "cached") cached++;
      else {
        downloaded++;
        try {
          totalBytes += (await import("fs")).statSync(batch[j].localPath).size;
        } catch {}
      }
    }
    const done = downloaded + cached + errors;
    const pct = ((done / tasks.length) * 100).toFixed(1);
    const mb = (totalBytes / (1024 * 1024)).toFixed(1);
    process.stdout.write(
      `\r  [${ring.name} z${ring.zoom}] ${done}/${tasks.length} (${pct}%) — ${cached} cached, ${downloaded} new (${mb} MB), ${errors} errors`
    );
  }
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  process.stdout.write(`\n  → done in ${elapsed}s\n`);
  return { downloaded, cached, errors };
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log(`Pre-descargando ${RINGS.length} rings centrados en (${CENTER_LAT}°, ${CENTER_LON}°) — Bandar Abbas`);
console.log(`Total: ${RINGS.reduce((s, r) => s + r.gridSize ** 2, 0)} tiles`);
console.log("");

const stats = { downloaded: 0, cached: 0, errors: 0 };
for (const ring of RINGS) {
  const r = await downloadRing(ring);
  stats.downloaded += r.downloaded;
  stats.cached += r.cached;
  stats.errors += r.errors;
}

console.log("");
console.log(`Total: ${stats.downloaded} downloaded · ${stats.cached} cached · ${stats.errors} errors`);
if (stats.errors > 0) {
  console.error("Errores presentes — re-correr el script para reintentar.");
  process.exit(1);
}
