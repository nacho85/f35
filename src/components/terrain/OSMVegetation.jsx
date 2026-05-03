"use client";

// Pinta zonas verdes desde /osm/landuse.json sobre el terreno: farmland,
// orchard, cemetery, etc. ShapeGeometry triangulada con elevation per-vertex
// del heightmap. Grouped por tipo → 1 draw call por categoría.

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isHeightmapReady, getElevationAtWorldXZ } from "./sharedHeightmap";
import { llToWorld } from "./osmProjection";

// Categorías: color + lift + tags que mapean. tagSet es Set<string> de
// "key=value" combos para matchear contra cualquier tag del element.
const CATEGORIES = {
  farmland: { tags: ["landuse=farmland", "landuse=farmyard"],
              color: "#a9b370", lift: 0.3 },
  orchard:  { tags: ["landuse=orchard", "landuse=vineyard"],
              color: "#6b8a3d", lift: 0.4 },
  wood:     { tags: ["natural=wood", "natural=tree_row"],
              color: "#3d5a2a", lift: 0.4 },
  scrub:    { tags: ["natural=scrub", "natural=heath", "natural=grassland"],
              color: "#9aa365", lift: 0.3 },
  wetland:  { tags: ["natural=wetland"],
              color: "#5a7a4a", lift: 0.2 },
  beach:    { tags: ["natural=beach", "natural=sand"],
              color: "#d8c896", lift: 0.2 },
  cemetery: { tags: ["landuse=cemetery"],
              color: "#8a8a78", lift: 0.3 },
};

// Pre-build tag→category map para lookup O(1).
const TAG_TO_CAT = (() => {
  const m = new Map();
  for (const [cat, p] of Object.entries(CATEGORIES)) {
    for (const t of p.tags) m.set(t, cat);
  }
  return m;
})();

function categoryOfElement(tags) {
  if (!tags) return null;
  // Probar landuse, natural, leisure en ese orden.
  for (const k of ["landuse", "natural", "leisure"]) {
    const v = tags[k];
    if (v) {
      const cat = TAG_TO_CAT.get(k + "=" + v);
      if (cat) return cat;
    }
  }
  return null;
}

// Polygon → ShapeGeometry triangulada en XZ con vertices a elev + lift.
function buildElevatedPolygon(points, lift) {
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  // Shape vive en XY del shape; rotación -π/2 X mapea: (sx, sy, 0) → (sx, 0, -sy).
  // Para world (worldX, 0, worldZ): sx = worldX, sy = -worldZ.
  points.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  // Sample elevation per-vertex.
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i);
    const wz = pos.getZ(i);
    const elev = getElevationAtWorldXZ(wx, wz) + lift;
    pos.setY(i, elev);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export default function OSMVegetation({ y = 0, maxDistanceKm = 50 }) {
  const [data, setData] = useState(null);
  const [hmReady, setHmReady] = useState(isHeightmapReady());

  useEffect(() => {
    Promise.all([
      fetch("/osm/landuse.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/osm/natural-vegetation.json").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([landuse, natural]) => {
        const elements = [
          ...(landuse?.elements ?? []),
          ...(natural?.elements ?? []),
        ];
        setData({ elements });
      })
      .catch((err) => console.error("OSMVegetation load:", err));
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
    const buckets = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, []]));
    const maxDistSq = (maxDistanceKm * 1000) * (maxDistanceKm * 1000);
    let kept = 0, skipped = 0;

    for (const el of data.elements) {
      if (el.type !== "way" || !el.geometry || el.geometry.length < 4) continue;
      const cat = categoryOfElement(el.tags);
      if (!cat) continue;
      const params = CATEGORIES[cat];
      const pts = el.geometry.map((g) => llToWorld(g.lat, g.lon));
      // Distance filter — any vertex within range.
      let inRange = false;
      for (const [x, z] of pts) {
        if (x*x + z*z < maxDistSq) { inRange = true; break; }
      }
      if (!inRange) { skipped++; continue; }
      try {
        const geo = buildElevatedPolygon(pts, params.lift);
        if (geo) { buckets[cat].push(geo); kept++; }
      } catch (e) { /* malformed polygon, skip */ }
    }

    const out = {};
    for (const cat of Object.keys(buckets)) {
      if (buckets[cat].length === 0) { out[cat] = null; continue; }
      try {
        out[cat] = mergeGeometries(buckets[cat], false);
      } catch (e) {
        console.warn(`OSMVegetation: merge ${cat} failed`, e);
        out[cat] = null;
      }
      buckets[cat].forEach((g) => g.dispose());
    }
    const t1 = performance.now();
    console.log(`OSMVegetation: ${kept} kept (${skipped} far) in ${(t1-t0).toFixed(0)}ms`);
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
            renderOrder={5}
            frustumCulled={false}
          >
            <meshStandardMaterial
              color={p.color}
              roughness={0.95}
              metalness={0}
              side={THREE.DoubleSide}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-4}
              transparent
              opacity={0.85}
            />
          </mesh>
        );
      })}
    </group>
  );
}
