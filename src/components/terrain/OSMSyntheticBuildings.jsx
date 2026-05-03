"use client";

// Buildings sintéticos generados desde polígonos OSM landuse (residential,
// commercial, industrial). Llena los huecos donde el satelital muestra
// urbanización pero ni OSM ni Microsoft tienen footprints.
//
// Reglas:
//   - Skip si overlap con building existente (spatial hash)
//   - Altura inferida de buildings vecinos (~200m) — fallback a default por tipo
//   - Grid orientado al ángulo dominante del polígono (calles paralelas)

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isHeightmapReady, getElevationAtWorldXZ } from "./sharedHeightmap";
import { llToWorld, M_PER_LON } from "./osmProjection";

const EARTH = 40075016.686;
const M_PER_LAT = EARTH / 360;

// Spatial hash — O(1) lookup de items en 3×3 cells vecinos a (x, z).
class SpatialIndex {
  constructor(cellSize = 50) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }
  _key(x, z) {
    return Math.floor(x / this.cellSize) + "|" + Math.floor(z / this.cellSize);
  }
  add(item) {
    const k = this._key(item.x, item.z);
    const list = this.cells.get(k);
    if (list) list.push(item); else this.cells.set(k, [item]);
  }
  near(x, z) {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const out = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.cells.get((cx + dx) + "|" + (cz + dz));
        if (list) for (const it of list) out.push(it);
      }
    }
    return out;
  }
}

function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Orientación dominante del polígono via PCA de edge vectors → ángulo de
// rotación para que el grid siga las calles del barrio.
function polygonOrientation(poly) {
  let cxx = 0, cxz = 0, czz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) continue;
    const nx = dx / len, nz = dz / len;
    cxx += nx * nx * len;
    cxz += nx * nz * len;
    czz += nz * nz * len;
  }
  const tr = cxx + czz;
  const det = cxx * czz - cxz * cxz;
  const lambda = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const ex = lambda - czz, ez = cxz;
  if (Math.hypot(ex, ez) < 1e-6) return 0;
  return Math.atan2(ez, ex);
}

function polygonBBox(poly) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

// Defaults por tipo de landuse — Bandar Abbas: ciudad media, pisos bajos.
const LANDUSE_PARAMS = {
  residential: { cell: 11, gap: 4,  height: 6,  hVar: 2, prob: 0.75 },
  commercial:  { cell: 18, gap: 6,  height: 12, hVar: 4, prob: 0.6  },
  retail:      { cell: 16, gap: 6,  height: 9,  hVar: 3, prob: 0.6  },
  industrial:  { cell: 28, gap: 12, height: 8,  hVar: 3, prob: 0.5  },
  garages:     { cell: 6,  gap: 2,  height: 3,  hVar: 1, prob: 0.85 },
};

function hash21(x, z) {
  const a = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return a - Math.floor(a);
}

function inferHeight(x, z, existing, fallback, fallbackVar) {
  const cand = existing.near(x, z);
  const near = [];
  for (const c of cand) {
    if (!c.h) continue;
    const dx = c.x - x, dz = c.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 200 * 200) near.push({ d2, h: c.h });
  }
  if (near.length === 0) return fallback + (hash21(x, z * 1.31) - 0.5) * 2 * fallbackVar;
  near.sort((a, b) => a.d2 - b.d2);
  const top = near.slice(0, 5);
  return top.reduce((a, b) => a + b.h, 0) / top.length;
}

function nearExisting(x, z, existing, rejectDist) {
  const d2max = rejectDist * rejectDist;
  for (const c of existing.near(x, z)) {
    const dx = c.x - x, dz = c.z - z;
    if (dx * dx + dz * dz < d2max) return true;
  }
  return false;
}

