// Descarga features OSM (aeroway, building) del aeropuerto Bandar Abbas
// (TFB.9 / OIKB) y guarda a public/osm/oikb.json para el runtime.
//
// Re-ejecutable. Sin auth — Overpass API es gratuita.

import { writeFileSync, mkdirSync, existsSync } from "fs";

// Bounding box: ~10 km × ~14 km centrado en TFB.9 (27.218°, 56.378°).
// Cubre todo el aeropuerto + alrededores (taxiways, hangares).
const BBOX = "27.16,56.32,27.27,56.46"; // S, W, N, E

const QUERY = `
[out:json][timeout:60];
(
  way["aeroway"](${BBOX});
  way["building"](${BBOX});
  way["building:part"](${BBOX});
  relation["aeroway"](${BBOX});
);
out geom;
`;

console.log(`Querying Overpass API for OIKB area (${BBOX})...`);

// Overpass acepta GET con ?data= o POST con body=data=... Ambos requieren
// el header User-Agent. Algunos mirrors no aceptan POST — usamos GET.
const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(QUERY);
const res = await fetch(url, {
  headers: { "User-Agent": "f35-flight-sim/1.0" },
});

if (!res.ok) {
  console.error(`Overpass error ${res.status}: ${await res.text().then(t => t.slice(0, 500))}`);
  process.exit(1);
}

const json = await res.json();
mkdirSync("public/osm", { recursive: true });
const outPath = "public/osm/oikb.json";
writeFileSync(outPath, JSON.stringify(json));

const counts = {};
for (const el of json.elements) {
  const t = el.tags || {};
  const key = t.aeroway || (t.building ? "building" : t["building:part"] ? "building:part" : "other");
  counts[key] = (counts[key] || 0) + 1;
}
console.log(`Saved ${json.elements.length} elements to ${outPath}:`);
for (const [k, v] of Object.entries(counts).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${k}: ${v}`);
}
