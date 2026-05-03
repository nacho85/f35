// Airport satellite canvas compartido — OrmuzTerrain lo registra después de
// fetcharlo, OSMTrees lo escanea para detectar árboles.

let _ac = null; // { canvas, w, h, worldSize, centerX, centerZ, data: Uint8ClampedArray }

export function setSharedAirportCanvas({ canvas, worldSize, centerX, centerZ }) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  _ac = {
    w: canvas.width,
    h: canvas.height,
    worldSize,
    centerX,
    centerZ,
    data: img.data,
  };
}

export function isAirportCanvasReady() {
  return _ac !== null;
}

export function getAirportCanvasInfo() {
  return _ac;
}

// World (x, z) → pixel (px, py). Devuelve null si fuera del canvas.
export function worldToPixel(x, z) {
  if (!_ac) return null;
  const u = 0.5 + (x - _ac.centerX) / _ac.worldSize;
  const v = 0.5 + (z - _ac.centerZ) / _ac.worldSize;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return [Math.floor(u * _ac.w), Math.floor(v * _ac.h)];
}
