// Heightmap compartido — OrmuzTerrain registra fine (z13, ~140km, alta res)
// y outer (z10, ~1100km, baja res). getElevationAtWorldXZ trata fine primero;
// si está afuera, fallback al outer. Solo retorna 0 si está fuera de ambos.

let _hmFine = null;  // alta resolución, cobertura limitada (140km)
let _hmOuter = null; // baja resolución, cobertura amplia (1100km)

function makeHm(canvas, maxElev, minElev, worldSize, centerX, centerZ, yOffset = 0) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    w: canvas.width,
    h: canvas.height,
    range: maxElev,
    minElev,
    worldSize,
    centerX,
    centerZ,
    yOffset, // mesh.position.y para esta capa — sumarlo al sample
    data: img.data,
  };
}

export function setSharedHeightmap({ canvas, maxElev, minElev, worldSize, centerX, centerZ, yOffset = 0 }) {
  _hmFine = makeHm(canvas, maxElev, minElev, worldSize, centerX, centerZ, yOffset);
}

export function setSharedHeightmapOuter({ canvas, maxElev, minElev, worldSize, centerX, centerZ, yOffset = 0 }) {
  _hmOuter = makeHm(canvas, maxElev, minElev, worldSize, centerX, centerZ, yOffset);
}

export function isHeightmapReady() {
  return _hmFine !== null;
}

// Snapshot del heightmap apto para postMessage a un worker. Copia los Uint8 data
// (no transferable, sino main thread perdería el canvas data). Se llama una vez
// al inicializar el pool de workers.
export function getHeightmapSnapshot() {
  const snap = (hm) => hm ? {
    w: hm.w, h: hm.h, range: hm.range, minElev: hm.minElev,
    worldSize: hm.worldSize, centerX: hm.centerX, centerZ: hm.centerZ,
    yOffset: hm.yOffset,
    data: new Uint8Array(hm.data.buffer.slice(hm.data.byteOffset, hm.data.byteOffset + hm.data.byteLength)),
  } : null;
  return { fine: snap(_hmFine), outer: snap(_hmOuter) };
}

function sampleHm(hm, x, z) {
  const u = 0.5 + (x - hm.centerX) / hm.worldSize;
  const v = 0.5 + (z - hm.centerZ) / hm.worldSize;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const fx = u * (hm.w - 1);
  const fy = v * (hm.h - 1);
  const x0 = Math.floor(fx), x1 = Math.min(hm.w - 1, x0 + 1);
  const y0 = Math.floor(fy), y1 = Math.min(hm.h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const s = (px, py) => hm.data[(py * hm.w + px) * 4] / 255;
  const p00 = s(x0, y0), p10 = s(x1, y0), p01 = s(x0, y1), p11 = s(x1, y1);
  const v0 = p00 * (1 - tx) + p10 * tx;
  const v1 = p01 * (1 - tx) + p11 * tx;
  return (v0 * (1 - ty) + v1 * ty) * hm.range + hm.minElev + hm.yOffset;
}

// Sample con fallback. Fine es preferido (alta res); si fuera de fine,
// usa outer (baja res). 0 solo si ambos fallan.
export function getElevationAtWorldXZ(x, z) {
  if (_hmFine) {
    const e = sampleHm(_hmFine, x, z);
    if (e !== null) return e;
  }
  if (_hmOuter) {
    const e = sampleHm(_hmOuter, x, z);
    if (e !== null) return e;
  }
  return 0;
}
