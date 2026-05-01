// Descarga features OSM del bbox de 400km × 400km centrado en Bandar Abbas
// para ser reutilizable por múltiples scripts/features:
//   - water mask (landuse → land override)
//   - night lighting (residential = lit areas)
//   - highways rendering
//   - building footprints
//   - airports, railways, etc.
//
// Por tamaño, separamos en archivos por tipo. Cada uno cacheado en
// public/osm/<feature>.json.
//
// Re-ejecutable: skip features que ya tengan archivo descargado. Para
// re-bajar uno específico, borralo manualmente.
//
// Para la query usamos POST con body porque algunos features tienen muchos
// elementos y la URL GET excede el max length.

import { writeFileSync, mkdirSync, existsSync } from "fs";

const CENTER_LAT = 27.218;
const CENTER_LON = 56.378;
const BBOX_KM = 400;

// 1° latitud ≈ 110.574 km
const HALF_LAT_DEG = (BBOX_KM / 2) / 110.574;
// 1° longitud ≈ 111.32 * cos(lat)
const HALF_LON_DEG = (BBOX_KM / 2) / (111.32 * Math.cos(CENTER_LAT * Math.PI / 180));
const BBOX = `${(CENTER_LAT - HALF_LAT_DEG).toFixed(4)},${(CENTER_LON - HALF_LON_DEG).toFixed(4)},${(CENTER_LAT + HALF_LAT_DEG).toFixed(4)},${(CENTER_LON + HALF_LON_DEG).toFixed(4)}`;

mkdirSync("public/osm", { recursive: true });

// Lista de queries. Cada una baja a su propio archivo.
const QUERIES = [
  {
    name: "landuse",
    out: "public/osm/landuse.json",
    body: `
[out:json][timeout:180];
(
  way["landuse"~"residential|industrial|commercial|retail|construction|military|cemetery|farmland|farmyard|orchard|education"](${BBOX});
  relation["landuse"~"residential|industrial|commercial|retail|construction|military|farmland|farmyard"](${BBOX});
);
out geom;`,
  },
  {
    name: "highway",
    out: "public/osm/highway.json",
    body: `
[out:json][timeout:180];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential"](${BBOX});
);
out geom;`,
  },
  {
    name: "building",
    out: "public/osm/building.json",
    body: `
[out:json][timeout:180];
(
  way["building"](${BBOX});
);
out geom;`,
  },
  {
    name: "waterway",
    out: "public/osm/waterway.json",
    body: `
[out:json][timeout:180];
(
  way["waterway"](${BBOX});
);
out geom;`,
  },
  {
    name: "natural-water",
    out: "public/osm/natural-water.json",
    body: `
[out:json][timeout:180];
(
  way["natural"~"water|wetland|bay"](${BBOX});
  relation["natural"~"water|wetland|bay"](${BBOX});
);
out geom;`,
  },
  {
    name: "aeroway",
    out: "public/osm/aeroway.json",
    body: `
[out:json][timeout:120];
(
  way["aeroway"](${BBOX});
  relation["aeroway"](${BBOX});
);
out geom;`,
  },
  {
    name: "railway",
    out: "public/osm/railway.json",
    body: `
[out:json][timeout:120];
(
  way["railway"~"rail|subway|tram|light_rail"](${BBOX});
);
out geom;`,
  },
  {
    name: "man_made",
    out: "public/osm/man_made.json",
    body: `
[out:json][timeout:180];
(
  way["man_made"~"pier|quay|breakwater|groyne|bridge|reservoir_covered|wastewater_plant|works|pipeline|silo|storage_tank"](${BBOX});
  relation["man_made"~"pier|quay|breakwater"](${BBOX});
);
out geom;`,
  },
];

console.log(`BBOX (400×400 km centrado en Bandar Abbas): ${BBOX}\n`);

for (const q of QUERIES) {
  if (existsSync(q.out)) {
    console.log(`✓ ${q.name}: ya existe en ${q.out} — skip (borralo para re-bajar)`);
    continue;
  }
  console.log(`Querying ${q.name}...`);
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "f35-flight-sim/1.0",
    },
    body: "data=" + encodeURIComponent(q.body.trim()),
  });
  if (!res.ok) {
    console.error(`  ✗ ${q.name}: HTTP ${res.status}`);
    const txt = await res.text();
    console.error(`    ${txt.slice(0, 500)}`);
    continue;
  }
  const json = await res.json();
  writeFileSync(q.out, JSON.stringify(json));
  const count = json.elements.length;
  // Stats: contar tipos de tags por feature
  const tagSummary = {};
  for (const el of json.elements) {
    const t = el.tags || {};
    const key = t[q.name === "natural-water" ? "natural" :
                  q.name === "aeroway" ? "aeroway" :
                  q.name === "highway" ? "highway" :
                  q.name === "building" ? "building" :
                  q.name === "waterway" ? "waterway" :
                  q.name === "railway" ? "railway" :
                  q.name === "landuse" ? "landuse" :
                  "other"] || "other";
    tagSummary[key] = (tagSummary[key] || 0) + 1;
  }
  console.log(`  ✓ ${count.toLocaleString()} elements → ${q.out}`);
  for (const [k, v] of Object.entries(tagSummary).sort((a,b) => b[1]-a[1]).slice(0, 8)) {
    console.log(`      ${k}: ${v.toLocaleString()}`);
  }
  // Pequeña pausa entre queries para no saturar Overpass
  await new Promise(r => setTimeout(r, 1500));
}

console.log("\n✓ Todos los OSM features bajados");
