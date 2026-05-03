"use client";

import * as THREE from "three";
import { TILE_PX } from "./terrainScale";
import { stitchInWorker, stitchSupported } from "./tileStitchPool";

function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat, zoom) {
  const latRad = THREE.MathUtils.degToRad(lat);
  const m = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.floor(((1 - m / Math.PI) / 2) * 2 ** zoom);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Tile failed: ${url}`));
    img.src = url;
  });
}

// Water-tile manifest. Los tiles agua no se descargan ni del cache local ni de
// Mapbox — se rellenan con un color uniforme sampleado de tiles costeros
// reales (matchea tonalmente con la imagen de Mapbox alrededor). Carga lazy.
//
// Además del set de agua, computamos el "coastal set" = tiles agua con al
// menos un vecino que NO es agua. Los z17 hijos de un z15 NO-coastal (= deep
// water) no existen en disco — no tiene sentido pedirlos.
const _waterManifests = new Map(); // zoom → Promise<{ set, coastal, color } | null>
const FALLBACK_WATER_FILL = "#3a5878";
const AVAILABLE_WATER_MANIFESTS = new Set([15]);
function loadWaterManifest(zoom) {
  if (_waterManifests.has(zoom)) return _waterManifests.get(zoom);
  if (!AVAILABLE_WATER_MANIFESTS.has(zoom)) {
    const p = Promise.resolve(null);
    _waterManifests.set(zoom, p);
    return p;
  }
  const p = fetch(`/water-manifest-z${zoom}.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j) return null;
      const set = new Set(j.water);
      // Compute coastal set: water tiles con al menos un vecino NO water.
      const coastal = new Set();
      for (const k of set) {
        const [tx, ty] = k.split(",").map(Number);
        let hasLand = false;
        for (let dy = -1; dy <= 1 && !hasLand; dy++) {
          for (let dx = -1; dx <= 1 && !hasLand; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (!set.has((tx + dx) + "," + (ty + dy))) hasLand = true;
          }
        }
        if (hasLand) coastal.add(k);
      }
      return { set, coastal, color: j.waterColor || FALLBACK_WATER_FILL };
    })
    .catch(() => null);
  _waterManifests.set(zoom, p);
  return p;
}

