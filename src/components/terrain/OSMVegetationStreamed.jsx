"use client";

// OSMVegetation versión streamed — landuse/natural por chunk z12 según cámara.
// Manifest /osm/vegetation/12/manifest.json + tile JSONs en /osm/vegetation/12/{tx}/{ty}.json.

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
  farmland: { tags: ["landuse=farmland", "landuse=farmyard"], color: "#a9b370", lift: 0.3 },
  orchard:  { tags: ["landuse=orchard", "landuse=vineyard"],  color: "#6b8a3d", lift: 0.4 },
  wood:     { tags: ["natural=wood", "natural=tree_row"],     color: "#3d5a2a", lift: 0.4 },
  scrub:    { tags: ["natural=scrub", "natural=heath", "natural=grassland"], color: "#9aa365", lift: 0.3 },
  wetland:  { tags: ["natural=wetland"], color: "#5a7a4a", lift: 0.2 },
  beach:    { tags: ["natural=beach", "natural=sand"], color: "#d8c896", lift: 0.2 },
  cemetery: { tags: ["landuse=cemetery"], color: "#8a8a78", lift: 0.3 },
};

const TAG_TO_CAT = (() => {
  const m = new Map();
  for (const [cat, p] of Object.entries(CATEGORIES)) {
    for (const t of p.tags) m.set(t, cat);
  }
  return m;
})();

function categoryOfElement(tags) {
  if (!tags) return null;
  for (const k of ["landuse", "natural", "leisure"]) {
    const v = tags[k];
    if (v) {
      const cat = TAG_TO_CAT.get(k + "=" + v);
      if (cat) return cat;
    }
  }
  return null;
}

function buildElevatedPolygon(points, lift) {
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
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

function buildChunkMeshes(elements) {
  const buckets = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, []]));
  for (const el of elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 4) continue;
    const cat = categoryOfElement(el.tags);
    if (!cat) continue;
    const pts = el.geometry.map((g) => llToWorld(g.lat, g.lon));
    try {
      const geo = buildElevatedPolygon(pts, CATEGORIES[cat].lift);
      if (geo) buckets[cat].push(geo);
    } catch { /* malformed */ }
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

export default function OSMVegetationStreamed({
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
        color: p.color, roughness: 0.95, metalness: 0,
        side: THREE.DoubleSide, polygonOffset: true,
        polygonOffsetFactor: -2, polygonOffsetUnits: -4,
        transparent: true, opacity: 0.85,
      });
    }
    return out;
  }, []);

  useEffect(() => {
    fetch("/osm/vegetation/12/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m) return;
        m.tileSet = new Set(m.tiles.map((t) => t.tx + "_" + t.ty));
        setManifest(m);
      })
      .catch((err) => console.error("OSMVegetationStreamed manifest:", err));
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
      const res = await fetch(`/osm/vegetation/12/${tx}/${ty}.json`);
      if (!res.ok) return;
      const data = await res.json();
      const merged = buildChunkMeshes(data.elements);
      setChunks((prev) => {
        const next = new Map(prev);
        next.set(key, merged);
        return next;
      });
    } catch (e) {
      console.warn(`OSMVegetationStreamed: chunk ${key} failed`, e);
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
              renderOrder={5}
              frustumCulled={false}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
