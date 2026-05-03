// Pre-procesa los grandes JSONs de OSM (buildings, roads, vegetation, etc.)
// y los divide en chunks indexados por z12 tile.
//
// Output:
//   /public/osm/buildings/12/{tx}/{ty}.json
//   /public/osm/roads/12/{tx}/{ty}.json
//   /public/osm/vegetation/12/{tx}/{ty}.json
//
// Cada archivo contiene { elements: [...] } con todos los features cuyo
// CENTROIDE cae en ese tile z12 (~10km cuadrado a lat 27).
//
// Cada feature mantiene sus coordenadas EXACTAS lat/lon — z12 es solo el
// "casillero" de archivo donde se guarda.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { dirname } from "path";

const ZOOM = 12;

function lonToTileX(lon) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, ZOOM));
}
function latToTileY(lat) {
  const latRad = (lat * Math.PI) / 180;
  const m = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.floor(((1 - m / Math.PI) / 2) * Math.pow(2, ZOOM));
}

// Centroid de un feature OSM (way con geometry array).
function featureCentroid(el) {
  if (el.bounds) {
    return {
      lat: (el.bounds.minlat + el.bounds.maxlat) / 2,
      lon: (el.bounds.minlon + el.bounds.maxlon) / 2,
    };
  }
  if (el.geometry && el.geometry.length > 0) {
    let lat = 0, lon = 0;
    for (const g of el.geometry) { lat += g.lat; lon += g.lon; }
    return { lat: lat / el.geometry.length, lon: lon / el.geometry.length };
  }
  return null;
}

// Carga uno o más JSONs y devuelve un array unificado de elements.
function loadElements(paths) {
  const out = [];
  for (const p of paths) {
    if (!existsSync(p)) {
      console.log(`  ⚠ ${p} no existe — skip`);
      continue;
    }
    const j = JSON.parse(readFileSync(p, "utf8"));
    out.push(...(j.elements || []));
    console.log(`  + ${j.elements?.length ?? 0} elements de ${p}`);
  }
  return out;
}

function splitDataset(name, sourcePaths, outputDir, filter) {
  console.log(`\n=== Splitting ${name} ===`);
  const elements = loadElements(sourcePaths);
  console.log(`  total raw: ${elements.length}`);

  // Limpiar output dir
  if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });

  // Bucket por (tx, ty)
  const buckets = new Map(); // "tx_ty" → array
  let kept = 0, skipped = 0;
  for (const el of elements) {
    if (filter && !filter(el)) { skipped++; continue; }
    const c = featureCentroid(el);
    if (!c) { skipped++; continue; }
    const tx = lonToTileX(c.lon);
    const ty = latToTileY(c.lat);
    const key = tx + "_" + ty;
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    arr.push(el);
    kept++;
  }

  // Escribir un archivo por bucket
  let bytes = 0;
  for (const [key, arr] of buckets) {
    const [tx, ty] = key.split("_");
    const path = `${outputDir}/${tx}/${ty}.json`;
    mkdirSync(dirname(path), { recursive: true });
    const json = JSON.stringify({ elements: arr });
    writeFileSync(path, json);
    bytes += json.length;
  }

  // Manifest: lista de (tx, ty) válidos para que el cliente sepa qué pedir.
  const manifest = {
    zoom: ZOOM,
    count: kept,
    tiles: [...buckets.keys()].map(k => {
      const [tx, ty] = k.split("_").map(Number);
      return { tx, ty, count: buckets.get(k).length };
    }),
  };
  writeFileSync(`${outputDir}/manifest.json`, JSON.stringify(manifest));

  console.log(`  → ${kept} kept, ${skipped} skipped`);
  console.log(`  → ${buckets.size} chunks (avg ${Math.round(kept / buckets.size)} per chunk)`);
  console.log(`  → ${(bytes / 1024 / 1024).toFixed(1)} MB total`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
splitDataset(
  "buildings",
  ["public/osm/building.json", "public/osm/ms-buildings.json"],
  "public/osm/buildings/12",
  (el) => el.type === "way" && el.tags?.building && el.geometry?.length >= 3,
);

splitDataset(
  "roads",
  ["public/osm/highway.json"],
  "public/osm/roads/12",
  (el) => el.type === "way" && el.tags?.highway && el.geometry?.length >= 2,
);

splitDataset(
  "vegetation",
  ["public/osm/landuse.json", "public/osm/natural-vegetation.json"],
  "public/osm/vegetation/12",
  (el) => el.type === "way" && el.geometry?.length >= 4 && (el.tags?.landuse || el.tags?.natural || el.tags?.leisure),
);

console.log("\n✓ done");