async function stitchTiles({ token, lat, lon, zoom, gridSize, kind, tileOffsetX = 0, tileOffsetY = 0, downsample = 1 }) {
  // tileOffsetX/Y desplazan el centro tile-coords desde el calculado por lat/lon.
  // Permite stitching de sub-meshes (e.g. 2×2 cuadrantes adyacentes) fetcheando
  // bloques de tiles que se tilean perfecto sin overlap ni gaps.
  // downsample: factor de reducción del canvas final (e.g. 4 → cada tile se
  // dibuja a 64×64 en vez de 256×256). Útil para reducir VRAM cuando hay
  // muchos sub-meshes (5×5 a 8192px = 6 GB GPU).
  const cx = lonToTileX(lon, zoom) + tileOffsetX;
  const cy = latToTileY(lat, zoom) + tileOffsetY;
  const half = Math.floor(gridSize / 2);
  const tilePx = Math.max(1, Math.round(TILE_PX / downsample));
  const px = tilePx * gridSize;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d", { willReadFrequently: kind === "terrain" });

  const isSat = kind === "satellite";
  const localExt = isSat ? "jpg" : "png";
  const dataset  = isSat ? "satellite" : "terrain-rgb";

  // Pre-fill toda la textura con el color de agua sampleado del manifest.
  // Los tiles que NO son agua se dibujan encima. Así, si un tile está en el
  // manifest agua, simplemente lo skipeamos sin fetch — el fill queda visible.
  // Para zooms > 15 (sin manifest propio), usamos parent z15 para el water-skip.
  const manifest = isSat ? await loadWaterManifest(zoom) : null;
  const waterSet = manifest?.set ?? null;
  // Parent water set: si el zoom es mayor que 15, cargamos el manifest z15
  // y consultamos por parent tile (x>>shift, y>>shift). Esto evita 404s en
  // streaming z17 sobre océano (no hay tiles locales — agua pura).
  let parentWaterSet = null, parentCoastalSet = null, parentShift = 0;
  if (isSat && zoom > 15) {
    const pManifest = await loadWaterManifest(15);
    if (pManifest) {
      parentWaterSet = pManifest.set;
      parentCoastalSet = pManifest.coastal;
      parentShift = zoom - 15;
      if (!manifest) {
        ctx.fillStyle = pManifest.color;
        ctx.fillRect(0, 0, px, px);
      }
    }
  }
  if (manifest) {
    ctx.fillStyle = manifest.color;
    ctx.fillRect(0, 0, px, px);
  }

  // Construir lista de tasks (URLs a fetchear). El skip-logic aplica acá:
  // tiles agua del zoom actual o cuyos parent z15 son deep-water no entran.
  const taskList = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = cx - half + col;
      const y = cy - half + row;
      if (waterSet && waterSet.has(`${x},${y}`)) continue; // tile agua del zoom actual — skip
      if (parentWaterSet) {
        const px15 = x >> parentShift;
        const py15 = y >> parentShift;
        const pKey = px15 + "," + py15;
        if (parentWaterSet.has(pKey)) {
          if (!parentCoastalSet.has(pKey)) continue; // deep water — sin disco, sin request
          // coastal: intentar tile local
        }
      }
      const localUrl = `/tiles/${dataset}/${zoom}/${x}/${y}.${localExt}`;
      taskList.push({ url: localUrl, col, row });
    }
  }

  // Path satellite con worker — fetch + decode + stitch off-thread, evita
  // hitches en el main thread cuando StreamingTerrain carga chunks nuevos.
  // El worker devuelve un ImageBitmap; lo dibujamos al canvas existente
  // (que ya tiene el waterColor de fondo) para mantener compat con cache
  // (toBlob) y CanvasTexture en los consumers.
  if (isSat && stitchSupported()) {
    try {
      const waterColor = manifest?.color || (parentWaterSet ? (await loadWaterManifest(15))?.color : null) || null;
      const bitmap = await stitchInWorker({
        tasks: taskList,
        gridSize,
        tilePx,
        waterColor,
      });
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      return canvas;
    } catch (e) {
      // Fallback al path de main thread si el worker falla
      console.warn("[stitchTiles] worker failed, fallback to main thread:", e);
    }
  }

  // Fallback: main thread (terrain RGB siempre, satellite si worker no soportado)
  const tasks = taskList.map(({ url, col, row }) =>
    loadImage(url)
      .then(img => ctx.drawImage(img, col * tilePx, row * tilePx, tilePx, tilePx))
      .catch(() => {})
  );
  await Promise.all(tasks);
  return canvas;
}

export async function fetchSatelliteCanvas(opts) {
  return stitchTiles({ ...opts, kind: "satellite" });
}

