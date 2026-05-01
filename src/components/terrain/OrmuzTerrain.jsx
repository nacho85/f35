"use client";

import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  TERRAIN_CENTER_LAT,
  TERRAIN_CENTER_LON,
  RUNWAY_CORRIDOR_HALF_LENGTH,
  RUNWAY_CORRIDOR_HALF_WIDTH,
  WT_OUTER_ZOOM,
  WT_OUTER_GRID_SIZE,
  WT_OUTER_WORLD_SIZE,
  WT_INNER14_ZOOM,
  WT_INNER14_GRID_SIZE,
  WT_INNER14_GRID_COUNT,
  WT_INNER14_TILE_SHIFT_X,
  WT_INNER14_TILE_SHIFT_Y,
  WT_INNER14_SUBMESH_SIZE,
  WT_INNER14_CENTER_X,
  WT_INNER14_CENTER_Z,
  WT_HEIGHT_FINE_ZOOM,
  WT_HEIGHT_FINE_GRID_SIZE,
  WT_HEIGHT_FINE_WORLD_SIZE,
  WT_HEIGHT_FINE_TILE_SHIFT_Y,
  WT_HEIGHT_FINE_CENTER_X,
  WT_HEIGHT_FINE_CENTER_Z,
  WT_AIRPORT_ZOOM,
  WT_AIRPORT_GRID_SIZE,
  WT_AIRPORT_WORLD_SIZE,
  WT_MESH_SEGMENTS,
} from "./terrainScale";
import { fetchHeightmapCanvas, fetchSatelliteCanvas } from "./terrainTiles";
import { getCachedCanvas, putCachedCanvas } from "./terrainCache";
import { getSharedCoastlineSDF } from "./coastlineSDFTexture";

// Bump si cambia el pipeline de stitching, water manifest, o tile data.
// Invalida todas las entradas de IndexedDB con esta versión vieja.
const CACHE_VERSION = "v28"; // v28: water-discard reactivado, OceanWater con Gerstner

// Sub-grid 4× finer que los tiles para mean grid de agua.
const WATER_SUB = 4;

// Calcula el mean RGB de pixeles de agua por celda de un sub-grid de
// tilesPerSide*WATER_SUB × tilesPerSide*WATER_SUB. Devuelve también la lista
// de celdas válidas (con n > 50 samples de agua).
function computeWaterMeanGrid(canvas, tilesPerSide) {
  const cells = tilesPerSide * WATER_SUB;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const cellPx = w / cells;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const meanR = new Float32Array(cells * cells);
  const meanG = new Float32Array(cells * cells);
  const meanB = new Float32Array(cells * cells);
  const valid = new Uint8Array(cells * cells);
  let totalN = 0;
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      let sR = 0, sG = 0, sB = 0, n = 0;
      const y0 = Math.floor(row * cellPx);
      const y1 = Math.floor((row + 1) * cellPx);
      const x0 = Math.floor(col * cellPx);
      const x1 = Math.floor((col + 1) * cellPx);
      for (let y = y0; y < y1; y += 4) {
        for (let x = x0; x < x1; x += 4) {
          const i = (y * w + x) * 4;
          const r = d[i], g = d[i+1], b = d[i+2];
          if (b > r * 1.3 && b > g * 0.85 && b > 30) {
            sR += r; sG += g; sB += b; n++;
          }
        }
      }
      const idx = row * cells + col;
      if (n > 50) {
        meanR[idx] = sR / n; meanG[idx] = sG / n; meanB[idx] = sB / n;
        valid[idx] = 1;
        totalN += n;
      }
    }
  }
  return { meanR, meanG, meanB, valid, totalN, cells, img, ctx };
}

