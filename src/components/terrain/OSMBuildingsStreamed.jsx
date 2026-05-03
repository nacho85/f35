"use client";

// OSMBuildings versión streamed: carga buildings por chunk z12 según posición
// de la cámara. Un mesh por chunk (3 materials), añadido/removido del scene
// dinámicamente.
//
// Cada chunk z12 ~ 10km × 10km a lat 27. activeRadiusKm controla cuántos
// chunks alrededor de la cámara mantener cargados.

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

const DEFAULT_HEIGHT = {
  yes: 6, house: 5, apartments: 14, residential: 8, commercial: 12,
  industrial: 9, shed: 4, terrace: 5, hangar: 12, hotel: 18, mosque: 16,
  school: 10, hospital: 14, warehouse: 9, garage: 3, retail: 8, office: 20,
  public: 12,
};
function materialCategory(t) {
  if (t === "industrial" || t === "warehouse" || t === "hangar" || t === "shed" || t === "garage") return "industrial";
  if (t === "commercial" || t === "retail" || t === "office" || t === "hotel" || t === "public") return "commercial";
  return "residential";
}
function resolveHeight(tags) {
  if (tags.height) {
    const h = parseFloat(tags.height);
    if (!isNaN(h) && h > 0) return h;
  }
  if (tags["building:levels"]) {
    const l = parseFloat(tags["building:levels"]);
    if (!isNaN(l) && l > 0) return l * 3.0;
  }
  return DEFAULT_HEIGHT[tags.building] ?? 6;
}
function buildExtrudeGeometry(points, height) {
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

// Procesa los elements de un chunk → 3 BufferGeometries mergeados (uno por
// material category) + lista de materiales.
function buildChunkMeshes(elements) {
  const buckets = { residential: [], commercial: [], industrial: [] };
  for (const el of elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 3) continue;
    const tags = el.tags || {};
    if (!tags.building) continue;
    const pts = el.geometry.map((g) => llToWorld(g.lat, g.lon));
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const h = resolveHeight(tags);
    const geo = buildExtrudeGeometry(pts, h);
    if (!geo) continue;
    const elev = getElevationAtWorldXZ(cx, cz) + 5.0;
    geo.translate(0, elev, 0);
    buckets[materialCategory(tags.building)].push(geo);
  }
  const merged = {};
  for (const cat of Object.keys(buckets)) {
    if (!buckets[cat].length) { merged[cat] = null; continue; }
    try {
      merged[cat] = mergeGeometries(buckets[cat], false);
    } catch (e) {
      merged[cat] = null;
    }
    buckets[cat].forEach((g) => g.dispose());
  }
  return merged;
}

const MATERIALS = {
  residential: { color: "#c8b89a", roughness: 0.85, metalness: 0 },
  commercial:  { color: "#a0a8b0", roughness: 0.7,  metalness: 0.1 },
  industrial:  { color: "#8a8478", roughness: 0.9,  metalness: 0.05 },
};

export default function OSMBuildingsStreamed({
  y = 0,
  activeRadiusKm = 15,
  updateIntervalMs = 500,
  maxConcurrent = 3,
}) {
  const [manifest, setManifest] = useState(null);
  const [hmReady, setHmReady] = useState(isHeightmapReady());
  const [chunks, setChunks] = useState(new Map()); // "tx_ty" → { residential, commercial, industrial } geometries
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;
  const inFlight = useRef(new Set());
  const lastUpdate = useRef(0);

  // Compartir materials entre todos los meshes (una instancia por categoría).
  const sharedMaterials = useMemo(() => {
    const out = {};
    for (const [cat, p] of Object.entries(MATERIALS)) {
      out[cat] = new THREE.MeshStandardMaterial(p);
    }
    return out;
  }, []);

  useEffect(() => {
    fetch("/osm/buildings/12/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m) return;
        // Set para lookup O(1) de tiles existentes.
        m.tileSet = new Set(m.tiles.map((t) => t.tx + "_" + t.ty));
        setManifest(m);
      })
      .catch((err) => console.error("OSMBuildingsStreamed manifest:", err));
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
      const res = await fetch(`/osm/buildings/12/${tx}/${ty}.json`);
      if (!res.ok) return;
      const data = await res.json();
      const merged = buildChunkMeshes(data.elements);
      setChunks((prev) => {
        const next = new Map(prev);
        next.set(key, merged);
        return next;
      });
    } catch (e) {
      console.warn(`OSMBuildingsStreamed: chunk ${key} failed`, e);
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

    // z12 tile a lat 27 ≈ 10km. Convertir radio km a radio en tiles.
    const radiusTiles = Math.max(1, Math.ceil(activeRadiusKm / 10));
    const needed = new Set();
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        const key = (ccx + dx) + "_" + (ccy + dy);
        if (manifest.tileSet.has(key)) needed.add(key);
      }
    }

    // Load missing — concurrency-limited, sorted by distance.
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

    // Unload distant
    let unloaded = 0;
    setChunks((prev) => {
      let mutated = false;
      const next = new Map(prev);
      for (const [key, data] of next) {
        if (!needed.has(key)) {
          unloadChunk(key, data);
          next.delete(key);
          unloaded++;
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
          {Object.keys(MATERIALS).map((cat) => data[cat] && (
            <mesh
              key={cat}
              geometry={data[cat]}
              material={sharedMaterials[cat]}
              castShadow
              receiveShadow
              frustumCulled={false}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
