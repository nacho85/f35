"use client";

// Streaming terrain z17: divide el mundo en chunks de N×N tiles y carga/
// descarga dinámicamente según la posición de la cámara. Cubre detalle
// AAA-style (~1m/px) en una zona móvil alrededor del jugador, sin saturar
// memoria.
//
// Fase 1: load reactivo (sin predicción), sin LOD por altura.
//   - chunkSize tiles z17 × chunkSize tiles → 1 mesh por chunk
//   - activeRadius chunks alrededor de la cámara
//   - Cache via getCachedCanvas (IndexedDB ya existe)
//   - Elevación per-vertex desde el sharedHeightmap (fine + outer fallback)

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { fetchSatelliteCanvas } from "./terrainTiles";
import { getCachedCanvas, putCachedCanvas } from "./terrainCache";
import { isHeightmapReady, getElevationAtWorldXZ } from "./sharedHeightmap";
import { initChunkGeometryPool, buildChunkGeometry } from "./chunkGeometryPool";
import { worldToLatLon } from "./osmProjection";
import { TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON, WT_AIRPORT_WORLD_SIZE } from "./terrainScale";
import { getSharedCoastlineSDF } from "./coastlineSDFTexture";

// Mismo COASTLINE_MASK_WORLD_SIZE que OrmuzTerrain.
const COASTLINE_MASK_WORLD_SIZE = 400000;