// Aplica shift a los pixeles de agua del canvas usando el mean grid original
// (per sub-mesh) y el smoothed grid global (unified). Las coords del pixel
// se mapean al smoothed grid via offset (rowOffset, colOffset) en celdas.
function applyWaterShiftFromGrids(canvasInfo, originalGridUnified, smoothedGridUnified, rowOffsetCells, colOffsetCells, unifiedCols) {
  const { img, ctx, cells } = canvasInfo;
  const w = img.width, h = img.height;
  const d = img.data;
  const cellPx = w / cells;
  for (let y = 0; y < h; y++) {
    const fy = y / cellPx - 0.5 + rowOffsetCells;
    const ry0 = Math.max(0, Math.min(unifiedCols - 1, Math.floor(fy)));
    const ry1 = Math.max(0, Math.min(unifiedCols - 1, ry0 + 1));
    const wy = Math.max(0, Math.min(1, fy - ry0));
    for (let x = 0; x < w; x++) {
      const fx = x / cellPx - 0.5 + colOffsetCells;
      const rx0 = Math.max(0, Math.min(unifiedCols - 1, Math.floor(fx)));
      const rx1 = Math.max(0, Math.min(unifiedCols - 1, rx0 + 1));
      const wx = Math.max(0, Math.min(1, fx - rx0));
      const i00 = ry0 * unifiedCols + rx0;
      const i01 = ry0 * unifiedCols + rx1;
      const i10 = ry1 * unifiedCols + rx0;
      const i11 = ry1 * unifiedCols + rx1;
      const oR = originalGridUnified.R, oG = originalGridUnified.G, oB = originalGridUnified.B;
      const tR = smoothedGridUnified.R, tG = smoothedGridUnified.G, tB = smoothedGridUnified.B;
      const lR = (oR[i00] * (1-wx) + oR[i01] * wx) * (1-wy)
               + (oR[i10] * (1-wx) + oR[i11] * wx) * wy;
      const lG = (oG[i00] * (1-wx) + oG[i01] * wx) * (1-wy)
               + (oG[i10] * (1-wx) + oG[i11] * wx) * wy;
      const lB = (oB[i00] * (1-wx) + oB[i01] * wx) * (1-wy)
               + (oB[i10] * (1-wx) + oB[i11] * wx) * wy;
      const sR = (tR[i00] * (1-wx) + tR[i01] * wx) * (1-wy)
               + (tR[i10] * (1-wx) + tR[i11] * wx) * wy;
      const sG = (tG[i00] * (1-wx) + tG[i01] * wx) * (1-wy)
               + (tG[i10] * (1-wx) + tG[i11] * wx) * wy;
      const sB = (tB[i00] * (1-wx) + tB[i01] * wx) * (1-wy)
               + (tB[i10] * (1-wx) + tB[i11] * wx) * wy;
      const dR_ = sR - lR, dG_ = sG - lG, dB_ = sB - lB;
      const i = (y * w + x) * 4;
      const r = d[i], g = d[i+1], b = d[i+2];
      const m1 = Math.max(0, Math.min(1, (b - r * 1.2) / 25));
      const m2 = Math.max(0, Math.min(1, (b - g * 0.75) / 25));
      const m3 = Math.max(0, Math.min(1, (b - 25) / 20));
      const m = m1 * m2 * m3;
      if (m > 0.005) {
        d[i]   = Math.max(0, Math.min(255, r + dR_ * m));
        d[i+1] = Math.max(0, Math.min(255, g + dG_ * m));
        d[i+2] = Math.max(0, Math.min(255, b + dB_ * m));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Normalización unificada de tono de agua sobre N×N sub-meshes de inner14.
// Stitchea los mean grids individuales en uno unificado, hace dilation +
// blur sobre el unificado (cruzando sub-mesh boundaries), y aplica shift
// pixel-level a cada canvas usando el grid global. Esto elimina las
// discontinuidades que aparecían entre sub-meshes adyacentes (cada uno
// normalizaba a su propio mean local).
function unifiedNormalizeWater(canvases, layoutN, tilesPerSide) {
  // 1. Per-sub-mesh mean grid
  const grids = canvases.map(c => computeWaterMeanGrid(c, tilesPerSide));
  const cellsPerSub = grids[0].cells; // tilesPerSide * WATER_SUB
  const unified = layoutN * cellsPerSub;

  // 2. Stitch en grid unificado
  const uMR = new Float32Array(unified * unified);
  const uMG = new Float32Array(unified * unified);
  const uMB = new Float32Array(unified * unified);
  const uV = new Uint8Array(unified * unified);
  let totalN = 0;
  for (let sRow = 0; sRow < layoutN; sRow++) {
    for (let sCol = 0; sCol < layoutN; sCol++) {
      const g = grids[sRow * layoutN + sCol];
      totalN += g.totalN;
      for (let r = 0; r < cellsPerSub; r++) {
        for (let c = 0; c < cellsPerSub; c++) {
          const ur = sRow * cellsPerSub + r;
          const uc = sCol * cellsPerSub + c;
          const uIdx = ur * unified + uc;
          const lIdx = r * cellsPerSub + c;
          uMR[uIdx] = g.meanR[lIdx];
          uMG[uIdx] = g.meanG[lIdx];
          uMB[uIdx] = g.meanB[lIdx];
          uV[uIdx] = g.valid[lIdx];
        }
      }
    }
  }
  if (totalN < 1000) return;

  // 3. Dilation sobre unified (rellena celdas inválidas desde vecinos)
  for (let pass = 0; pass < unified; pass++) {
    const newlyFilled = [];
    for (let row = 0; row < unified; row++) {
      for (let col = 0; col < unified; col++) {
        const idx = row * unified + col;
        if (uV[idx]) continue;
        let aR = 0, aG = 0, aB = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nr = row + dy, nc = col + dx;
            if (nr < 0 || nr >= unified || nc < 0 || nc >= unified) continue;
            const nIdx = nr * unified + nc;
            if (uV[nIdx] === 1) {
              aR += uMR[nIdx]; aG += uMG[nIdx]; aB += uMB[nIdx]; n++;
            }
          }
        }
        if (n > 0) {
          uMR[idx] = aR / n; uMG[idx] = aG / n; uMB[idx] = aB / n;
          newlyFilled.push(idx);
        }
      }
    }
    if (newlyFilled.length === 0) break;
    for (const idx of newlyFilled) uV[idx] = 1;
  }

  // 4. Box-blur del unified grid (cruza sub-mesh boundaries — esto es lo
  //    que mata las discontinuidades entre sub-meshes adyacentes).
  let sMR = uMR, sMG = uMG, sMB = uMB;
  for (let pass = 0; pass < 32; pass++) {
    const tR = new Float32Array(sMR.length);
    const tG = new Float32Array(sMG.length);
    const tB = new Float32Array(sMB.length);
    for (let row = 0; row < unified; row++) {
      for (let col = 0; col < unified; col++) {
        let aR = 0, aG = 0, aB = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nr = row + dy, nc = col + dx;
            if (nr < 0 || nr >= unified || nc < 0 || nc >= unified) continue;
            const ni = nr * unified + nc;
            aR += sMR[ni]; aG += sMG[ni]; aB += sMB[ni]; n++;
          }
        }
        const idx = row * unified + col;
        tR[idx] = aR / n; tG[idx] = aG / n; tB[idx] = aB / n;
      }
    }
    sMR = tR; sMG = tG; sMB = tB;
  }

  // 5. Apply pixel-level shift a cada canvas usando el unified original +
  //    unified smoothed. El offset en celdas posiciona el sub-mesh en el grid.
  const originalGrid = { R: uMR, G: uMG, B: uMB };
  const smoothedGrid = { R: sMR, G: sMG, B: sMB };
  for (let sRow = 0; sRow < layoutN; sRow++) {
    for (let sCol = 0; sCol < layoutN; sCol++) {
      const idx = sRow * layoutN + sCol;
      applyWaterShiftFromGrids(
        grids[idx],
        originalGrid, smoothedGrid,
        sRow * cellsPerSub, sCol * cellsPerSub,
        unified,
      );
    }
  }
}

