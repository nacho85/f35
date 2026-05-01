"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON } from "./terrainScale";

// Equirectangular projection alrededor de TERRAIN_CENTER. Para distancias <
// ~50km a esa latitud, error < 1m vs Mercator. Bandar Abbas está en lat 27°.
const EARTH_CIRC = 40075016.686;
const M_PER_LON = (EARTH_CIRC * Math.cos((TERRAIN_CENTER_LAT * Math.PI) / 180)) / 360;
const M_PER_LAT = EARTH_CIRC / 360;

function llToWorld(lat, lon) {
  // World +X = este, +Z = sur (= lat menor).
  return [
    (lon - TERRAIN_CENTER_LON) * M_PER_LON,
    (TERRAIN_CENTER_LAT - lat) * M_PER_LAT,
  ];
}

// Strip mesh siguiendo un polyline con ancho dado perpendicular a la dirección.
function buildStripGeometry(points, width) {
  if (points.length < 2) return null;
  const positions = [];
  const indices = [];
  const half = width / 2;
  for (let i = 0; i < points.length; i++) {
    let dx, dz;
    if (i === 0) { dx = points[1][0] - points[0][0]; dz = points[1][1] - points[0][1]; }
    else if (i === points.length - 1) { dx = points[i][0] - points[i-1][0]; dz = points[i][1] - points[i-1][1]; }
    else { dx = points[i+1][0] - points[i-1][0]; dz = points[i+1][1] - points[i-1][1]; }
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    positions.push(points[i][0] + nx, 0, points[i][1] + nz);
    positions.push(points[i][0] - nx, 0, points[i][1] - nz);
  }
  // Winding CCW visto desde arriba → normales apuntan hacia +Y (luz del sol).
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

// Polygon (closed way) → ShapeGeometry rotada al plano XZ horizontal.
function buildPolygonGeometry(points) {
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => {
    // Shape vive en XY del shape; rotación -π/2 X mapea: (sx, sy, 0) → (sx, 0, -sy).
    // Para que terminemos en world (worldX, 0, worldZ): sx = worldX, sy = -worldZ.
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  return new THREE.ShapeGeometry(shape);
}

// Polygon extruido (buildings, hangars, terminals).
function buildExtrudeGeometry(points, height) {
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
}

export default function OSMAirport({ y = 5.5, showBuildings = false }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/osm/oikb.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch((err) => console.error("OSMAirport load:", err));
  }, []);

  const features = useMemo(() => {
    if (!data) return null;
    const f = { runways: [], taxiways: [], aprons: [], terminals: [], hangars: [], buildings: [] };
    for (const el of data.elements) {
      if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
      const t = el.tags || {};
      const pts = el.geometry.map((g) => llToWorld(g.lat, g.lon));
      const widthTag = t.width ? parseFloat(t.width) : null;
      const heightTag = t.height ? parseFloat(t.height) : null;
      if (t.aeroway === "runway") f.runways.push({ id: el.id, pts, width: widthTag || 50 });
      else if (t.aeroway === "taxiway") f.taxiways.push({ id: el.id, pts, width: widthTag || 23 });
      else if (t.aeroway === "apron") f.aprons.push({ id: el.id, pts });
      else if (t.aeroway === "terminal") f.terminals.push({ id: el.id, pts, h: heightTag || 12 });
      else if (t.aeroway === "hangar") f.hangars.push({ id: el.id, pts, h: heightTag || 15 });
      else if (showBuildings && t.building) f.buildings.push({ id: el.id, pts, h: heightTag || 5 });
    }
    return f;
  }, [data, showBuildings]);

  // Pre-compute geometries (memoized — costoso para muchos features).
  const geom = useMemo(() => {
    if (!features) return null;
    return {
      runways:   features.runways.map((r)   => ({ id: r.id, geo: buildStripGeometry(r.pts, r.width) })),
      taxiways:  features.taxiways.map((t)  => ({ id: t.id, geo: buildStripGeometry(t.pts, t.width) })),
      aprons:    features.aprons.map((a)    => ({ id: a.id, geo: buildPolygonGeometry(a.pts) })),
      terminals: features.terminals.map((t) => ({ id: t.id, geo: buildExtrudeGeometry(t.pts, t.h) })),
      hangars:   features.hangars.map((h)   => ({ id: h.id, geo: buildExtrudeGeometry(h.pts, h.h) })),
      buildings: features.buildings.map((b) => ({ id: b.id, geo: buildExtrudeGeometry(b.pts, b.h) })),
    };
  }, [features]);

  if (!geom) return null;

  return (
    <group position={[0, y, 0]}>
      {/* Apron — gris claro, flat. Va abajo de runways. */}
      {geom.aprons.map(({ id, geo }) => geo && (
        <mesh key={`apron-${id}`} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <meshStandardMaterial color="#7a7a7a" roughness={0.95} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Taxiways — gris medio. */}
      {geom.taxiways.map(({ id, geo }) => geo && (
        <mesh key={`tx-${id}`} geometry={geo} renderOrder={2} position={[0, 0.05, 0]}>
          <meshStandardMaterial color="#5a5a5a" roughness={0.95} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Runways — gris oscuro, encima. */}
      {geom.runways.map(({ id, geo }) => geo && (
        <mesh key={`rw-${id}`} geometry={geo} renderOrder={3} position={[0, 0.1, 0]}>
          <meshStandardMaterial color="#2a2a2a" roughness={0.96} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Terminals — extruidos. */}
      {geom.terminals.map(({ id, geo }) => geo && (
        <mesh key={`term-${id}`} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#a8b0bc" roughness={0.7} metalness={0.1} />
        </mesh>
      ))}
      {/* Hangares. */}
      {geom.hangars.map(({ id, geo }) => geo && (
        <mesh key={`hang-${id}`} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#7d8590" roughness={0.85} metalness={0.05} />
        </mesh>
      ))}
      {/* Buildings genéricos (city) — opcional, default off por performance. */}
      {showBuildings && geom.buildings.map(({ id, geo }) => geo && (
        <mesh key={`bld-${id}`} geometry={geo} rotation={[-Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#9a8d76" roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}