// Water-discard via shader injection (mismo patrón que OrmuzTerrain.applyWaterDiscard
// con blur=true). Descarta pixeles de agua del satelital → FFT debajo se ve.
function applyWaterDiscard(material) {
  const sharedRef = getSharedCoastlineSDF();
  material.userData.uCoastMask = sharedRef;
  material.userData.uCoastMaskSz = { value: COASTLINE_MASK_WORLD_SIZE };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCoastMask = material.userData.uCoastMask;
    shader.uniforms.uCoastMaskSz = material.userData.uCoastMaskSz;

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `
        #include <common>
        varying vec3 vWorldPos_wd;
      `)
      .replace("#include <project_vertex>", `
        #include <project_vertex>
        vWorldPos_wd = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `
        #include <common>
        varying vec3 vWorldPos_wd;
        uniform sampler2D uCoastMask;
        uniform float     uCoastMaskSz;
      `)
      .replace("#include <map_fragment>", `
        #include <map_fragment>
        {
          vec2 _maskUv = vec2(
            0.5 + vWorldPos_wd.x / uCoastMaskSz,
            0.5 - vWorldPos_wd.z / uCoastMaskSz
          );
          bool _insideMask = (_maskUv.x >= 0.0 && _maskUv.x <= 1.0 &&
                              _maskUv.y >= 0.0 && _maskUv.y <= 1.0);
          if (_insideMask) {
            const float _MA = 1.25e-4;
            float _c0  = texture2D(uCoastMask, _maskUv).r;
            float _n0  = texture2D(uCoastMask, _maskUv + vec2(0.0,  _MA)).r;
            float _s0  = texture2D(uCoastMask, _maskUv + vec2(0.0, -_MA)).r;
            float _e0  = texture2D(uCoastMask, _maskUv + vec2( _MA, 0.0)).r;
            float _w0  = texture2D(uCoastMask, _maskUv + vec2(-_MA, 0.0)).r;
            float _ne0 = texture2D(uCoastMask, _maskUv + vec2( _MA,  _MA)).r;
            float _nw0 = texture2D(uCoastMask, _maskUv + vec2(-_MA,  _MA)).r;
            float _se0 = texture2D(uCoastMask, _maskUv + vec2( _MA, -_MA)).r;
            float _sw0 = texture2D(uCoastMask, _maskUv + vec2(-_MA, -_MA)).r;
            float _sdf = _c0 * 0.25
                       + (_n0 + _s0 + _e0 + _w0) * 0.125
                       + (_ne0 + _nw0 + _se0 + _sw0) * 0.0625;
            if (_sdf > 0.500) discard;
            // Fade alpha en el borde del agua para alpha-blend suave con FFT
            float _coastFade = 1.0 - smoothstep(0.460, 0.495, _sdf);
            diffuseColor.a *= _coastFade;
            if (diffuseColor.a < 0.01) discard;
          }
        }
      `);
  };
  material.customProgramCacheKey = () => "streamingWaterDiscard_v2";
  material.transparent = true;
  material.depthWrite = false;
  material.needsUpdate = true;
}

const ZOOM = 17;
const EARTH = 40075016.686;
const COS_L = Math.cos((TERRAIN_CENTER_LAT * Math.PI) / 180);
const MPT_Z17 = (EARTH * COS_L) / Math.pow(2, ZOOM); // meters per tile at L_center

const CACHE_VERSION = "stream_v4_lod"; // LOD por banda de distancia (cache key incluye downsample)

// Banda de LOD según distancia chebyshev (max(|dx|,|dy|)) en chunks desde cámara.
// Más cerca = más resolución. Lejos = downsample agresivo (16× menos data).
function lodForChebyshev(d) {
  if (d <= 2) return 2; // 5×5 chunks alrededor → 1024² (mejor calidad cerca)
  return 4;             // resto → 512²
}

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}
function latToTileY(lat, z) {
  const latRad = (lat * Math.PI) / 180;
  const m = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.floor(((1 - m / Math.PI) / 2) * Math.pow(2, z));
}
function tileXToLon(tx, z) {
  return (tx / Math.pow(2, z)) * 360 - 180;
}
function tileYToLat(ty, z) {
  const n = Math.PI - (2 * Math.PI * ty) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// Convierte un chunk index → world center XZ + size.
function chunkBounds(chunkX, chunkY, chunkSize) {
  // Tile range: [chunkX*chunkSize, (chunkX+1)*chunkSize)
  const tx0 = chunkX * chunkSize;
  const ty0 = chunkY * chunkSize;
  // Center lat/lon
  const lonCenter = tileXToLon(tx0 + chunkSize / 2, ZOOM);
  const latCenter = tileYToLat(ty0 + chunkSize / 2, ZOOM);
  // Para world coords, usamos el llToWorld Mercator-aware compartido.
  // Como worldToLatLon es la inversa, podemos usar llToWorld directo. Pero
  // como el parámetro es el centro del chunk, importamos aparte:
  return { latCenter, lonCenter, tx0, ty0 };
}

export default function StreamingTerrain({
  token,
  chunkSize = 8,        // tiles z17 por lado (8 × 272m = 2.2km cuadrado)
  activeRadius = 1,     // chunks alrededor de la cámara (3×3 = 9 chunks)
  updateIntervalMs = 500,
  yOffset = 0.5,        // lift sobre el inner14/outer
  maxConcurrent = 2,    // max chunks loading en paralelo
  predictSec = 4,       // segundos a futuro para prefetch direccional
  predictRadius = 2,    // chunks alrededor del punto futuro a prefetcear
}) {
  const { gl } = useThree();
  const [chunks, setChunks] = useState(new Map()); // key="cx_cy" → { mesh, satTex, geo }
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;
  const lastUpdate = useRef(0);
  const inFlight = useRef(new Set()); // chunks loading right now
  const lodInFlight = useRef(new Set()); // chunks doing lod upgrade right now (key = "cx_cy_lodN")
  const geoPoolReady = useRef(false);    // gate hasta que el pool de geometría haya init'd
  const expiry = useRef(new Map());      // key → tNow cuando deja de estar needed (hysteresis)
  const disposeQueue = useRef([]);       // chunks pendientes de dispose, spread N por frame
  // Velocity tracking — usamos diff de la cámara entre updates consecutivos
  // para extrapolar dónde va a estar en N segundos.
  const lastCamPos = useRef(null); // { x, z, t }

  // Build geometry per chunk — geometría se computa en worker pool, montaje
  // de BufferGeometry + material en main thread (cheap).
  const buildChunkMesh = async (chunkX, chunkY, satTex) => {
    const tx0 = chunkX * chunkSize;
    const ty0 = chunkY * chunkSize;
    const lonCenter = tileXToLon(tx0 + chunkSize / 2, ZOOM);
    const latCenter = tileYToLat(ty0 + chunkSize / 2, ZOOM);
    const L_RAD_C = (TERRAIN_CENTER_LAT * Math.PI) / 180;
    const Y_MERC_REF = Math.log(Math.tan(Math.PI / 4 + L_RAD_C / 2));
    const M_PER_LON = (EARTH * COS_L) / 360;
    const MERC_SCALE = (EARTH * COS_L) / (2 * Math.PI);
    const yMerc = Math.log(Math.tan(Math.PI / 4 + (latCenter * Math.PI) / 180 / 2));
    const wx = (lonCenter - 56.378) * M_PER_LON; // TERRAIN_CENTER_LON, hardcoded for speed
    const wz = (Y_MERC_REF - yMerc) * MERC_SCALE;
    const worldSize = chunkSize * MPT_Z17;
    const segs = chunkSize * 6; // ~45m por vértice — matchea heightmap z14 source

    // Worker computa positions + normals + uvs + indices con sample del heightmap
    const { positions, normals, uvs, indices } = await buildChunkGeometry({
      wx, wz, worldSize, segs, yOffset,
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeBoundingSphere(); // necesario para frustumCulled=true

    const mat = new THREE.MeshStandardMaterial({
      map: satTex,
      roughness: 0.95,
      metalness: 0,
    });
    applyWaterDiscard(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(wx, 0, wz);
    mesh.renderOrder = 2; // sobre inner14 (default 0) y outer (-1)
    mesh.frustumCulled = true;
    return { mesh, satTex, geo, mat };
  };

  // Helper: stitch + upload + return texture para una resolución (lod) dada.
  const buildSatTexture = async (chunkX, chunkY, lod) => {
    const cacheKey = `${CACHE_VERSION}_${chunkX}_${chunkY}_${chunkSize}_lod${lod}`;
    let canvas = await getCachedCanvas(cacheKey);
    if (!canvas) {
      const tx0 = chunkX * chunkSize;
      const ty0 = chunkY * chunkSize;
      const lonCenter = tileXToLon(tx0 + chunkSize / 2, ZOOM);
      const latCenter = tileYToLat(ty0 + chunkSize / 2, ZOOM);
      canvas = await fetchSatelliteCanvas({
        token,
        lat: latCenter,
        lon: lonCenter,
        zoom: ZOOM,
        gridSize: chunkSize,
        downsample: lod,
      });
      putCachedCanvas(cacheKey, canvas);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    gl.initTexture(tex);
    return tex;
  };

  // Upgrade/downgrade un chunk ya cargado a otro LOD.
  const upgradeChunk = async (chunkX, chunkY, newLod) => {
    const key = `${chunkX}_${chunkY}`;
    const lodKey = `${key}_lod${newLod}`;
    if (lodInFlight.current.has(lodKey)) return;
    const current = chunksRef.current.get(key);
    if (!current || current.lod === newLod) return;
    lodInFlight.current.add(lodKey);
    try {
      const newTex = await buildSatTexture(chunkX, chunkY, newLod);
      const data = chunksRef.current.get(key);
      if (!data) { newTex.dispose(); return; } // chunk fue descargado mientras tanto
      const oldTex = data.satTex;
      data.mat.map = newTex;
      data.mat.needsUpdate = true;
      data.satTex = newTex;
      data.lod = newLod;
      oldTex.dispose();
    } catch (e) {
      console.warn(`StreamingTerrain: chunk ${key} lod${newLod} upgrade failed`, e);
    } finally {
      lodInFlight.current.delete(lodKey);
    }
  };

  // Load 1 chunk async (carga inicial — siempre arranca al lod indicado).
  const loadChunk = async (chunkX, chunkY, lod = 4) => {
    const key = `${chunkX}_${chunkY}`;
    if (inFlight.current.has(key)) return;
    if (chunksRef.current.has(key)) return;
    inFlight.current.add(key);
    try {
      const satTex = await buildSatTexture(chunkX, chunkY, lod);
      const chunkData = await buildChunkMesh(chunkX, chunkY, satTex);
      chunkData.lod = lod;
      // Fade-in: arranca invisible y se hace opaco en FADE_MS. El inner14 de
      // fondo queda visible debajo durante el cross-fade — transición natural
      // de baja-res a alta-res sin "pop".
      chunkData.appearAt = performance.now();
      chunkData.mat.opacity = 0;
      // Re-check still needed (camera may have moved).
      setChunks((prev) => {
        const next = new Map(prev);
        next.set(key, chunkData);
        return next;
      });
    } catch (e) {
      console.warn(`StreamingTerrain: chunk ${key} load failed`, e);
    } finally {
      inFlight.current.delete(key);
    }
  };

  const unloadChunk = (key, data) => {
    data.mesh.geometry.dispose();
    data.mat.dispose();
    data.satTex.dispose();
  };

  useFrame(({ camera, clock }) => {
    if (!isHeightmapReady()) return;
    if (!geoPoolReady.current) {
      initChunkGeometryPool().then(() => { geoPoolReady.current = true; }).catch(() => {});
      return;
    }
    // Fade-in tick: corre TODOS los frames (no gateado por updateIntervalMs)
    // para que la animación sea suave aunque updateIntervalMs sea alto.
    const tNowFade = performance.now();
    const FADE_MS = 500;
    for (const [, data] of chunksRef.current) {
      if (data.appearAt === undefined) continue;
      const age = tNowFade - data.appearAt;
      if (age >= FADE_MS) {
        if (data.mat.opacity !== 1) data.mat.opacity = 1;
        delete data.appearAt; // termina el tracking
      } else {
        data.mat.opacity = age / FADE_MS;
      }
    }
    const tNow = clock.elapsedTime * 1000;
    if (tNow - lastUpdate.current < updateIntervalMs) return;
    lastUpdate.current = tNow;

    // Cámara world → lat/lon → tile → chunk
    const camX = camera.position.x, camZ = camera.position.z;
    const [camLat, camLon] = worldToLatLon(camX, camZ);
    const camTileX = lonToTileX(camLon, ZOOM);
    const camTileY = latToTileY(camLat, ZOOM);
    const ccx = Math.floor(camTileX / chunkSize);
    const ccy = Math.floor(camTileY / chunkSize);

    // Velocity = (current - last) / dt. Solo válido si tenemos last reciente.
    let predictedCcx = ccx, predictedCcy = ccy, hasPrediction = false;
    if (lastCamPos.current) {
      const dt = (tNow - lastCamPos.current.t) / 1000; // sec
      if (dt > 0 && dt < 2) {
        const vx = (camX - lastCamPos.current.x) / dt;
        const vz = (camZ - lastCamPos.current.z) / dt;
        const speed = Math.hypot(vx, vz);
        // Solo predecir si el avión va a velocidad significativa (>30 m/s ≈ 110 km/h)
        if (speed > 30) {
          const futureX = camX + vx * predictSec;
          const futureZ = camZ + vz * predictSec;
          const [fLat, fLon] = worldToLatLon(futureX, futureZ);
          const fTileX = lonToTileX(fLon, ZOOM);
          const fTileY = latToTileY(fLat, ZOOM);
          predictedCcx = Math.floor(fTileX / chunkSize);
          predictedCcy = Math.floor(fTileY / chunkSize);
          hasPrediction = (predictedCcx !== ccx || predictedCcy !== ccy);
        }
      }
    }
    lastCamPos.current = { x: camX, z: camZ, t: tNow };

    // Skip chunks que caen dentro del airport patch (z17 nativo del
    // OrmuzTerrain, posicionado snap-based — no matchea perfecto con
    // streaming Mercator → causaba ghost / breaks visuales en runways).
    const apCenterTx = lonToTileX(TERRAIN_CENTER_LON, ZOOM);
    const apCenterTy = latToTileY(TERRAIN_CENTER_LAT, ZOOM);
    const apHalfTiles = Math.ceil(WT_AIRPORT_WORLD_SIZE / MPT_Z17 / 2);

    const isInsideAirport = (cx, cy) => {
      const tx0 = cx * chunkSize, ty0 = cy * chunkSize;
      const tx1 = tx0 + chunkSize - 1, ty1 = ty0 + chunkSize - 1;
      return tx0 >= apCenterTx - apHalfTiles && tx1 <= apCenterTx + apHalfTiles &&
             ty0 >= apCenterTy - apHalfTiles && ty1 <= apCenterTy + apHalfTiles;
    };

    // Active set: chunks alrededor de la cámara actual.
    const needed = new Set();
    for (let dy = -activeRadius; dy <= activeRadius; dy++) {
      for (let dx = -activeRadius; dx <= activeRadius; dx++) {
        const cx = ccx + dx, cy = ccy + dy;
        if (isInsideAirport(cx, cy)) continue;
        needed.add(`${cx}_${cy}`);
      }
    }
    // Predictive prefetch: chunks alrededor del punto futuro proyectado.
    if (hasPrediction) {
      for (let dy = -predictRadius; dy <= predictRadius; dy++) {
        for (let dx = -predictRadius; dx <= predictRadius; dx++) {
          const cx = predictedCcx + dx, cy = predictedCcy + dy;
          if (isInsideAirport(cx, cy)) continue;
          needed.add(`${cx}_${cy}`);
        }
      }
    }

    // Compute target LOD per chunk (distancia chebyshev a cámara actual).
    // Para chunks que solo están en el predict set → siempre lod=4 (lejos por def).
    const lodFor = (cx, cy) => {
      const d = Math.max(Math.abs(cx - ccx), Math.abs(cy - ccy));
      return lodForChebyshev(d);
    };

    // Load missing — concurrency-limited.
    if (inFlight.current.size < maxConcurrent) {
      // Priorizar: 1) chunks cerca de cámara actual, 2) chunks cerca del punto futuro.
      const candidates = [];
      for (const key of needed) {
        if (!chunksRef.current.has(key) && !inFlight.current.has(key)) {
          const [cx, cy] = key.split("_").map(Number);
          // Distancia mínima a current OR future (lo que esté más cerca → prioridad)
          const dCurrent = (cx - ccx) ** 2 + (cy - ccy) ** 2;
          const dFuture = hasPrediction
            ? (cx - predictedCcx) ** 2 + (cy - predictedCcy) ** 2
            : Infinity;
          // Current chunks tienen prioridad absoluta sobre future (penalty para futuro)
          const score = Math.min(dCurrent, dFuture + 1000);
          candidates.push({ cx, cy, score });
        }
      }
      candidates.sort((a, b) => a.score - b.score);
      const slots = maxConcurrent - inFlight.current.size;
      for (let i = 0; i < Math.min(slots, candidates.length); i++) {
        const { cx, cy } = candidates[i];
        loadChunk(cx, cy, lodFor(cx, cy));
      }
    }

    // LOD upgrade/downgrade: para chunks YA cargados, si su distancia bajó (= ahora está
    // más cerca y necesita más resolución) re-stitchear async. Limitamos a 1 upgrade por
    // tick para no saturar el pool de workers ni inundar la GPU.
    if (lodInFlight.current.size === 0) {
      let bestKey = null, bestData = null, bestPriority = Infinity;
      for (const [key, data] of chunksRef.current) {
        const [cx, cy] = key.split("_").map(Number);
        const targetLod = lodFor(cx, cy);
        if (targetLod === data.lod) continue;
        // Priorizar: 1) upgrades (lod menor = mejor) sobre downgrades, 2) más cerca primero
        const isUpgrade = targetLod < data.lod;
        const dist = Math.max(Math.abs(cx - ccx), Math.abs(cy - ccy));
        const priority = (isUpgrade ? 0 : 1000) + dist;
        if (priority < bestPriority) {
          bestPriority = priority;
          bestKey = key;
          bestData = { cx, cy, targetLod };
        }
      }
      if (bestKey && bestData) {
        upgradeChunk(bestData.cx, bestData.cy, bestData.targetLod);
      }
    }

    // Hysteresis + async unload:
    // 1) Si un chunk salió del needed set, marcamos expiresAt = tNow + GRACE.
    //    Si vuelve a entrar antes, cancelamos.
    // 2) Si ya pasó la grace y sigue fuera, lo movemos a disposeQueue.
    // 3) DisposeQueue procesa hasta DISPOSE_PER_FRAME items por tick — evita
    //    el hitch de N llamadas a gl.deleteTexture/Buffer cuando girás 180°.
    const GRACE_MS = 4000;            // chunk vive 4s después de salir del radio
    const DISPOSE_PER_FRAME = 2;
    let queuedForDispose = 0;
    setChunks((prev) => {
      let mutated = false;
      const next = new Map(prev);
      for (const [key, data] of next) {
        if (needed.has(key)) {
          expiry.current.delete(key);
          continue;
        }
        const expAt = expiry.current.get(key);
        if (expAt === undefined) {
          expiry.current.set(key, tNow + GRACE_MS);
        } else if (tNow >= expAt) {
          disposeQueue.current.push({ key, data });
          expiry.current.delete(key);
          next.delete(key);
          queuedForDispose++;
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });

    // Procesar la cola de dispose (max DISPOSE_PER_FRAME por tick)
    let disposed = 0;
    while (disposeQueue.current.length > 0 && disposed < DISPOSE_PER_FRAME) {
      const { key, data } = disposeQueue.current.shift();
      unloadChunk(key, data);
      disposed++;
    }
    if (queuedForDispose > 0) {
      console.log(`StreamingTerrain: queued ${queuedForDispose} for dispose (queue=${disposeQueue.current.length}, active=${chunksRef.current.size})`);
    }
  });

  // Cleanup on unmount — drain dispose queue + active chunks
  useEffect(() => {
    return () => {
      for (const { data } of disposeQueue.current) unloadChunk(null, data);
      disposeQueue.current.length = 0;
      for (const [, data] of chunksRef.current) unloadChunk(null, data);
      expiry.current.clear();
    };
  }, []);

  return (
    <group>
      {[...chunks.entries()].map(([key, data]) => (
        <primitive key={key} object={data.mesh} />
      ))}
    </group>
  );
}