// Water-discard simple para el inner14: descarta los pixeles de agua de la
// satelital así el water shader debajo se ve. Sin detail blending, solo
// discard.
const COASTLINE_MASK_WORLD_SIZE = 400000;

function applyWaterDiscard(material, opts = {}) {
  const { blur = false } = opts;
  // SDF compartido con FFTOcean — una sola texture GPU para ambos componentes.
  const sharedRef = getSharedCoastlineSDF();
  material.userData.uCoastMask    = sharedRef;
  material.userData.uCoastMaskSz  = { value: COASTLINE_MASK_WORLD_SIZE };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCoastMask   = material.userData.uCoastMask;
    shader.uniforms.uCoastMaskSz = material.userData.uCoastMaskSz;

    // Inject vWorldPos varying en vertex. Lo calculamos a mano post-displacement
    // (transformed ya tiene el displacementMap aplicado) para no depender de
    // los chunks condicionales de envmap/shadows.
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `
        #include <common>
        varying vec3 vWorldPos_wd;
      `)
      .replace("#include <project_vertex>", `
        #include <project_vertex>
        vWorldPos_wd = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `);

    // SDF sample: simple (single tap) o blurred (9-tap Gaussiano).
    // Blurred suaviza la silueta chebyshev del SDF — usar solo donde es
    // visible y costoso (airport patch z17 que está sobre el FFT).
    const sdfSample = blur ? `
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
    ` : `
            float _sdf = texture2D(uCoastMask, _maskUv).r;
    `;

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
            ${sdfSample}
            if (_sdf > 0.551) discard;
            ${blur ? `
            // Airport patch z17: fade alpha en el borde del agua para que el
            // FFT alpha-blendeado por encima haga la transición suave.
            // El agua "crece" 2% hacia la costa shift sobre el smoothstep:
            // fade va de 0.482→0.531 en lugar de 0.502→0.551. → airport
            // empieza a desaparecer 2% más adentro de la tierra.
            float _coastFade = 1.0 - smoothstep(0.482, 0.531, _sdf);
            diffuseColor.a *= _coastFade;
            if (diffuseColor.a < 0.01) discard;
            ` : ""}
          }
        }
      `);
  };
  material.customProgramCacheKey = () => blur ? "waterDiscard_v32_blur" : "waterDiscard_v32_simple";
  material.needsUpdate = true;
}

// ─── Detail textures ─────────────────────────────────────────────────────────
// 3 texturas seamless para blendear sobre la satelital y romper el aliasing
// cuando se vuela bajo (cada píxel satelital z14 = 6.8 m, se ve enorme cerca).
// Tile a 30 m/repetición, fade out a partir de 2 km de la cámara para no
// tener moiré a distancia. Se mezcla por elevación (sand bajo, rock alto) y
// pendiente (slope alto = rock independiente de la altura).
// Multi-escala: 2 sample rates distintos blendeados rompen el patrón visible
// del tile. Strength bajo + luminance-only preservan el color satelital.
const DETAIL_TILE_NEAR  = 80;
const DETAIL_TILE_FAR   = 250;
const DETAIL_FADE_NEAR = 80000;
const DETAIL_FADE_FAR  = 120000;
const DETAIL_STRENGTH  = 0.35;
let _detailTexCache = null;
function loadDetailTextures() {
  if (_detailTexCache) return _detailTexCache;
  const loader = new THREE.TextureLoader();
  // Diffuse: sRGB. Normal: linear (NoColorSpace).
  const makeDiffuse = (url) => new Promise((resolve, reject) => {
    loader.load(url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      resolve(tex);
    }, undefined, reject);
  });
  const makeNormal = (url) => new Promise((resolve, reject) => {
    loader.load(url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = 8;
      resolve(tex);
    }, undefined, reject);
  });
  _detailTexCache = Promise.all([
    makeDiffuse("/textures/terrain/rock.png"),
    makeDiffuse("/textures/terrain/sand.png"),
    makeDiffuse("/textures/terrain/grass.png"),
    makeNormal("/textures/terrain/rock_n.png"),
    makeNormal("/textures/terrain/sand_n.png"),
    makeNormal("/textures/terrain/grass_n.png"),
  ]).then(([rock, sand, grass, rockN, sandN, grassN]) => ({
    rock, sand, grass, rockN, sandN, grassN,
  }));
  return _detailTexCache;
}

// Inyecta blending de detail textures en un MeshStandardMaterial existente
// vía onBeforeCompile. Mantiene todo el pipeline PBR/IBL del Standard,
// solo modula `diffuseColor.rgb` con una mezcla de las 3 detail textures.
function applyDetailBlending(material, detail, opts = {}) {
  const withWaterDiscard = opts.withWaterDiscard === true;
  const landOnly = opts.landOnly === true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRockMap     = { value: detail.rock };
    shader.uniforms.uSandMap     = { value: detail.sand };
    shader.uniforms.uGrassMap    = { value: detail.grass };
    shader.uniforms.uRockNormal  = { value: detail.rockN };
    shader.uniforms.uSandNormal  = { value: detail.sandN };
    shader.uniforms.uGrassNormal = { value: detail.grassN };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
varying vec3 vWorldPos_dt;`)
      .replace("#include <displacementmap_vertex>", `#include <displacementmap_vertex>
vWorldPos_dt = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vWorldPos_dt;
uniform sampler2D uRockMap;
uniform sampler2D uSandMap;
uniform sampler2D uGrassMap;
uniform sampler2D uRockNormal;
uniform sampler2D uSandNormal;
uniform sampler2D uGrassNormal;`)
      // Color modulation: en map_fragment porque ahí ya está diffuseColor.
      // Recomputamos pesos acá; la sección normal hace lo mismo (3 samples
      // extra por fragment, costo OK).
      .replace("#include <map_fragment>", `#include <map_fragment>
${withWaterDiscard ? `
// Water-pixel discard: los píxeles de agua de la satelital se descartan
// para que el water mesh transparente debajo muestre sus efectos.
{
  float r = diffuseColor.r;
  float g = diffuseColor.g;
  float b = diffuseColor.b;
  bool isWater = (b > r + 0.05) && (b > 0.12) && (b > g - 0.10);
  if (isWater) discard;
}
` : ""}
${landOnly ? `
bool _isLand_c = !((diffuseColor.b > diffuseColor.r * 1.3)
               && (diffuseColor.b > diffuseColor.g * 0.85));
if (_isLand_c)
` : ""}
{}`)
      // Normal perturbation: la normal interpolada de PlaneGeometry (vNormal)
      // siempre apunta +Y world (no se actualiza con el displacement, así que
      // no refleja la pendiente macro). Si derivamos la normal de las world
      // derivatives (dFdx/dFdy) tenemos slope-shading, pero queda FLAT
      // por triángulo → triangulación visible. Trade-off: usamos +Y world
      // como base smooth (lighting macro queda plano, pero la satelital ya
      // trae sombras horneadas) + detail normal map para el micro-relieve.
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
${landOnly ? `
vec3 _satC_n = texture2D(map, vMapUv).rgb;
bool _isLand_n = !((_satC_n.b > _satC_n.r * 1.3)
               && (_satC_n.b > _satC_n.g * 0.85));
if (_isLand_n)
` : ""}
{
  vec2 uvN_n = vWorldPos_dt.xz / ${DETAIL_TILE_NEAR.toFixed(1)};
  vec2 uvF_n = vWorldPos_dt.xz / ${DETAIL_TILE_FAR.toFixed(1)};
  vec3 nRockTS  = texture2D(uRockNormal,  uvN_n).rgb + texture2D(uRockNormal,  uvF_n).rgb - 1.0;
  vec3 nSandTS  = texture2D(uSandNormal,  uvN_n).rgb + texture2D(uSandNormal,  uvF_n).rgb - 1.0;
  vec3 nGrassTS = texture2D(uGrassNormal, uvN_n).rgb + texture2D(uGrassNormal, uvF_n).rgb - 1.0;

  // Slope/elev pesos: usamos dFdx-derived solo para CLASIFICAR (cuál
  // textura blendear), NO para el normal final del lighting. La
  // triangulación de dFdx no se ve porque acá solo afecta los pesos
  // (que son suaves después de smoothstep).
  vec3 ddx_n = dFdx(vWorldPos_dt);
  vec3 ddy_n = dFdy(vWorldPos_dt);
  vec3 geomN = normalize(cross(ddy_n, ddx_n));
  float slope_n = 1.0 - clamp(geomN.y, 0.0, 1.0);
  float worldY_n = vWorldPos_dt.y;

  float sandW_n  = smoothstep(20.0, 0.0,  worldY_n) * (1.0 - slope_n);
  float rockW_n  = clamp(max(smoothstep(200.0, 800.0, worldY_n), slope_n * 1.5), 0.0, 1.0);
  float grassW_n = max(0.0, 1.0 - sandW_n - rockW_n);
  float wSum_n = max(0.001, sandW_n + grassW_n + rockW_n);
  vec3 detailNTS = (nSandTS * sandW_n + nGrassTS * grassW_n + nRockTS * rockW_n) / wSum_n;

  float dist_n = length(vWorldPos_dt - cameraPosition);
  float dStrength_n = (1.0 - smoothstep(${DETAIL_FADE_NEAR.toFixed(1)}, ${DETAIL_FADE_FAR.toFixed(1)}, dist_n));

  // Aplicamos el detail TS como delta en el plano tangente +Y world:
  //   detailNTS.x → tangent X (world +X, este)
  //   detailNTS.y → tangent Y (world +Z, sur — porque flipY del normal map)
  //   detailNTS.z → up (world +Y), implícito al normalizar
  vec3 baseN = vec3(0.0, 1.0, 0.0);
  vec3 perturbedN = normalize(baseN + vec3(detailNTS.x, 0.0, detailNTS.y) * dStrength_n);
  normal = normalize((viewMatrix * vec4(perturbedN, 0.0)).xyz);
}`);

    material.userData.detailShader = shader;
  };
  material.needsUpdate = true;
}

// 4 sub-meshes coplanares de zoom 15 en grilla 2×2. Cobertura total 70 km.
// Cada sub-mesh fetcha sus 32×32 tiles con un tileOffset distinto del centro
// global, asegurando que los 4 cuadrantes tilean sin overlap ni gap.
//
// Heightmap: el zoom 13 que ya tenemos cubre 139 km — más que los 70 km del
// inner15. Se comparte entre los 4 sub-meshes vía UV transform.

// Generamos NxN sub-meshes alrededor del centro de inner15. Cada sub-mesh
// usa 32 tiles. tileOffset = (col - half)*32 + tileShift, world position =
// (col - half) * SUB_MESH_SIZE + INNER15_CENTER. Esto permite layouts NxN
// arbitrarios (3×3 actual, escalable a 4×4 si más adelante).
const SUB_MESH_OFFSETS = (() => {
  const out = [];
  const N = WT_INNER14_GRID_COUNT;
  const half = (N - 1) / 2;
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const dx = col - half;            // -1, 0, +1 (3×3) — east axis
      const dz = row - half;            // -1, 0, +1            — south axis
      out.push({
        name: `${row}-${col}`,
        tileOffsetX: dx * WT_INNER14_GRID_SIZE + WT_INNER14_TILE_SHIFT_X,
        tileOffsetY: dz * WT_INNER14_GRID_SIZE + WT_INNER14_TILE_SHIFT_Y,
        dx, dz,
      });
    }
  }
  return out;
})();

// Tile-snap offset: el stitching de Mapbox centra el canvas en el BOUNDARY del
// tile que contiene (lat, lon), no en (lat, lon) exacto. Devuelve el offset en
// metros desde el canvas center hasta TERRAIN_CENTER. Para alinear meshes de
// distinto zoom, cada uno se shifta por -tileSnapOffset.
const EARTH_CIRC = 40075016.686;
function tileSnapOffset(lat, lon, zoom) {
  const lonNorm = (lon + 180) / 360;
  const latRad = lat * Math.PI / 180;
  const yNorm = (1 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / Math.PI) / 2;
  const exactX = lonNorm * 2 ** zoom;
  const exactY = yNorm * 2 ** zoom;
  const subX = exactX - Math.floor(exactX);
  const subY = exactY - Math.floor(exactY);
  const mpt = (EARTH_CIRC * Math.cos(latRad)) / (2 ** zoom);
  return { x: subX * mpt, z: subY * mpt };
}

function makeSatTex(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Clona el heightmap con UV transform para que un sub-mesh mapee al cuadrante
// correcto del heightmap grande. Maneja shift sur del inner15 (su centro NO
// coincide con el centro del heightmap).
function cloneHeightmapForSubmesh(heightTex, subWorldX, subWorldZ, submeshSize, heightSize, heightCenterX = 0, heightCenterZ = 0) {
  const tex = heightTex.clone();
  tex.image = heightTex.image;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  const r = submeshSize / heightSize;
  // Plano rotado -π/2 X → vertex +Y plano = world -Z (norte). PlaneGeometry
  // V=1 = top. Con flipY=true (default), UV V=1 muestrea canvas-norte (top
  // del canvas). World -Z (norte) → V=1 → canvas norte ✓. La fórmula:
  //   subCenterV = 0.5 - (subWorldZ - heightCenterZ) / heightSize
  const subCenterU = 0.5 + (subWorldX - heightCenterX) / heightSize;
  const subCenterV = 0.5 - (subWorldZ - heightCenterZ) / heightSize;

  tex.repeat.set(r, r);
  tex.offset.set(subCenterU - r / 2, subCenterV - r / 2);
  tex.needsUpdate = true;
  return tex;
}

// Snap offsets módulo-level (constantes — dependen sólo de TERRAIN_CENTER + zoom)
const SNAP_Z14 = tileSnapOffset(TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON, WT_INNER14_ZOOM);
const SNAP_Z17 = tileSnapOffset(TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON, WT_AIRPORT_ZOOM);
const SNAP_Z10 = tileSnapOffset(TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON, WT_OUTER_ZOOM);

// Warmup: cuántos draw calls invisibles desde direcciones distintas para
// forzar compilación de todas las variantes de shader que usa el frustum.
// 12 yaws × 2 pitches = 24 frames. Cubre todas las direcciones probables.
const WARMUP_FRAMES = 24;

export default function OrmuzTerrain({ token, groundY = 0, onProgress }) {
  const subRefs = useRef(SUB_MESH_OFFSETS.map(() => null));
  const airportRef = useRef(null);
  const outerRef = useRef(null);
  const [data, setData] = useState(null);
  const { gl, scene, camera } = useThree();

  // Compartido entre el effect de carga y el effect de swap+warmup, para
  // mantener un solo contador de progreso.
  const progressRef = useRef({ done: 0, total: 1 });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        // Tile-snap offsets para cada zoom — usados para alinear los 3 layers
        // (inner14, airport, heightmap) al mismo TERRAIN_CENTER en world (0,0,0).
        const snapZ14 = tileSnapOffset(TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON, WT_INNER14_ZOOM);
        const snapZ17 = tileSnapOffset(TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON, WT_AIRPORT_ZOOM);
        const snapZ13 = tileSnapOffset(TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON, WT_HEIGHT_FINE_ZOOM);
        // heightmap canvas center world position (corrige tile snap)
        const heightCenterX_real = WT_HEIGHT_FINE_CENTER_X - snapZ13.x;
        const heightCenterZ_real = WT_HEIGHT_FINE_CENTER_Z - snapZ13.z;

        // z14 nativo: 16×16 tiles z14 por sub-mesh = canvas 4096 px = 6.8 m/px.
        // 25 sub-meshes + 1 airport + 1 fine heightmap + 1 outer sat + 1 outer height + warmup
        const TOTAL = SUB_MESH_OFFSETS.length + 1 + 1 + 1 + 1 + WARMUP_FRAMES;
        progressRef.current = { done: 0, total: TOTAL };
        const tick = () => {
          if (cancelled) return;
          progressRef.current.done++;
          onProgress?.(progressRef.current.done, TOTAL);
        };
        onProgress?.(0, TOTAL);

        // Por sub-mesh: chequear IndexedDB antes de stitchear. En miss, fetch +
        // stitch + persist. La normalización de agua se hace después en una
        // pasada UNIFICADA sobre todos los sub-meshes (cross-boundary blur),
        // así que acá solo guardamos canvas raw cacheado sin normalización
        // por separado.
        const subCacheStates = await Promise.all(
          SUB_MESH_OFFSETS.map(async ({ tileOffsetX, tileOffsetY }) => {
            const key =
              `inner14_${CACHE_VERSION}_z${WT_INNER14_ZOOM}` +
              `_g${WT_INNER14_GRID_SIZE}` +
              `_tx${tileOffsetX}_ty${tileOffsetY}`;
            const cached = await getCachedCanvas(key);
            if (cached) { tick(); return { canvas: cached, key, fromCache: true }; }
            const canvas = await fetchSatelliteCanvas({
              token,
              lat: TERRAIN_CENTER_LAT,
              lon: TERRAIN_CENTER_LON,
              zoom: WT_INNER14_ZOOM,
              gridSize: WT_INNER14_GRID_SIZE,
              tileOffsetX,
              tileOffsetY,
            });
            tick();
            return { canvas, key, fromCache: false };
          })
        );

        // Tiles editados manualmente — la normalización shader-side queda
        // desactivada para no pisar el trabajo manual. Persistimos los canvases
        // raw stitcheados a IndexedDB.
        const anyMissing = subCacheStates.some(s => !s.fromCache);
        if (anyMissing) {
          for (const s of subCacheStates) {
            if (!s.fromCache) putCachedCanvas(s.key, s.canvas);
          }
        }

        const subCanvases = subCacheStates.map(s => s.canvas);

        // Airport patch z17 — un solo canvas, native res (8192²) para máxima
        // calidad ras-suelo. ~256 MB GPU pero solo 1 textura.
        const airportKey = `airport_${CACHE_VERSION}_z${WT_AIRPORT_ZOOM}_g${WT_AIRPORT_GRID_SIZE}`;
        let airportCanvas = await getCachedCanvas(airportKey);
        if (!airportCanvas) {
          airportCanvas = await fetchSatelliteCanvas({
            token,
            lat: TERRAIN_CENTER_LAT,
            lon: TERRAIN_CENTER_LON,
            zoom: WT_AIRPORT_ZOOM,
            gridSize: WT_AIRPORT_GRID_SIZE,
          });
          putCachedCanvas(airportKey, airportCanvas);
        }
        tick();

        // Heightmap fino (z13, 209 km, shifted +70 km sur). Cubre todo el
        // inner14 sin clamp en bordes. Carving aplana un área grande en el
        // píxel del aeropuerto (NO el centro del canvas) — esto hace que la
        // pista y todo el airport patch quede plano sin SRTM noise.
        //
        // carveCenterU/V está en image space del canvas (top=norte, bottom=sur).
        // Para un canvas centrado en world (heightCenterX_real, heightCenterZ_real),
        // un punto world (wx, wz) cae en image V = 0.5 + (wz - heightCenterZ)/worldSize
        // (porque +Z es sur y +V image también va hacia el sur).
        // BUG anterior: el signo de V estaba invertido (0.835 vs correcto 0.165),
        // sampleando el baseline en una montaña 140 km al sur en lugar de TFB.9 →
        // todo el inner14 quedaba ~200 m hundido.
        const airportCarveU = 0.5 + (0 - heightCenterX_real) / WT_HEIGHT_FINE_WORLD_SIZE;
        const airportCarveV = 0.5 + (0 - heightCenterZ_real) / WT_HEIGHT_FINE_WORLD_SIZE;
        const heightFine = await fetchHeightmapCanvas({
          token,
          lat: TERRAIN_CENTER_LAT,
          lon: TERRAIN_CENTER_LON,
          zoom: WT_HEIGHT_FINE_ZOOM,
          gridSize: WT_HEIGHT_FINE_GRID_SIZE,
          tileShiftY: WT_HEIGHT_FINE_TILE_SHIFT_Y,
          worldSize: WT_HEIGHT_FINE_WORLD_SIZE,
          // Carving 1500m × 2500m → cubre solo el runway + apron + edificios
          // del aeropuerto. Mantiene relieve natural para todo lo demás.
          runwayHalfWidth: 1500,
          runwayHalfLength: 2500,
          carveCenterU: airportCarveU,
          carveCenterV: airportCarveV,
        });
        tick();

        // Outer ring z10 — 1114 km × 1114 km, una sola textura ~8192×8192 px.
        // Cubre todo el Golfo (Iraq, Kuwait, Saudi, UAE, Oman, costa iraní)
        // como horizonte lejano.
        const outerKey = `outer_${CACHE_VERSION}_z${WT_OUTER_ZOOM}_g${WT_OUTER_GRID_SIZE}`;
        let outerCanvas = await getCachedCanvas(outerKey);
        if (!outerCanvas) {
          outerCanvas = await fetchSatelliteCanvas({
            token,
            lat: TERRAIN_CENTER_LAT,
            lon: TERRAIN_CENTER_LON,
            zoom: WT_OUTER_ZOOM,
            gridSize: WT_OUTER_GRID_SIZE,
          });
          putCachedCanvas(outerKey, outerCanvas);
        }
        tick();

        // Outer heightmap z10 — terrain-rgb a zoom 10, 32×32 tiles (~8192 px,
        // ~136 m/px). Le da relieve a las montañas del horizonte (Zagros al
        // norte, Musandam/Hajar al sur) que antes se veían planas.
        //
        // El carve se centra en el CENTRO DEL INNER14 (world (0, +70000)),
        // NO en TFB.9. El inner14 está shifted 70 km al sur, así que cubre
        // world Z ∈ [-17.5 km, +157.5 km]. Si el carve estuviera centrado en
        // TFB.9 con 90 km half, todo el sur del inner14 (Z > 90 km) tendría
        // z10 sin carve → las montañas del z10 (más coarse/altas que las del
        // z14 por sub-sampling) atraviesan el inner14. Centrando en inner14
        // center con 90 km half cubre todo el cuadrado jugable + buffer.
        //
        // Baseline trade-off: sampleado en el gulf (~70 km al sur de TFB.9)
        // tira ~0 m (mar). El píxel del airport queda a +10 m, pero el step
        // de cuantización del z10 es ~17.9 m → absorbe el error sin afectar
        // la altura visible.
        const innerCenterU = 0.5 + (WT_INNER14_CENTER_X + SNAP_Z10.x) / WT_OUTER_WORLD_SIZE;
        const innerCenterV = 0.5 + (WT_INNER14_CENTER_Z + SNAP_Z10.z) / WT_OUTER_WORLD_SIZE;
        const heightOuter = await fetchHeightmapCanvas({
          token,
          lat: TERRAIN_CENTER_LAT,
          lon: TERRAIN_CENTER_LON,
          zoom: WT_OUTER_ZOOM,
          gridSize: WT_OUTER_GRID_SIZE,
          worldSize: WT_OUTER_WORLD_SIZE,
          // 90 km half-side desde el centro del inner14 = cubre el inner14
          // (87.5 km half) + 2.5 km de buffer. Vertices del z10 mesh cada
          // 4.35 km → ~21 vértices dentro del carve, todos a elev=0.
          runwayHalfWidth: 90000,
          runwayHalfLength: 90000,
          carveCenterU: innerCenterU,
          carveCenterV: innerCenterV,
        });
        tick();

        if (cancelled) return;

        const heightBase = new THREE.CanvasTexture(heightFine.canvas);
        heightBase.colorSpace = THREE.NoColorSpace;
        heightBase.minFilter = THREE.LinearFilter;
        heightBase.magFilter = THREE.LinearFilter;
        heightBase.generateMipmaps = false;
        heightBase.wrapS = heightBase.wrapT = THREE.ClampToEdgeWrapping;

        const subs = SUB_MESH_OFFSETS.map((info, i) => {
          // Mismo wx/wz que en JSX — incluye -SNAP_Z14 para que el frame del
          // submesh esté en TERRAIN_CENTER world frame, igual que heightmap.
          const wx = info.dx * WT_INNER14_SUBMESH_SIZE + WT_INNER14_CENTER_X - snapZ14.x;
          const wz = info.dz * WT_INNER14_SUBMESH_SIZE + WT_INNER14_CENTER_Z - snapZ14.z;
          return {
            ...info,
            satTex: makeSatTex(subCanvases[i]),
            heightTex: cloneHeightmapForSubmesh(
              heightBase, wx, wz,
              WT_INNER14_SUBMESH_SIZE,
              WT_HEIGHT_FINE_WORLD_SIZE,
              heightCenterX_real,
              heightCenterZ_real
            ),
          };
        });

        // Airport patch: heightmap cloneado con UV transform a (0,0) + size
        // 8.7 km. Mismo displacement que el z15 debajo + 1m de bias extra para
        // que quede flotando 1m sobre el terreno desplazado (sin pokes-through).
        // (No se usa porque airport ya no displaza, pero lo dejamos calculado
        // por si re-habilitamos displacement parcial.)
        // Airport mesh world position = (-snapZ17.x, -snapZ17.z) (ver JSX)
        const airportHeightTex = cloneHeightmapForSubmesh(
          heightBase, -snapZ17.x, -snapZ17.z,
          WT_AIRPORT_WORLD_SIZE,
          WT_HEIGHT_FINE_WORLD_SIZE,
          heightCenterX_real,
          heightCenterZ_real
        );

        const outerHeightTex = new THREE.CanvasTexture(heightOuter.canvas);
        outerHeightTex.colorSpace = THREE.NoColorSpace;
        outerHeightTex.minFilter = THREE.LinearFilter;
        outerHeightTex.magFilter = THREE.LinearFilter;
        outerHeightTex.generateMipmaps = false;
        outerHeightTex.wrapS = outerHeightTex.wrapT = THREE.ClampToEdgeWrapping;

        setData({
          subs,
          airportTex: makeSatTex(airportCanvas),
          airportHeightTex,
          outerTex: makeSatTex(outerCanvas),
          outerHeightTex,
          outerScale: heightOuter.maxElevation,
          outerBias:  heightOuter.displacementBias ?? 0,
          fineScale: heightFine.maxElevation,
          fineBias:  heightFine.displacementBias ?? 0,
          snapZ14, snapZ17,
        });
      } catch (err) {
        console.error("OrmuzTerrain:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  // Cuando data cargó, swap material en cada sub-mesh
  useEffect(() => {
    if (!data) return;
    let detailPromise = loadDetailTextures();

    data.subs.forEach((sub, i) => {
      const meshRef = subRefs.current[i];
      if (!meshRef) return;
      const oldMat = meshRef.material;
      const mat = new THREE.MeshStandardMaterial({
        map: sub.satTex,
        displacementMap: sub.heightTex,
        displacementScale: data.fineScale,
        displacementBias:  data.fineBias,
        roughness: 0.96,
        metalness: 0,
      });
      applyWaterDiscard(mat);
      meshRef.material = mat;
      if (oldMat) oldMat.dispose();
    });

    // Airport patch: comparte el heightmap del z15 con UV transform al área
    // del patch, pero suma +1m al displacementBias → la superficie queda
    // siempre 1m sobre el z15, sin pokes-through cuando hay relieve. En modo
    // DEBUG_FLAT (scale=0), el bias=1 lo levanta uniforme 1m.
    // Airport patch: SIGUE el mismo heightmap que el inner14 (para que ambos
    // se muevan parejo con el terreno) + 1m de bias extra → siempre 1m sobre
    // el inner14, sin pokes-through. Position.y = 0 (todo el offset va por el
    // displacementBias).
    // Outer ring z10: con heightmap z10 para que las montañas del horizonte
    // (Zagros norte, Musandam/Hajar sur) tengan relieve real. Lambert =
    // shading básico que cuesta poco, recibe directional + ambient. El mismo
    // baseline que el inner14 (píxel del aeropuerto = 0) → ambos meshes
    // matchean en altura donde se solapan. renderOrder=-1 + position.y=-3
    // mantienen al inner14 ganando depth test en la zona del cuadrado jugable.
    if (outerRef.current && data.outerTex && data.outerHeightTex) {
      const oldMat = outerRef.current.material;
      // MeshStandardMaterial = mismo lighting que el inner14 (IBL del HDRI +
      // directional + ambient). Con MeshLambertMaterial el outer quedaba
      // notablemente más oscuro porque Lambert no usa IBL → se notaba un
      // corte fuerte en el borde inner14↔outer.
      const outerMat = new THREE.MeshStandardMaterial({
        map: data.outerTex,
        displacementMap: data.outerHeightTex,
        displacementScale: data.outerScale,
        displacementBias:  data.outerBias,
        roughness: 0.96,
        metalness: 0,
      });
      applyWaterDiscard(outerMat);
      outerRef.current.material = outerMat;
      if (oldMat) oldMat.dispose();
    }

    if (airportRef.current && data.airportTex && data.airportHeightTex) {
      const oldMat = airportRef.current.material;
      const aMat = new THREE.MeshStandardMaterial({
        map: data.airportTex,
        displacementMap: data.airportHeightTex,
        displacementScale: data.fineScale,
        // +5m bias (no +1m): el mesh airport (64 seg sobre 8.7km) y el inner14
        // (256 seg sobre 35km) tienen densidades parecidas pero los vertices
        // no se alinean exacto. La interpolación lineal entre vertices da
        // valores levemente distintos a cualquier punto interior. 5m de
        // separación absorbe ese error y elimina z-fighting.
        displacementBias:  data.fineBias + 5,
        roughness: 0.96,
        metalness: 0,
        // Transparent + depthWrite false → el airport patch alpha-blendea
        // suavemente con el FFT en el borde del agua, mismo look que z14.
        transparent: true,
        depthWrite: false,
      });
      applyWaterDiscard(aMat, { blur: true });
      airportRef.current.material = aMat;
      if (oldMat) oldMat.dispose();
      // Water-discard en z17 SÍ se mantiene: para cubrir la harbor cyan
      // del puerto donde el water mesh por sí solo no llega bien (z17
      // está a +3m, el water mesh a 0m — water mesh queda DEBAJO del
      // mesh z17 en esa zona, no se ve sin el discard).
    }

    // Pre-compilar shaders. compileAsync resuelve la mayoría, pero algunos
    // drivers difieren variantes hasta el primer draw call con un frustum
    // específico. Por eso después hacemos un warmup orbit invisible.
    gl.compileAsync?.(scene, camera);

    // Warmup orbit: render desde N direcciones con una cámara temporal —
    // fuerza al driver a finalizar todas las pipelines. Lo hacemos detrás del
    // LoadingOverlay, así no se ve.
    const warmCam = camera.clone();
    let cancelled = false;
    let i = 0;
    const yaws = 12;
    const pitches = [-0.3, -0.05]; // mirando al horizonte y un poco hacia abajo

    const step = () => {
      if (cancelled || i >= WARMUP_FRAMES) {
        // Forzar tick final para que el progreso llegue a 100% si quedó corto
        const { done, total } = progressRef.current;
        if (done < total) onProgress?.(total, total);
        return;
      }
      const yawIdx = i % yaws;
      const pitchIdx = Math.floor(i / yaws) % pitches.length;
      const yaw = (yawIdx / yaws) * Math.PI * 2;
      const pitch = pitches[pitchIdx];
      warmCam.position.copy(camera.position);
      warmCam.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
      warmCam.updateMatrixWorld();
      gl.render(scene, warmCam);
      progressRef.current.done++;
      onProgress?.(progressRef.current.done, progressRef.current.total);
      i++;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    return () => { cancelled = true; };
  }, [data, gl, scene, camera, onProgress]);

  return (
    <group position={[0, groundY, 0]}>
      {/* OUTER z10 — 1114 km, horizonte lejano. Con heightmap z10 carved a
          90 km half-side. y=-20 para quedar claramente bajo el inner14 (que
          quantiza el "0" a ~-2 m por step de 9.46 m del heightmap fino). 18 m
          de margen absorben quantization + cualquier diferencia de baseline,
          y al horizonte (300+ km) son invisibles. renderOrder=-1 asegura que
          el outer se dibuje primero; el inner14 y airport ganan depth test
          encima donde se solapan. */}
      <mesh
        ref={outerRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-SNAP_Z10.x, -20, -SNAP_Z10.z]}
        renderOrder={-1}
      >
        <planeGeometry args={[
          WT_OUTER_WORLD_SIZE,
          WT_OUTER_WORLD_SIZE,
          256, 256,
        ]} />
        <meshStandardMaterial color="#888" roughness={0.96} metalness={0} />
      </mesh>

      {SUB_MESH_OFFSETS.map((info, i) => {
        // Posición world de cada sub-mesh = (dx, dz) * sub_size + offset center
        // Restamos SNAP_Z14 para que canvas content alinee con TERRAIN_CENTER en (0,0,0).
        const wx = info.dx * WT_INNER14_SUBMESH_SIZE + WT_INNER14_CENTER_X - SNAP_Z14.x;
        const wz = info.dz * WT_INNER14_SUBMESH_SIZE + WT_INNER14_CENTER_Z - SNAP_Z14.z;
        return (
          <mesh
            key={info.name}
            ref={(el) => { subRefs.current[i] = el; }}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[wx, 0, wz]}
            receiveShadow
          >
            <planeGeometry args={[
              WT_INNER14_SUBMESH_SIZE,
              WT_INNER14_SUBMESH_SIZE,
              WT_MESH_SEGMENTS,
              WT_MESH_SEGMENTS,
            ]} />
            <meshStandardMaterial color="#c8ad74" roughness={1} metalness={0} />
          </mesh>
        );
      })}

      {/* Airport patch: z17 8.7×8.7 km en TFB.9. Encima del z15 vía
          polygonOffset (en el material). renderOrder 1 para que se dibuje
          después del inner15 y gane el depth test. */}
      <mesh
        ref={airportRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-SNAP_Z17.x, 0, -SNAP_Z17.z]}
        receiveShadow
        renderOrder={1}
      >
        <planeGeometry args={[
          WT_AIRPORT_WORLD_SIZE,
          WT_AIRPORT_WORLD_SIZE,
          // 96 segments sobre 13km = ~136m/vertex, MISMA densidad que inner14.
          96, 96,
        ]} />
        <meshStandardMaterial color="#c8ad74" roughness={1} metalness={0} />
      </mesh>

    </group>
  );
}
