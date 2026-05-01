// Build vector coastline data para rendering AAA-grade.
//
// Pipeline:
//   1. Query Overpass para natural=coastline en bbox 400km
//   2. Proyectar lon/lat → world XZ (mismo sistema que la escena)
//   3. Convertir polylines en flat segment list (de N puntos → N-1 segments)
//   4. Build spatial acceleration grid:
//        - Grid de RES_GRID×RES_GRID celdas (~781m por celda en 400km)
//        - Para cada celda: lista de segment indices que pasan a < MARGIN de la celda
//   5. Save 3 binarios:
//        - segments.bin    → array de Float32 [x1, z1, x2, z2] × N segments
//        - grid.bin        → array de Uint32 [start_offset, count] × RES_GRID²
//        - indices.bin     → array de Uint32 segment indices (flat list referenciada por grid)
//
// El runtime lee estos 3 archivos y crea DataTextures para el shader.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const CENTER_LAT = 27.218;
const CENTER_LON = 56.378;
const MASK_KM    = 400;
const RES_GRID   = 512;        // 781m por celda
const CELL_MARGIN_M = 1000;    // segmentos a < 1km de la celda — suficiente para AA + shallow gradient

const OUT_DIR = "public/textures/water";
const OUT_SEG = `${OUT_DIR}/coastline-segments.bin`;
const OUT_GRID = `${OUT_DIR}/coastline-grid.bin`;
const OUT_IDX = `${OUT_DIR}/coastline-indices.bin`;
const OUT_META = `${OUT_DIR}/coastline-meta.json`;
const COASTLINE_CACHE = "public/osm/coastline.json";

// ─── Proyección scene-matched ───────────────────────────────────────────────
const EARTH_CIRC = 40075016.686;
const Z_REF = 14;
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

// ─── Step 1: get coastline (cache or Overpass) ──────────────────────────────
let coastJson;
if (existsSync(COASTLINE_CACHE)) {
  console.log(`Cache hit: ${COASTLINE_CACHE}`);
  coastJson = JSON.parse(readFileSync(COASTLINE_CACHE, "utf8"));
} else {
  console.log("Querying Overpass for natural=coastline...");
  const HALF_LAT_DEG = MASK_KM / 2 / 110.574;
  const HALF_LON_DEG = MASK_KM / 2 / (METERS_PER_DEG_LON / 1000);
  const BBOX_S = (CENTER_LAT - HALF_LAT_DEG).toFixed(4);
  const BBOX_W = (CENTER_LON - HALF_LON_DEG).toFixed(4);
  const BBOX_N = (CENTER_LAT + HALF_LAT_DEG).toFixed(4);
  const BBOX_E = (CENTER_LON + HALF_LON_DEG).toFixed(4);
  const QUERY = `
[out:json][timeout:120];
way["natural"="coastline"](${BBOX_S},${BBOX_W},${BBOX_N},${BBOX_E});
out geom;
`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "f35-flight-sim/1.0" },
    body: "data=" + encodeURIComponent(QUERY.trim()),
  });
  if (!res.ok) {
    console.error(`Overpass error ${res.status}`);
    process.exit(1);
  }
  coastJson = await res.json();
  mkdirSync("public/osm", { recursive: true });
  writeFileSync(COASTLINE_CACHE, JSON.stringify(coastJson));
  console.log(`  Saved ${coastJson.elements.length} ways → ${COASTLINE_CACHE}`);
}

// ─── Step 2: convert polylines to segment list (in world XZ) ────────────────
console.log("Step 2: build segment list (world XZ)...");
const segments = []; // flat array of [x1, z1, x2, z2]
for (const el of coastJson.elements) {
  if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
  const pts = el.geometry.map(g => lonLatToWorldXZ(g.lon, g.lat));
  for (let i = 1; i < pts.length; i++) {
    const [x1, z1] = pts[i - 1];
    const [x2, z2] = pts[i];
    segments.push(x1, z1, x2, z2);
  }
}
const numSegments = segments.length / 4;
console.log(`  ${numSegments.toLocaleString()} segments`);

// ─── Step 3: build spatial grid ─────────────────────────────────────────────
console.log("Step 3: build spatial grid...");
const HALF_M = MASK_KM * 1000 / 2;
const CELL_M = (MASK_KM * 1000) / RES_GRID;
console.log(`  Grid ${RES_GRID}×${RES_GRID}, cell = ${CELL_M.toFixed(1)}m, margin = ${CELL_MARGIN_M}m`);

