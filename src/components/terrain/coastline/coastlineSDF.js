// Vector coastline SDF — runtime component.
//
// Carga los binarios pre-bakeados (segments + grid + indices) y construye
// 3 DataTextures que el shader puede sampler para computar distance EXACTA
// a la coastline polyline más cercana (resolución infinita).
//
// Uso:
//   const csdf = await loadCoastlineSDF();
//   // En tu material:
//   shader.uniforms.uCoastSegments = { value: csdf.segmentsTex };
//   shader.uniforms.uCoastSegmentsSize = { value: csdf.segmentsSize };
//   ... etc
//   // Inyectar GLSL_DECLARATIONS al inicio del fragment, GLSL_FUNCTION al
//   // final del header.
//   // Llamar coastlineDistance(worldXZ) en el shader → devuelve metros.

import * as THREE from "three";

const SEGMENTS_URL = "/textures/water/coastline-segments.bin";
const GRID_URL     = "/textures/water/coastline-grid.bin";
const INDICES_URL  = "/textures/water/coastline-indices.bin";
const META_URL     = "/textures/water/coastline-meta.json";

// Pack en texturas 2D (más portable que buffer textures). Width fijo, height
// se calcula. Float32 RGBA32F para segments (4 floats per segment), RG32F
// para grid (2 valores per cell), R32F para indices (1 valor per index).
const SEG_WIDTH = 512;
const IDX_WIDTH = 2048;

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return await res.arrayBuffer();
}

export async function loadCoastlineSDF() {
  const [segBuf, gridBuf, idxBuf, metaRes] = await Promise.all([
    fetchBuffer(SEGMENTS_URL),
    fetchBuffer(GRID_URL),
    fetchBuffer(INDICES_URL),
    fetch(META_URL).then(r => r.json()),
  ]);

  const meta = metaRes;
  const segArr  = new Float32Array(segBuf);
  const gridArr = new Uint32Array(gridBuf);
  const idxArr  = new Uint32Array(idxBuf);

  // segArr: [x1, z1, x2, z2, x1, z1, x2, z2, ...]  4 floats per segment.
  // Pack as RGBA32F texture, 1 segment per pixel.
  const numSegments = meta.numSegments;
  const segHeight = Math.ceil(numSegments / SEG_WIDTH);
  const segPadded = new Float32Array(SEG_WIDTH * segHeight * 4);
  segPadded.set(segArr);
  const segmentsTex = new THREE.DataTexture(
    segPadded, SEG_WIDTH, segHeight, THREE.RGBAFormat, THREE.FloatType,
  );
  segmentsTex.minFilter = THREE.NearestFilter;
  segmentsTex.magFilter = THREE.NearestFilter;
  segmentsTex.generateMipmaps = false;
  segmentsTex.needsUpdate = true;

  // gridArr: 2*RES_GRID² uint32 — convert to float for RG32F.
  // Pack as RGBA32F (only RG used) — más portable que RG32F en algunos drivers.
  const RG = meta.resGrid;
  const gridFloat = new Float32Array(RG * RG * 4);
  for (let i = 0; i < RG * RG; i++) {
    gridFloat[i * 4 + 0] = gridArr[i * 2 + 0]; // start
    gridFloat[i * 4 + 1] = gridArr[i * 2 + 1]; // count
    // .ba unused
  }
  const gridTex = new THREE.DataTexture(
    gridFloat, RG, RG, THREE.RGBAFormat, THREE.FloatType,
  );
  gridTex.minFilter = THREE.NearestFilter;
  gridTex.magFilter = THREE.NearestFilter;
  gridTex.generateMipmaps = false;
  gridTex.needsUpdate = true;

  // idxArr: flat list de uint32 segment indices.
  // Pack as RGBA32F (only R used) — width=2048, height=ceil(N/2048).
  const idxHeight = Math.ceil(idxArr.length / IDX_WIDTH);
  const idxFloat = new Float32Array(IDX_WIDTH * idxHeight * 4);
  for (let i = 0; i < idxArr.length; i++) {
    idxFloat[i * 4] = idxArr[i];
  }
  const indicesTex = new THREE.DataTexture(
    idxFloat, IDX_WIDTH, idxHeight, THREE.RGBAFormat, THREE.FloatType,
  );
  indicesTex.minFilter = THREE.NearestFilter;
  indicesTex.magFilter = THREE.NearestFilter;
  indicesTex.generateMipmaps = false;
  indicesTex.needsUpdate = true;

  return {
    segmentsTex,
    gridTex,
    indicesTex,
    segmentsSize: new THREE.Vector2(SEG_WIDTH, segHeight),
    indicesSize: new THREE.Vector2(IDX_WIDTH, idxHeight),
    gridRes: RG,
    worldHalfMeters: meta.worldHalfMeters,
    numSegments,
  };
}

// GLSL function. El shader cliente debe declarar estos uniforms y luego puede
// llamar coastlineDistance(worldXZ) → metros al coastline más cercano.
export const COASTLINE_GLSL_UNIFORMS = /* glsl */ `
  uniform sampler2D uCoastSegments;
  uniform vec2      uCoastSegmentsSize;
  uniform sampler2D uCoastGrid;
  uniform float     uCoastGridRes;
  uniform sampler2D uCoastIndices;
  uniform vec2      uCoastIndicesSize;
  uniform float     uCoastWorldHalf;
  uniform float     uCoastEnabled;
`;

