"use client";

// Árboles instanciados (palmeras + acacias) detectados desde:
//   - Z17 area (airport canvas, ~7.3km, 0.85m/px): scan de pixeles verde-oscuros
//   - Z14 area (resto de la ciudad): scatter alrededor de buildings existentes
//
// Renderizado con InstancedMesh — 1 draw call por especie. Geometría low-poly.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isHeightmapReady, getElevationAtWorldXZ } from "./sharedHeightmap";
import { isAirportCanvasReady, getAirportCanvasInfo } from "./sharedAirportCanvas";
import { llToWorld, M_PER_LON } from "./osmProjection";

const EARTH = 40075016.686;
const M_PER_LAT = EARTH / 360;

// ─── Geometrías low-poly ────────────────────────────────────────────────────
//
// Palm: trunk delgado + corona aplanada (8 fronds rotadas).
// Total ~32 triángulos por palm.
function makePalmGeometry() {
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 7, 6, 1);
  trunk.translate(0, 3.5, 0);
  // Crown: cono ancho aplanado.
  const crown = new THREE.ConeGeometry(3.5, 1.8, 8, 1);
  crown.translate(0, 7.5, 0);
  // Crown más oscuro vía group split — para esto necesitaríamos 2 materials.
  // Por simplicidad usamos un solo material y el color medio de palm.
  return mergeGeometries([trunk, crown], false);
}

// Acacia: trunk corto + crown esférica achatada (típica del paraguas árido).
function makeAcaciaGeometry() {
  const trunk = new THREE.CylinderGeometry(0.2, 0.3, 3, 5, 1);
  trunk.translate(0, 1.5, 0);
  const crown = new THREE.SphereGeometry(2.5, 6, 4);
  crown.scale(1.4, 0.7, 1.4);
  crown.translate(0, 4, 0);
  return mergeGeometries([trunk, crown], false);
}

// ─── Pixel "is tree" check ─────────────────────────────────────────────────
//
// Bandar Abbas satellite: árboles aparecen como verde oscuro/medio sobre
// fondo arena claro. Heurística RGB:
//   - Green domina: G > R*1.05 AND G > B*1.05
//   - No es brillante (descarta arena luminosa con tinte verde): R+G+B < 380
//   - Saturación mínima: max(R,G,B) - min(R,G,B) > 20
function isTreePixel(r, g, b) {
  if (r + g + b > 380) return false;     // muy claro
  if (r + g + b < 90)  return false;     // sombra/agua negra
  if (g <= r * 1.03 || g <= b * 1.03) return false; // no green-dominant
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn < 20) return false;        // sin saturación
  if (b > r * 1.3) return false;         // azulado (agua)
  return true;
}

function hash(x, z) {
  const a = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return a - Math.floor(a);
}