// Devuelve un canvas grayscale donde pixel value ∈ [0..1] · maxElevation = factor para
// reconstruir metros (displacementScale en MeshStandardMaterial).
// Carving: rectángulo plano (elev=0) sobre la pista para que no quede flotando.
export async function fetchHeightmapCanvas({
  token,
  lat,
  lon,
  zoom,
  gridSize,
  worldSize,
  runwayHalfWidth,
  runwayHalfLength,
  tileShiftX = 0,
  tileShiftY = 0,
  // UV (0..1) del aeropuerto en el canvas. Necesario porque con tileShift, el
  // centro del canvas NO es el aeropuerto. Default 0.5,0.5 (canvas no shifted).
  carveCenterU = 0.5,
  carveCenterV = 0.5,
}) {
  const rgb = await stitchTiles({ token, lat, lon, zoom, gridSize, kind: "terrain", tileOffsetX: tileShiftX, tileOffsetY: tileShiftY });
  const ctx = rgb.getContext("2d");
  const px = rgb.width;
  const src = ctx.getImageData(0, 0, px, px).data;

  const elev = new Float32Array(px * px);
  for (let i = 0; i < elev.length; i++) {
    const o = i * 4;
    // terrain-rgb: e = -10000 + ((R*256² + G*256 + B) * 0.1)
    let e = -10000 + (src[o] * 65536 + src[o + 1] * 256 + src[o + 2]) * 0.1;
    // Sanitización: pixels transparentes (RGB=0,0,0) decodifican a -10000m,
    // creando "cañones submarinos" al hacer displacement. Cualquier valor
    // claramente fuera del rango realista del Golfo Pérsico → 0 (sea level).
    if (e < -100) e = 0;
    elev[i] = e;
  }

  // Baseline = elevación de la pista. Restamos para que la pista quede a y=0.
  // Sample en el píxel del aeropuerto (carveCenterU/V), no en el centro del
  // canvas (que con tileShift puede ser otro lugar).
  const SEA_CUTOFF = 10;
  const baselineX = Math.max(0, Math.min(px - 1, Math.floor(carveCenterU * px)));
  const baselineY = Math.max(0, Math.min(px - 1, Math.floor(carveCenterV * px)));
  const baseline = elev[baselineY * px + baselineX];
  let minElev = 0, maxElev = 1;
  for (let i = 0; i < elev.length; i++) {
    const v = elev[i] - baseline;
    let out;
    if (v < -SEA_CUTOFF) {
      out = v;                    // mar profundo — bien por debajo del agua
    } else {
      out = Math.max(0, v);       // tierra — todo lo costero a 0+ (sobre el agua)
    }
    elev[i] = out;
    if (out > maxElev) maxElev = out;
    if (out < minElev) minElev = out;
  }

  // Carving de pista — centrado en (carveCenterU, carveCenterV) que es el
  // píxel del aeropuerto en el canvas (no necesariamente el centro). Aplana
  // un rectángulo + rampa suave alrededor.
  const CARVE_FADE_M = 250;
  const uHalf = runwayHalfWidth / worldSize;
  const vHalf = runwayHalfLength / worldSize;
  const fadeUv = CARVE_FADE_M / worldSize;
  const winU = uHalf + fadeUv;
  const winV = vHalf + fadeUv;
  const xMin = Math.max(0, Math.floor((carveCenterU - winU) * px));
  const xMax = Math.min(px, Math.ceil((carveCenterU + winU) * px));
  const yMin = Math.max(0, Math.floor((carveCenterV - winV) * px));
  const yMax = Math.min(px, Math.ceil((carveCenterV + winV) * px));
  for (let y = yMin; y < yMax; y++) {
    const v = y / px - carveCenterV;
    const dy = Math.max(0, Math.abs(v) - vHalf);
    for (let x = xMin; x < xMax; x++) {
      const u = x / px - carveCenterU;
      const dx = Math.max(0, Math.abs(u) - uHalf);
      const dist = Math.max(dx, dy);
      const idx = y * px + x;
      if (elev[idx] < -1.0) continue;
      if (dist === 0) {
        elev[idx] = 0;
      } else if (dist < fadeUv) {
        const t = dist / fadeUv;
        const fade = t * t * (3 - 2 * t);
        elev[idx] *= fade;
      }
    }
  }

  // Encode rango [minElev, maxElev] → grayscale [0, 1].
  // displacement final = bias + value * scale ⇒ bias=minElev, scale=range.
  const range = Math.max(1, maxElev - minElev);
  const out = document.createElement("canvas");
  out.width = out.height = px;
  const outCtx = out.getContext("2d");
  const dst = outCtx.createImageData(px, px);
  const data = dst.data;
  const invRange = 1 / range;
  for (let i = 0; i < elev.length; i++) {
    const norm = (elev[i] - minElev) * invRange;
    const v = Math.round(Math.max(0, Math.min(1, norm)) * 255);
    const o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = v;
    data[o + 3] = 255;
  }
  outCtx.putImageData(dst, 0, 0);

  // Para retro-compat dejamos `maxElevation` (escala total) y agregamos
  // displacementBias para que el mar quede en su altura real (negativa).
  return { canvas: out, maxElevation: range, displacementBias: minElev };
}
