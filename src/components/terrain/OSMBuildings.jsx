"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isHeightmapReady, getElevationAtWorldXZ } from "./sharedHeightmap";
import { llToWorld } from "./osmProjection";

// Default heights por tipo de building OSM (metros). Bandar Abbas: ciudad de
// densidad media, predominan casas bajas, pocos edificios altos en centro.
const DEFAULT_HEIGHT = {
  yes:         6,
  house:       5,
  apartments: 14,
  residential: 8,
  commercial: 12,
  industrial:  9,
  shed:        4,
  terrace:     5,
  hangar:     12,
  hotel:      18,
  mosque:     16,
  school:     10,
  hospital:   14,
  warehouse:   9,
  garage:      3,
  retail:      8,
  office:     20,
  public:     12,
};

// Material category por tipo OSM → permite agrupar en pocos materials.
function materialCategory(t) {
  if (t === "industrial" || t === "warehouse" || t === "hangar" || t === "shed" || t === "garage") return "industrial";
  if (t === "commercial" || t === "retail" || t === "office" || t === "hotel" || t === "public") return "commercial";
  return "residential"; // yes, house, apartments, residential, terrace, mosque, etc.
}

// Resolver altura final del building.
function resolveHeight(tags) {
  if (tags.height) {
    const h = parseFloat(tags.height);
    if (!isNaN(h) && h > 0) return h;
  }
  if (tags["building:levels"]) {
    const l = parseFloat(tags["building:levels"]);
    if (!isNaN(l) && l > 0) return l * 3.0; // ~3m por piso
  }
  return DEFAULT_HEIGHT[tags.building] ?? 6;
}

// Construye una geometría extruida desde un footprint OSM.
function buildExtrudeGeometry(points, height) {
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  // Rotamos y mapeamos al plano XZ horizontal (extrusión en +Y).
  g.rotateX(-Math.PI / 2);
  return g;
}

export default function OSMBuildings({ y = 0, maxDistanceKm = 15 }) {
  const [data, setData] = useState(null);
  // Re-render una vez que el heightmap esté listo para que el useMemo de
  // groupedGeoms recompute con elevación correcta. Polling RAF — el heightmap
  // tarda 0-2s en cargar después del mount.
  const [hmReady, setHmReady] = useState(isHeightmapReady());

  useEffect(() => {
    // Cargamos building.json (OSM contributors) Y ms-buildings.json (Microsoft
    // ML-derived) → cobertura mucho mejor en zonas con OSM sparse.
    Promise.all([
      fetch("/osm/building.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/osm/ms-buildings.json").then((r) => (r.ok ? r.json() : { elements: [] })),
    ]).then(([osm, ms]) => {
      const merged = { elements: [...(osm?.elements ?? []), ...(ms?.elements ?? [])] };
      setData(merged);
    }).catch((err) => console.error("OSMBuildings load:", err));
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

  // Filtro + merge por categoría → 3 BufferGeometries finales (uno por material).
  // Hacemos esto una sola vez (cuando data + heightmap están listos) — pre-
  // compute es O(N) por las triangulaciones earcut de ExtrudeGeometry.
  const groupedGeoms = useMemo(() => {
    if (!data || !hmReady) return null;
    const t0 = performance.now();
    const buckets = { residential: [], commercial: [], industrial: [] };
    const maxDistM = maxDistanceKm * 1000;
    const maxDistSq = maxDistM * maxDistM;
    let kept = 0, skipped = 0;

    for (const el of data.elements) {
      if (el.type !== "way" || !el.geometry || el.geometry.length < 3) continue;
      const tags = el.tags || {};
      if (!tags.building) continue;

      // Filtro por distancia al centro (TFB.9). El bounds OSM es lat/lon
      // → convertimos centro del bounds a world XZ para chequear.
      let cx, cz;
      if (el.bounds) {
        const bcLat = (el.bounds.minlat + el.bounds.maxlat) / 2;
        const bcLon = (el.bounds.minlon + el.bounds.maxlon) / 2;
        [cx, cz] = llToWorld(bcLat, bcLon);
      } else {
        const g0 = el.geometry[0];
        [cx, cz] = llToWorld(g0.lat, g0.lon);
      }
      if (cx * cx + cz * cz > maxDistSq) { skipped++; continue; }

      const pts = el.geometry.map((g) => llToWorld(g.lat, g.lon));
      const h = resolveHeight(tags);
      const geo = buildExtrudeGeometry(pts, h);
      if (!geo) continue;
      // Sample del heightmap + lift generoso. Lift compensa la diferencia
      // entre el bilinear sample CPU (denso) y la interpolación lineal del
      // GPU entre vértices del mesh (z17=76m vertex spacing, z14=137m, z10=
      // 4.3km). Sin lift suficiente, building queda enterrado en pendientes.
      const elev = getElevationAtWorldXZ(cx, cz) + 5.0;
      geo.translate(0, elev, 0);
      const cat = materialCategory(tags.building);
      buckets[cat].push(geo);
      kept++;
    }

    // Merge cada bucket en un único BufferGeometry (1 draw call por material).
    const merged = {};
    for (const cat of Object.keys(buckets)) {
      if (buckets[cat].length === 0) { merged[cat] = null; continue; }
      try {
        merged[cat] = mergeGeometries(buckets[cat], false);
      } catch (e) {
        console.warn(`OSMBuildings: merge ${cat} failed`, e);
        merged[cat] = null;
      }
      // Dispose de las individuales (ya copiadas en el merged).
      buckets[cat].forEach((g) => g.dispose());
    }
    const t1 = performance.now();
    console.log(`OSMBuildings: ${kept} kept, ${skipped} skipped (>15km) in ${(t1-t0).toFixed(0)}ms`);
    return merged;
  }, [data, maxDistanceKm, hmReady]);

  if (!groupedGeoms) return null;

  return (
    <group position={[0, y, 0]}>
      {groupedGeoms.residential && (
        <mesh geometry={groupedGeoms.residential} castShadow receiveShadow frustumCulled={false}>
          <meshStandardMaterial color="#c8b89a" roughness={0.85} metalness={0} />
        </mesh>
      )}
      {groupedGeoms.commercial && (
        <mesh geometry={groupedGeoms.commercial} castShadow receiveShadow frustumCulled={false}>
          <meshStandardMaterial color="#a0a8b0" roughness={0.7} metalness={0.1} />
        </mesh>
      )}
      {groupedGeoms.industrial && (
        <mesh geometry={groupedGeoms.industrial} castShadow receiveShadow frustumCulled={false}>
          <meshStandardMaterial color="#8a8478" roughness={0.9} metalness={0.05} />
        </mesh>
      )}
    </group>
  );
}
