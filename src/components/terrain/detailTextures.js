"use client";

import * as THREE from "three";

// Detail textures cargadas desde /public/textures (polyhaven 4k diff JPG).
// Mismo cache key (path) → un solo TextureLoader cachea entre llamadas.

const _loader = new THREE.TextureLoader();
const _cache = new Map();

function loadTex(url) {
  if (_cache.has(url)) return _cache.get(url);
  const tex = _loader.load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // Hint al browser de que vamos a leer mucho — dejamos default minFilter
  // (LinearMipmapLinear con mipmaps generadas automáticamente).
  _cache.set(url, tex);
  return tex;
}

// 4 biomas mapeados al Golfo Pérsico:
//   sand_pale   — costa UAE / playas cercanas a Abu Dhabi (clara)
//   sand_red    — dunas Rub' al Khali tierra adentro
//   rock        — montañas Hajar / costa iraní rocosa
//   grass_rock  — foothills con vegetación dispersa (norte Irán)
export function makeDetailTextures() {
  return {
    sand:      loadTex("/textures/sand_pale/aerial_beach_02_diff_4k.jpg"),
    sandRed:   loadTex("/textures/sand_red/red_sand_diff_4k.jpg"),
    rock:      loadTex("/textures/rock/aerial_rocks_02_diff_4k.jpg"),
    grassRock: loadTex("/textures/grass_rock/aerial_grass_rock_diff_4k.jpg"),
  };
}
