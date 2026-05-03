"use client";

// Pinta calles/rutas/autopistas desde /osm/highway.json sobre el terreno.
// Strip geometry per polyline + sample del heightmap para elevación.
// Agrupa por categoría → 3 draw calls.

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isHeightmapReady, getElevationAtWorldXZ } from "./sharedHeightmap";
import { llToWorld } from "./osmProjection";

// Categorías → ancho default + render order (mayor renderOrder = arriba).
// Width en metros (1 lane ≈ 3.5m). renderOrder ascendente: residential
// abajo, motorway arriba.
// lift = altura sobre el terreno. Necesita ser generosa porque el sample CPU
// del heightmap difiere de la interpolación GPU del shader (especialmente en
// outer ring con vertex density baja). Mejor un poco "flotando" que enterrado.
const CATEGORIES = {
  major: { types: ["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"],
           widths: { motorway: 16, motorway_link: 8, trunk: 12, trunk_link: 7, primary: 9, primary_link: 6 },
           color: "#3a3a3e", roughness: 0.92, lift: 1.6, renderOrder: 12 },
  minor: { types: ["secondary", "secondary_link", "tertiary", "tertiary_link"],
           widths: { secondary: 7, secondary_link: 5, tertiary: 6, tertiary_link: 4 },
           color: "#4a4a4e", roughness: 0.94, lift: 1.6, renderOrder: 11 },
  local: { types: ["residential", "unclassified"],
           widths: { residential: 5, unclassified: 4 },
           color: "#5a5a5e", roughness: 0.95, lift: 1.6, renderOrder: 10 },
};

function categoryOf(type) {
  for (const cat of Object.keys(CATEGORIES)) {
    if (CATEGORIES[cat].types.includes(type)) return cat;
  }
  return null;
}

// Polyline → strip mesh con ancho perpendicular a la dirección, sample de
// elevación per-vertex. Mismo patrón que OSMAirport buildStripGeometry pero
// con elevación.
function buildElevatedStrip(points, width, lift) {
  if (points.length < 2) return null;
  const positions = [];
  const indices = [];
  const half = width / 2;
  for (let i = 0; i < points.length; i++) {
    let dx, dz;
    if (i === 0) {
      dx = points[1][0] - points[0][0];
      dz = points[1][1] - points[0][1];
    } else if (i === points.length - 1) {
      dx = points[i][0] - points[i-1][0];
      dz = points[i][1] - points[i-1][1];
    } else {
      dx = points[i+1][0] - points[i-1][0];
      dz = points[i+1][1] - points[i-1][1];
    }
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    const cx = points[i][0], cz = points[i][1];
    const elev = getElevationAtWorldXZ(cx, cz) + lift;
    positions.push(cx + nx, elev, cz + nz);
    positions.push(cx - nx, elev, cz - nz);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export default function OSMRoads({ y = 0, maxDistanceKm = 50 }) {
  const [data, setData] = useState(null);
  const [hmReady, setHmReady] = useState(isHeightmapReady());

  useEffect(() => {
    fetch("/osm/highway.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch((err) => console.error("OSMRoads load:", err));
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

  const merged = useMemo(() => {
    if (!data || !hmReady) return null;
    const t0 = performance.now();
    const buckets = { major: [], minor: [], local: [] };
    const maxDistSq = (maxDistanceKm * 1000) * (maxDistanceKm * 1000);
    let kept = 0, skipped = 0;

    for (const el of data.elements) {
      if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
      const tags = el.tags || {};
      const type = tags.highway;
      const cat = categoryOf(type);
      if (!cat) continue;
      const params = CATEGORIES[cat];
      const width = params.widths[type] ?? 4;

      const pts = el.geometry.map((g) => llToWorld(g.lat, g.lon));
      // Filtro por distancia: cualquier vertex < maxDist.
      let inRange = false;
      for (const [x, z] of pts) {
        if (x*x + z*z < maxDistSq) { inRange = true; break; }
      }
      if (!inRange) { skipped++; continue; }

      const geo = buildElevatedStrip(pts, width, params.lift);
      if (geo) { buckets[cat].push(geo); kept++; }
    }

    const out = {};
    for (const cat of Object.keys(buckets)) {
      if (buckets[cat].length === 0) { out[cat] = null; continue; }
      try {
        out[cat] = mergeGeometries(buckets[cat], false);
      } catch (e) {
        console.warn(`OSMRoads: merge ${cat} failed`, e);
        out[cat] = null;
      }
      buckets[cat].forEach((g) => g.dispose());
    }
    const t1 = performance.now();
    console.log(`OSMRoads: ${kept} kept (${skipped} far) in ${(t1-t0).toFixed(0)}ms`);
    return out;
  }, [data, hmReady, maxDistanceKm]);

  if (!merged) return null;

  return (
    <group position={[0, y, 0]}>
      {Object.keys(CATEGORIES).map((cat) => {
        const geo = merged[cat];
        const p = CATEGORIES[cat];
        if (!geo) return null;
        return (
          <mesh
            key={cat}
            geometry={geo}
            renderOrder={p.renderOrder}
            frustumCulled={false}
          >
            <meshStandardMaterial
              color={p.color}
              roughness={p.roughness}
              metalness={0}
              side={THREE.DoubleSide}
              polygonOffset
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-10}
              depthWrite={false}
              transparent
            />
          </mesh>
        );
      })}
    </group>
  );
}