export default function OSMSyntheticBuildings({
  y = 0,
  maxDistanceKm = 110,
  urbanMin = 5,        // pass2: cells con >= N buildings → considerar urbano
  urbanTarget = 35,    // pass2: rellenar hasta tener este nro de buildings/cell
  pass1Enabled = true,
  pass2Enabled = true,
}) {
  const [data, setData] = useState(null);
  const [hmReady, setHmReady] = useState(isHeightmapReady());

  useEffect(() => {
    Promise.all([
      fetch("/osm/landuse.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/osm/building.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/osm/ms-buildings.json").then((r) => (r.ok ? r.json() : { elements: [] })),
    ])
      .then(([landuse, osm, ms]) => {
        if (!landuse) return;
        setData({
          landuse,
          existing: { elements: [...(osm?.elements ?? []), ...(ms?.elements ?? [])] },
        });
      })
      .catch((err) => console.error("OSMSyntheticBuildings load:", err));
  }, []);

  useEffect(() => {
    if (hmReady) return;
    let raf;
    const tick = () => {
      if (isHeightmapReady()) setHmReady(true);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hmReady]);

  const generated = useMemo(() => {
    if (!data || !hmReady) return null;
    const t0 = performance.now();

    // Spatial index de buildings existentes (centro + altura si conocida).
    const existing = new SpatialIndex(50);
    for (const el of data.existing.elements) {
      if (el.type !== "way" || !el.bounds) continue;
      const cLat = (el.bounds.minlat + el.bounds.maxlat) / 2;
      const cLon = (el.bounds.minlon + el.bounds.maxlon) / 2;
      const [cx, cz] = llToWorld(cLat, cLon);
      const tags = el.tags || {};
      let h = null;
      if (tags.height) {
        const v = parseFloat(tags.height);
        if (!isNaN(v) && v > 0) h = v;
      } else if (tags["building:levels"]) {
        const l = parseFloat(tags["building:levels"]);
        if (!isNaN(l) && l > 0) h = l * 3;
      }
      existing.add({ x: cx, z: cz, h });
    }

    const maxDistSq = (maxDistanceKm * 1000) * (maxDistanceKm * 1000);
    const buckets = { residential: [], commercial: [], industrial: [] };
    let kept = 0, skippedOverlap = 0, skippedSparse = 0, skippedFar = 0;

    if (pass1Enabled) for (const el of data.landuse.elements) {
      if (el.type !== "way" || !el.geometry || el.geometry.length < 4) continue;
      const tags = el.tags || {};
      const lu = tags.landuse;
      const params = LANDUSE_PARAMS[lu];
      if (!params) continue;

      const poly = el.geometry.map((g) => llToWorld(g.lat, g.lon));
      const bbox = polygonBBox(poly);
      const cx0 = (bbox.minX + bbox.maxX) / 2;
      const cz0 = (bbox.minZ + bbox.maxZ) / 2;
      if (cx0 * cx0 + cz0 * cz0 > maxDistSq) { skippedFar++; continue; }

      const angle = polygonOrientation(poly);
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const step = params.cell + params.gap;

      // Centroide para origen del frame local.
      let pcx = 0, pcz = 0;
      for (const [px, pz] of poly) { pcx += px; pcz += pz; }
      pcx /= poly.length; pcz /= poly.length;

      // Bbox del polígono en el frame local rotado.
      let lminX = Infinity, lmaxX = -Infinity, lminZ = Infinity, lmaxZ = -Infinity;
      for (const [px, pz] of poly) {
        const lx = (px - pcx) * cosA + (pz - pcz) * sinA;
        const lz = -(px - pcx) * sinA + (pz - pcz) * cosA;
        if (lx < lminX) lminX = lx; if (lx > lmaxX) lmaxX = lx;
        if (lz < lminZ) lminZ = lz; if (lz > lmaxZ) lmaxZ = lz;
      }

      const cat = lu === "industrial" ? "industrial"
                : (lu === "commercial" || lu === "retail") ? "commercial"
                : "residential";

      for (let lz = lminZ + step / 2; lz <= lmaxZ; lz += step) {
        for (let lx = lminX + step / 2; lx <= lmaxX; lx += step) {
          // Local → world
          const wx = pcx + lx * cosA - lz * sinA;
          const wz = pcz + lx * sinA + lz * cosA;
          if (!pointInPolygon(wx, wz, poly)) continue;
          // Random sparse skip — visualmente evita grids perfectos.
          if (hash21(wx * 0.137, wz * 0.913) > params.prob) { skippedSparse++; continue; }
          // Skip si overlap con building existente (cell radius * 0.7).
          if (nearExisting(wx, wz, existing, params.cell * 0.7)) { skippedOverlap++; continue; }
          // Altura: vecinos existentes (radio 200m, top 5) → fallback default + var.
          const h = inferHeight(wx, wz, existing, params.height, params.hVar);
          if (h <= 0) continue;
          // Tamaño con variance.
          const w = params.cell * (0.85 + hash21(wx * 1.7, wz) * 0.3);
          const d = params.cell * (0.85 + hash21(wx, wz * 1.7) * 0.3);
          const elev = getElevationAtWorldXZ(wx, wz);
          // BoxGeometry centrada en (0,0,0). Trasladamos al world XZ + base
          // sobre el terreno + 1m de bias (igual que OSMBuildings).
          const geo = new THREE.BoxGeometry(w, h, d);
          geo.rotateY(angle);
          geo.translate(wx, elev + h / 2 + 1, wz);
          buckets[cat].push(geo);
          kept++;
        }
      }
    }

    // ─── PASS 2: density-driven fill ──────────────────────────────────────
    // Detecta zonas urbanas por densidad de buildings existentes (no solo OSM
    // landuse). Para cada cell de 250m con buildings entre [URBAN_MIN, URBAN_TARGET],
    // rellenar hasta llegar al target. Cubre zonas donde el OSM tiene buildings
    // pero no taggeó la zona como landuse=residential.
    const URBAN_CELL = 250;
    const URBAN_MIN = urbanMin;
    const URBAN_TARGET = urbanTarget;
    const SECOND_PASS_CELL = 11;
    const SECOND_PASS_GAP = 4;
    const densityGrid = new Map();
    // Acumular existing + lo que ya generamos en pass 1.
    const allKnown = [];
    for (const el of data.existing.elements) {
      if (el.type !== "way" || !el.bounds) continue;
      const cLat = (el.bounds.minlat + el.bounds.maxlat) / 2;
      const cLon = (el.bounds.minlon + el.bounds.maxlon) / 2;
      const [bx, bz] = llToWorld(cLat, cLon);
      const tags = el.tags || {};
      let bh = null;
      if (tags.height) { const v = parseFloat(tags.height); if (!isNaN(v)&&v>0) bh = v; }
      else if (tags["building:levels"]) { const l = parseFloat(tags["building:levels"]); if (!isNaN(l)&&l>0) bh = l*3; }
      allKnown.push({ x: bx, z: bz, h: bh });
    }
    for (const it of allKnown) {
      const k = Math.floor(it.x / URBAN_CELL) + "|" + Math.floor(it.z / URBAN_CELL);
      const e = densityGrid.get(k);
      if (e) e.count++; else densityGrid.set(k, { count: 1, samples: [] });
    }
    // Para angle inference por cell: tomamos pocas samples random.
    for (const it of allKnown) {
      const k = Math.floor(it.x / URBAN_CELL) + "|" + Math.floor(it.z / URBAN_CELL);
      const e = densityGrid.get(k);
      if (e && e.samples.length < 12) e.samples.push(it);
    }

    let kept2 = 0, skippedOverlap2 = 0, skippedSparse2 = 0;
    if (pass2Enabled) for (const [key, info] of densityGrid) {
      if (info.count < URBAN_MIN || info.count >= URBAN_TARGET) continue;
      const [kx, kz] = key.split("|").map(Number);
      const x0 = kx * URBAN_CELL, z0 = kz * URBAN_CELL;
      // Distance filter (cell center vs origin)
      const ccx = x0 + URBAN_CELL / 2, ccz = z0 + URBAN_CELL / 2;
      if (ccx*ccx + ccz*ccz > maxDistSq) continue;
      // Cuántos faltan
      const need = URBAN_TARGET - info.count;
      // Angle inference: PCA de samples (positions del cell).
      let cxx=0, cxz=0, czz=0;
      if (info.samples.length >= 4) {
        let cx=0, cz=0;
        for (const s of info.samples) { cx += s.x; cz += s.z; }
        cx /= info.samples.length; cz /= info.samples.length;
        for (const s of info.samples) {
          const dx = s.x - cx, dz = s.z - cz;
          cxx += dx*dx; cxz += dx*dz; czz += dz*dz;
        }
        const tr = cxx + czz;
        const det = cxx*czz - cxz*cxz;
        const lambda = tr/2 + Math.sqrt(Math.max(0, (tr*tr)/4 - det));
        const ex = lambda - czz, ez = cxz;
        var cellAngle = Math.hypot(ex,ez) > 1e-6 ? Math.atan2(ez, ex) : 0;
      } else {
        var cellAngle = 0;
      }
      const cosA = Math.cos(cellAngle), sinA = Math.sin(cellAngle);
      const step = SECOND_PASS_CELL + SECOND_PASS_GAP;
      // Iterar grid en frame local centrado en cell center.
      const half = URBAN_CELL / 2;
      let placed = 0;
      for (let lz = -half + step/2; lz <= half && placed < need; lz += step) {
        for (let lx = -half + step/2; lx <= half && placed < need; lx += step) {
          const wx = ccx + lx*cosA - lz*sinA;
          const wz = ccz + lx*sinA + lz*cosA;
          if (hash21(wx*0.179, wz*0.913) > 0.7) { skippedSparse2++; continue; }
          if (nearExisting(wx, wz, existing, SECOND_PASS_CELL * 0.7)) { skippedOverlap2++; continue; }
          const h = inferHeight(wx, wz, existing, 6, 2);
          if (h <= 0) continue;
          const w = SECOND_PASS_CELL * (0.85 + hash21(wx*1.7, wz) * 0.3);
          const d = SECOND_PASS_CELL * (0.85 + hash21(wx, wz*1.7) * 0.3);
          const elev = getElevationAtWorldXZ(wx, wz);
          const geo = new THREE.BoxGeometry(w, h, d);
          geo.rotateY(cellAngle);
          geo.translate(wx, elev + h/2 + 1, wz);
          buckets.residential.push(geo);
          // Registrarlo en el spatial index para que pass 1 + pass 2 no se
          // pisen entre sí (importante si reordenamos passes).
          existing.add({ x: wx, z: wz, h });
          kept2++; placed++;
        }
      }
    }

    const merged = {};
    for (const cat of Object.keys(buckets)) {
      if (buckets[cat].length === 0) { merged[cat] = null; continue; }
      try {
        merged[cat] = mergeGeometries(buckets[cat], false);
      } catch (e) {
        console.warn(`OSMSyntheticBuildings: merge ${cat} failed`, e);
        merged[cat] = null;
      }
      buckets[cat].forEach((g) => g.dispose());
    }
    const t1 = performance.now();
    console.log(
      `OSMSyntheticBuildings: pass1=${kept} (overlap=${skippedOverlap} sparse=${skippedSparse} far=${skippedFar})  pass2=${kept2} (overlap=${skippedOverlap2} sparse=${skippedSparse2}) in ${(t1 - t0).toFixed(0)}ms`
    );
    return merged;
  }, [data, hmReady, maxDistanceKm, urbanMin, urbanTarget, pass1Enabled, pass2Enabled]);

  if (!generated) return null;

  return (
    <group position={[0, y, 0]}>
      {generated.residential && (
        <mesh geometry={generated.residential} castShadow receiveShadow frustumCulled={false}>
          <meshStandardMaterial color="#bdac8c" roughness={0.88} metalness={0} />
        </mesh>
      )}
      {generated.commercial && (
        <mesh geometry={generated.commercial} castShadow receiveShadow frustumCulled={false}>
          <meshStandardMaterial color="#9aa2ab" roughness={0.75} metalness={0.05} />
        </mesh>
      )}
      {generated.industrial && (
        <mesh geometry={generated.industrial} castShadow receiveShadow frustumCulled={false}>
          <meshStandardMaterial color="#7e7a72" roughness={0.92} metalness={0.05} />
        </mesh>
      )}
    </group>
  );
}