// Para cada celda, lista de segment indices (que tocan o están a margin de la celda)
const cellLists = new Array(RES_GRID * RES_GRID).fill(null).map(() => []);

function worldXZToCell(wx, wz) {
  const u = (wx + HALF_M) / (2 * HALF_M);
  const v = (wz + HALF_M) / (2 * HALF_M);
  const cx = Math.floor(u * RES_GRID);
  const cy = Math.floor(v * RES_GRID);
  return { cx, cy };
}

// Para cada segmento, encuentra rango de celdas que toca (con margin) y agrega.
let segmentsAssigned = 0;
const marginCells = Math.ceil(CELL_MARGIN_M / CELL_M); // cuántas celdas a cada lado para el margin
for (let i = 0; i < numSegments; i++) {
  const x1 = segments[i * 4 + 0];
  const z1 = segments[i * 4 + 1];
  const x2 = segments[i * 4 + 2];
  const z2 = segments[i * 4 + 3];

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);

  const c0 = worldXZToCell(minX, minZ);
  const c1 = worldXZToCell(maxX, maxZ);
  const cxMin = Math.max(0, c0.cx - marginCells);
  const cxMax = Math.min(RES_GRID - 1, c1.cx + marginCells);
  const cyMin = Math.max(0, c0.cy - marginCells);
  const cyMax = Math.min(RES_GRID - 1, c1.cy + marginCells);

  for (let cy = cyMin; cy <= cyMax; cy++) {
    for (let cx = cxMin; cx <= cxMax; cx++) {
      cellLists[cy * RES_GRID + cx].push(i);
      segmentsAssigned++;
    }
  }
}
console.log(`  Total segment-cell assignments: ${segmentsAssigned.toLocaleString()}`);

// Stats: # de segmentos por celda
let nonEmptyCells = 0;
let maxPerCell = 0;
let totalIndices = 0;
for (const lst of cellLists) {
  if (lst.length > 0) nonEmptyCells++;
  if (lst.length > maxPerCell) maxPerCell = lst.length;
  totalIndices += lst.length;
}
console.log(`  Non-empty cells: ${nonEmptyCells.toLocaleString()} / ${(RES_GRID*RES_GRID).toLocaleString()}`);
console.log(`  Max segments per cell: ${maxPerCell}`);
console.log(`  Avg per non-empty cell: ${(totalIndices/nonEmptyCells).toFixed(1)}`);

// ─── Step 4: pack into binaries ────────────────────────────────────────────
console.log("Step 4: pack binaries...");

// segments.bin: Float32Array de 4*N
const segArr = new Float32Array(segments);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_SEG, Buffer.from(segArr.buffer));

// indices.bin: Uint32Array, flat list de indices, ordenada por celda
// grid.bin: Uint32Array de 2*RES_GRID², (start, count) por celda
const gridArr = new Uint32Array(RES_GRID * RES_GRID * 2);
const indicesArr = new Uint32Array(totalIndices);
let cursor = 0;
for (let i = 0; i < cellLists.length; i++) {
  const lst = cellLists[i];
  gridArr[i * 2 + 0] = cursor;
  gridArr[i * 2 + 1] = lst.length;
  for (const idx of lst) indicesArr[cursor++] = idx;
}
writeFileSync(OUT_GRID, Buffer.from(gridArr.buffer));
writeFileSync(OUT_IDX, Buffer.from(indicesArr.buffer));

const meta = {
  version: 1,
  numSegments,
  resGrid: RES_GRID,
  cellMeters: CELL_M,
  cellMarginMeters: CELL_MARGIN_M,
  worldHalfMeters: HALF_M,
  centerLat: CENTER_LAT,
  centerLon: CENTER_LON,
  totalIndices,
  nonEmptyCells,
  maxPerCell,
};
writeFileSync(OUT_META, JSON.stringify(meta, null, 2));

console.log("");
console.log("✓ Files saved:");
console.log(`  ${OUT_SEG}   (${(segArr.byteLength / 1024).toFixed(1)} KB)`);
console.log(`  ${OUT_GRID}  (${(gridArr.byteLength / 1024).toFixed(1)} KB)`);
console.log(`  ${OUT_IDX}   (${(indicesArr.byteLength / 1024).toFixed(1)} KB)`);
console.log(`  ${OUT_META}`);
