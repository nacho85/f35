"use client";

// OSMRoads versión streamed — carga rutas/calles por chunk z12 según posición
// de la cámara. Mismo patrón que OSMBuildingsStreamed.
//
// Cada chunk z12 ~ 10km × 10km a lat 27. activeRadiusKm = chunks alrededor.
// Manifest en /osm/roads/12/manifest.json + tile JSONs en /osm/roads/12/{tx}/{ty}.json.

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isHeightmapReady, getElevationAtWorldXZ } from "./sharedHeightmap";
import { llToWorld, worldToLatLon } from "./osmProjection";

const ZOOM = 12;

function lonToTileX(lon) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, ZOOM));
}
function latToTileY(lat) {
  const latRad = (lat * Math.PI) / 180;
  const m = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.floor(((1 - m / Math.PI) / 2) * Math.pow(2, ZOOM));
}

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

function buildChunkMeshes(elements) {
  const buckets = { major: [], minor: [], local: [] };
  for (const el of elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const tags = el.tags || {};
    const type = tags.highway;
    const cat = categoryOf(type);
    if (!cat) continue;
    const params = CATEGORIES[cat];
    const width = params.widths[type] ?? 4;
    const pts = el.geometry.map((g) => llToWorld(g.lat, g.lon));
    const geo = buildElevatedStrip(pts, width, params.lift);
    if (geo) buckets[cat].push(geo);
  }
  const merged = {};
  for (const cat of Object.keys(buckets)) {
    if (!buckets[cat].length) { merged[cat] = null; continue; }
    try { merged[cat] = mergeGeometries(buckets[cat], false); }
    catch { merged[cat] = null; }
    buckets[cat].forEach((g) => g.dispose());
  }
  return merged;
}

export default function OSMRoadsStreamed({
  y = 0,
  activeRadiusKm = 20,
  updateIntervalMs = 500,
  maxConcurrent = 3,
}) {
  const [manifest, setManifest] = useState(null);
  const [hmReady, setHmReady] = useState(isHeightmapReady());
  const [chunks, setChunks] = useState(new Map());
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;
  const inFlight = useRef(new Set());
  const lastUpdate = useRef(0);

  const sharedMaterials = useMemo(() => {
    const out = {};
    for (const [cat, p] of Object.entries(CATEGORIES)) {
      out[cat] = new THREE.MeshStandardMaterial({
        color: p.color, roughness: p.roughness, metalness: 0,
        side: THREE.DoubleSide, polygonOffset: true,
        polygonOffsetFactor: -4, polygonOffsetUnits: -10,
        depthWrite: false, transparent: true,
      });
    }
    return out;
  }, []);

  useEffect(() => {
    fetch("/osm/roads/12/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m) return;
        m.tileSet = new Set(m.tiles.map((t) => t.tx + "_" + t.ty));
        setManifest(m);
      })
      .catch((err) => console.error("OSMRoadsStreamed manifest:", err));
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

  const loadChunk = async (tx, ty) => {
    const key = tx + "_" + ty;
    if (inFlight.current.has(key) || chunksRef.current.has(key)) return;
    inFlight.current.add(key);
    try {
      const res = await fetch(`/osm/roads/12/${tx}/${ty}.json`);
      if (!res.ok) return;
      const data = await res.json();
      const merged = buildChunkMeshes(data.elements);
      setChunks((prev) => {
        const next = new Map(prev);
        next.set(key, merged);
        return next;
      });
    } catch (e) {
      console.warn(`OSMRoadsStreamed: chunk ${key} failed`, e);
    } finally {
      inFlight.current.delete(key);
    }
  };

  const unloadChunk = (key, data) => {
    for (const cat of Object.keys(data)) {
      if (data[cat]) data[cat].dispose();
    }
  };

  useFrame(({ camera, clock }) => {
    if (!manifest || !hmReady) return;
    const now = clock.elapsedTime * 1000;
    if (now - lastUpdate.current < updateIntervalMs) return;
    lastUpdate.current = now;

    const [camLat, camLon] = worldToLatLon(camera.position.x, camera.position.z);
    const ccx = lonToTileX(camLon);
    const ccy = latToTileY(camLat);
    const radiusTiles = Math.max(1, Math.ceil(activeRadiusKm / 10));
    const needed = new Set();
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        const key = (ccx + dx) + "_" + (ccy + dy);
        if (manifest.tileSet.has(key)) needed.add(key);
      }
    }

    if (inFlight.current.size < maxConcurrent) {
      const candidates = [];
      for (const key of needed) {
        if (!chunksRef.current.has(key) && !inFlight.current.has(key)) {
          const [tx, ty] = key.split("_").map(Number);
          const d2 = (tx - ccx) ** 2 + (ty - ccy) ** 2;
          candidates.push({ tx, ty, d2 });
        }
      }
      candidates.sort((a, b) => a.d2 - b.d2);
      const slots = maxConcurrent - inFlight.current.size;
      for (let i = 0; i < Math.min(slots, candidates.length); i++) {
        loadChunk(candidates[i].tx, candidates[i].ty);
      }
    }

    setChunks((prev) => {
      let mutated = false;
      const next = new Map(prev);
      for (const [key, data] of next) {
        if (!needed.has(key)) {
          unloadChunk(key, data);
          next.delete(key);
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  });

  useEffect(() => {
    return () => {
      for (const [, data] of chunksRef.current) unloadChunk(null, data);
      for (const m of Object.values(sharedMaterials)) m.dispose();
    };
  }, [sharedMaterials]);

  return (
    <group position={[0, y, 0]}>
      {[...chunks.entries()].map(([key, data]) => (
        <group key={key}>
          {Object.keys(CATEGORIES).map((cat) => data[cat] && (
            <mesh
              key={cat}
              geometry={data[cat]}
              material={sharedMaterials[cat]}
              renderOrder={CATEGORIES[cat].renderOrder}
              frustumCulled={false}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