export default function OSMTrees({
  y = 0,
  scanZ17 = true,         // habilitar scan satelital z17
  scatterZ14 = true,      // habilitar scatter alrededor de buildings z14
  scanGridM = 6,          // grilla del scan en metros (6m ~ separación típica de palmera)
  z14ScatterMaxKm = 30,   // radius del scatter z14
  treesPerBuilding = 1.2, // promedio palms scattered por building
  maxInstances = 1000000, // hard cap de instancias totales
}) {
  const [hmReady, setHmReady] = useState(isHeightmapReady());
  const [acReady, setAcReady] = useState(isAirportCanvasReady());
  const [buildings, setBuildings] = useState(null);
  const [vegetation, setVegetation] = useState(null);

  useEffect(() => {
    Promise.all([
      scatterZ14
        ? Promise.all([
            fetch("/osm/building.json").then((r) => (r.ok ? r.json() : null)),
            fetch("/osm/ms-buildings.json").then((r) => (r.ok ? r.json() : { elements: [] })),
          ]).then(([osm, ms]) => ({ elements: [...(osm?.elements ?? []), ...(ms?.elements ?? [])] }))
        : Promise.resolve({ elements: [] }),
      Promise.all([
        fetch("/osm/landuse.json").then((r) => (r.ok ? r.json() : null)),
        fetch("/osm/natural-vegetation.json").then((r) => (r.ok ? r.json() : null)),
      ]).then(([landuse, natural]) => ({
        elements: [...(landuse?.elements ?? []), ...(natural?.elements ?? [])],
      })),
    ])
      .then(([b, v]) => { setBuildings(b); setVegetation(v); })
      .catch((err) => console.error("OSMTrees load:", err));
  }, [scatterZ14]);

  useEffect(() => {
    if (hmReady && acReady) return;
    let raf;
    const tick = () => {
      const h = isHeightmapReady(), a = isAirportCanvasReady();
      if (h !== hmReady) setHmReady(h);
      if (a !== acReady) setAcReady(a);
      if (!h || !a) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hmReady, acReady]);

  const placements = useMemo(() => {
    if (!hmReady) return null;
    if (!buildings || !vegetation) return null;
    const t0 = performance.now();
    const palms = []; // [x, z, scale, rotY]
    const acacias = [];
    let scanned = 0, scatter = 0, polygonScatter = 0;

    // ─── PASS A: scan satelital z17 ──────────────────────────────────────
    if (scanZ17 && acReady) {
      const ac = getAirportCanvasInfo();
      const pxPerM = ac.w / ac.worldSize;
      const cellPx = Math.max(2, Math.round(scanGridM * pxPerM));
      const cellsW = Math.floor(ac.w / cellPx);
      const cellsH = Math.floor(ac.h / cellPx);
      // Para cada cell, contamos pixels "tree" — si pasa threshold, emitimos
      // un árbol en el centroide del cell (con jitter).
      for (let cy = 0; cy < cellsH; cy++) {
        for (let cx = 0; cx < cellsW; cx++) {
          if (palms.length + acacias.length >= maxInstances) break;
          const px0 = cx * cellPx, py0 = cy * cellPx;
          let treeCount = 0, total = 0;
          let sumR = 0, sumG = 0, sumB = 0;
          for (let py = py0; py < py0 + cellPx; py += 2) {
            for (let px = px0; px < px0 + cellPx; px += 2) {
              const i = (py * ac.w + px) * 4;
              const r = ac.data[i], g = ac.data[i+1], b = ac.data[i+2];
              total++;
              if (isTreePixel(r, g, b)) {
                treeCount++;
                sumR += r; sumG += g; sumB += b;
              }
            }
          }
          if (total === 0) continue;
          const ratio = treeCount / total;
          if (ratio < 0.35) continue;
          // Mundo XZ del centroide
          const u = (px0 + cellPx * 0.5) / ac.w;
          const v = (py0 + cellPx * 0.5) / ac.h;
          const wx = ac.centerX + (u - 0.5) * ac.worldSize;
          const wz = ac.centerZ + (v - 0.5) * ac.worldSize;
          // Jitter dentro del cell (±cellSize/2 × random)
          const jx = (hash(wx, wz) - 0.5) * scanGridM * 0.6;
          const jz = (hash(wx * 1.7, wz) - 0.5) * scanGridM * 0.6;
          const x = wx + jx, z = wz + jz;
          // Clasifica palm vs acacia: avg color + ratio. Saturated dark green
          // → palm. Más opaco/marrón → acacia.
          const aR = sumR / treeCount, aG = sumG / treeCount;
          const isPalm = (aG > aR * 1.15) && ratio > 0.5;
          const scale = 0.85 + hash(wx, wz * 1.31) * 0.5;
          const rotY = hash(wx * 0.93, wz * 0.71) * Math.PI * 2;
          (isPalm ? palms : acacias).push([x, z, scale, rotY]);
          scanned++;
        }
        if (palms.length + acacias.length >= maxInstances) break;
      }
    }

    // ─── PASS B: scatter alrededor de buildings (z14, fuera de z17) ─────
    if (scatterZ14 && buildings) {
      // Para evitar duplicados con pass A, definimos grilla de exclusión
      // sobre las posiciones ya emitidas.
      const occGrid = new Map();
      const occCell = 8;
      const occKey = (x, z) => Math.floor(x/occCell) + "|" + Math.floor(z/occCell);
      for (const a of [palms, acacias]) for (const [x,,] of a) {
        const k = occKey(x, a === palms ? a[a.length-1][1] : 0);
        // simplificado: solo agregamos x+z reales
      }
      // Reescribir limpio:
      occGrid.clear();
      for (const [x, z] of palms) occGrid.set(occKey(x, z), 1);
      for (const [x, z] of acacias) occGrid.set(occKey(x, z), 1);

      const ac = acReady ? getAirportCanvasInfo() : null;
      const z17Half = ac ? ac.worldSize / 2 : 0;

      const maxDistSq = z14ScatterMaxKm * z14ScatterMaxKm * 1e6;
      for (const el of buildings.elements) {
        if (palms.length + acacias.length >= maxInstances) break;
        if (el.type !== "way" || !el.bounds) continue;
        const cLat = (el.bounds.minlat + el.bounds.maxlat) / 2;
        const cLon = (el.bounds.minlon + el.bounds.maxlon) / 2;
        const [bx, bz] = llToWorld(cLat, cLon);
        if (bx*bx + bz*bz > maxDistSq) continue;
        // Skip si el building está dentro del z17 (ya se cubrió por scan)
        if (ac && Math.abs(bx - ac.centerX) < z17Half && Math.abs(bz - ac.centerZ) < z17Half) continue;
        // Tamaño del building (radio aprox)
        const dlat = (el.bounds.maxlat - el.bounds.minlat) * M_PER_LAT;
        const dlon = (el.bounds.maxlon - el.bounds.minlon) * M_PER_LON;
        const r = Math.max(dlat, dlon) / 2 + 4; // 4m de buffer
        // Ratio probabilístico
        const r0 = hash(bx, bz);
        if (r0 > treesPerBuilding / 2) continue;
        const n = treesPerBuilding > 1 && hash(bx*1.7, bz) > 0.5 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const ang = hash(bx + i*7, bz + i*11) * Math.PI * 2;
          const dist = r + hash(bx + i*13, bz + i*17) * 6;
          const x = bx + Math.cos(ang) * dist;
          const z = bz + Math.sin(ang) * dist;
          const k = occKey(x, z);
          if (occGrid.has(k)) continue;
          occGrid.set(k, 1);
          const scale = 0.9 + hash(x, z) * 0.4;
          const rotY = hash(x * 0.93, z * 0.71) * Math.PI * 2;
          palms.push([x, z, scale, rotY]); // siempre palm en urban context
          scatter++;
        }
      }
    }

    // ─── PASS C: scatter dentro de polígonos OSM vegetation ────────────
    // Densidad por tipo. orchard = bosque denso de palmeras; wood = mixto;
    // scrub = acacias dispersas; farmland = palmeras al borde + algunas interior.
    const POLY_PARAMS = {
      orchard:  { gridM: 7,  prob: 0.85, species: "palm",   keys: ["landuse=orchard", "landuse=vineyard"] },
      wood:     { gridM: 9,  prob: 0.75, species: "mixed",  keys: ["natural=wood", "natural=tree_row"] },
      scrub:    { gridM: 25, prob: 0.55, species: "acacia", keys: ["natural=scrub", "natural=heath", "natural=grassland"] },
      farmland: { gridM: 18, prob: 0.30, species: "palm",   keys: ["landuse=farmland", "landuse=farmyard"] },
      wetland:  { gridM: 14, prob: 0.40, species: "palm",   keys: ["natural=wetland"] },
    };
    const POLY_TAG_TO_TYPE = new Map();
    for (const [t, p] of Object.entries(POLY_PARAMS)) {
      for (const k of p.keys) POLY_TAG_TO_TYPE.set(k, t);
    }
    const polyType = (tags) => {
      if (!tags) return null;
      for (const k of ["landuse", "natural"]) {
        const v = tags[k];
        if (v) {
          const t = POLY_TAG_TO_TYPE.get(k + "=" + v);
          if (t) return t;
        }
      }
      return null;
    };
    // Point-in-polygon (ray casting)
    const pip = (x, z, poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i];
        const [xj, zj] = poly[j];
        if (((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)) {
          inside = !inside;
        }
      }
      return inside;
    };
    for (const el of vegetation.elements) {
      if (palms.length + acacias.length >= maxInstances) break;
      if (el.type !== "way" || !el.geometry || el.geometry.length < 4) continue;
      const t = polyType(el.tags);
      if (!t) continue;
      const params = POLY_PARAMS[t];
      const poly = el.geometry.map((g) => llToWorld(g.lat, g.lon));
      // bbox + distance filter
      let minX=Infinity, maxX=-Infinity, minZ=Infinity, maxZ=-Infinity;
      for (const [x, z] of poly) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      if (cx*cx + cz*cz > z14ScatterMaxKm * z14ScatterMaxKm * 1e6) continue;
      // Iterate grid
      const step = params.gridM;
      for (let z = minZ + step/2; z <= maxZ; z += step) {
        for (let x = minX + step/2; x <= maxX; x += step) {
          if (palms.length + acacias.length >= maxInstances) break;
          if (!pip(x, z, poly)) continue;
          if (hash(x*0.137, z*0.913) > params.prob) continue;
          const jx = (hash(x*1.7, z) - 0.5) * step * 0.7;
          const jz = (hash(x, z*1.7) - 0.5) * step * 0.7;
          const fx = x + jx, fz = z + jz;
          const scale = 0.85 + hash(fx, fz*1.31) * 0.5;
          const rotY = hash(fx*0.93, fz*0.71) * Math.PI * 2;
          let species = params.species;
          if (species === "mixed") species = hash(fx, fz) > 0.5 ? "palm" : "acacia";
          (species === "palm" ? palms : acacias).push([fx, fz, scale, rotY]);
          polygonScatter++;
        }
      }
    }

    const t1 = performance.now();
    console.log(
      `OSMTrees: scan=${scanned} polygonScatter=${polygonScatter} cityScatter=${scatter} → ${palms.length} palms + ${acacias.length} acacias in ${(t1 - t0).toFixed(0)}ms`
    );
    return { palms, acacias };
  }, [hmReady, acReady, buildings, vegetation, scanZ17, scatterZ14, scanGridM, z14ScatterMaxKm, treesPerBuilding, maxInstances]);

  const palmGeo = useMemo(() => makePalmGeometry(), []);
  const acaciaGeo = useMemo(() => makeAcaciaGeometry(), []);
  const palmRef = useRef();
  const acaciaRef = useRef();

  // Set instance matrices cuando hay placements
  useEffect(() => {
    if (!placements) return;
    const m = new THREE.Matrix4();
    if (palmRef.current) {
      const inst = palmRef.current;
      inst.count = placements.palms.length;
      for (let i = 0; i < placements.palms.length; i++) {
        const [x, z, s, ry] = placements.palms[i];
        const elev = getElevationAtWorldXZ(x, z);
        m.compose(
          new THREE.Vector3(x, elev + y, z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
          new THREE.Vector3(s, s, s)
        );
        inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
    if (acaciaRef.current) {
      const inst = acaciaRef.current;
      inst.count = placements.acacias.length;
      for (let i = 0; i < placements.acacias.length; i++) {
        const [x, z, s, ry] = placements.acacias[i];
        const elev = getElevationAtWorldXZ(x, z);
        m.compose(
          new THREE.Vector3(x, elev + y, z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
          new THREE.Vector3(s, s, s)
        );
        inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
  }, [placements, y]);

  if (!placements) return null;

  return (
    <group>
      <instancedMesh
        ref={palmRef}
        args={[palmGeo, undefined, Math.max(1, placements.palms.length)]}
        frustumCulled={false}
        castShadow
      >
        <meshStandardMaterial color="#3a5226" roughness={0.85} metalness={0} />
      </instancedMesh>
      <instancedMesh
        ref={acaciaRef}
        args={[acaciaGeo, undefined, Math.max(1, placements.acacias.length)]}
        frustumCulled={false}
        castShadow
      >
        <meshStandardMaterial color="#4d5e2e" roughness={0.9} metalness={0} />
      </instancedMesh>
    </group>
  );
}