export const COASTLINE_GLSL_FUNCTION = /* glsl */ `
  // Cap iteraciones por seguridad GPU. La mayoría de cells tienen <100, max ~3500
  // (areas urbanas densas como harbor de Bandar Abbas). Cap a 256 → casos
  // extremos pueden perder algún segmento lejano pero el más cercano siempre
  // está dentro de los primeros (no hay sort, pero stadísticamente OK).
  const float COASTLINE_MAX_ITER = 256.0;

  // Lookup texel (i, j) en una textura 2D dado un flat index y la size
  vec2 _coastFlatToUV(float flatIdx, vec2 texSize) {
    float row = floor(flatIdx / texSize.x);
    float col = flatIdx - row * texSize.x;
    return (vec2(col, row) + 0.5) / texSize;
  }

  float coastlineDistance(vec2 worldXZ) {
    if (uCoastEnabled < 0.5) return 1e6;
    vec2 cellNorm = (worldXZ + vec2(uCoastWorldHalf)) / (2.0 * uCoastWorldHalf);
    if (cellNorm.x < 0.0 || cellNorm.x >= 1.0 ||
        cellNorm.y < 0.0 || cellNorm.y >= 1.0) return 1e6;
    vec2 cellUv = (floor(cellNorm * uCoastGridRes) + 0.5) / uCoastGridRes;
    vec4 startCount = texture2D(uCoastGrid, cellUv);
    float startIdx = startCount.r;
    float count = startCount.g;
    if (count < 0.5) return 1e6;
    float maxIter = min(count, COASTLINE_MAX_ITER);
    float minDistSq = 1e12;
    for (float k = 0.0; k < COASTLINE_MAX_ITER; k += 1.0) {
      if (k >= maxIter) break;
      float flatIdx = startIdx + k;
      vec2 idxUV = _coastFlatToUV(flatIdx, uCoastIndicesSize);
      float segIdx = texture2D(uCoastIndices, idxUV).r;
      vec2 segUV = _coastFlatToUV(segIdx, uCoastSegmentsSize);
      vec4 seg = texture2D(uCoastSegments, segUV);
      vec2 a = seg.xy;
      vec2 b = seg.zw;
      vec2 ap = worldXZ - a;
      vec2 ab = b - a;
      float lenSq = max(dot(ab, ab), 1e-6);
      float t = clamp(dot(ap, ab) / lenSq, 0.0, 1.0);
      vec2 closest = a + t * ab;
      vec2 d = worldXZ - closest;
      float distSq = dot(d, d);
      minDistSq = min(minDistSq, distSq);
    }
    return sqrt(minDistSq);
  }

  // Versión SIGNED del coastline distance — sign computado del vector mismo
  // (OSM convention: sea a la DERECHA del way direction). Cross product
  // (b-a) × (p-a): negativo = derecha = water (signedDist > 0)
  // Sub-pixel precisión TANTO en magnitud como en sign.
  float coastlineSignedDistance(vec2 worldXZ) {
    if (uCoastEnabled < 0.5) return 1e6;
    vec2 cellNorm = (worldXZ + vec2(uCoastWorldHalf)) / (2.0 * uCoastWorldHalf);
    if (cellNorm.x < 0.0 || cellNorm.x >= 1.0 ||
        cellNorm.y < 0.0 || cellNorm.y >= 1.0) return 1e6;
    vec2 cellUv = (floor(cellNorm * uCoastGridRes) + 0.5) / uCoastGridRes;
    vec4 startCount = texture2D(uCoastGrid, cellUv);
    float startIdx = startCount.r;
    float count = startCount.g;
    if (count < 0.5) return 1e6;
    float maxIter = min(count, COASTLINE_MAX_ITER);
    float minDistSq = 1e12;
    float closestSign = 1.0;
    for (float k = 0.0; k < COASTLINE_MAX_ITER; k += 1.0) {
      if (k >= maxIter) break;
      float flatIdx = startIdx + k;
      vec2 idxUV = _coastFlatToUV(flatIdx, uCoastIndicesSize);
      float segIdx = texture2D(uCoastIndices, idxUV).r;
      vec2 segUV = _coastFlatToUV(segIdx, uCoastSegmentsSize);
      vec4 seg = texture2D(uCoastSegments, segUV);
      vec2 a = seg.xy;
      vec2 b = seg.zw;
      vec2 ap = worldXZ - a;
      vec2 ab = b - a;
      float lenSq = max(dot(ab, ab), 1e-6);
      float t = clamp(dot(ap, ab) / lenSq, 0.0, 1.0);
      vec2 closest = a + t * ab;
      vec2 d = worldXZ - closest;
      float distSq = dot(d, d);
      if (distSq < minDistSq) {
        minDistSq = distSq;
        // Cross product en el espacio del segmento original (no closest):
        // signo del cross indica de qué lado del polyline está el punto.
        // OSM: water a la DERECHA. cross negativo = derecha = +water.
        float c = ab.x * ap.y - ab.y * ap.x;
        closestSign = c < 0.0 ? 1.0 : -1.0;
      }
    }
    return closestSign * sqrt(minDistSq);
  }
`;
