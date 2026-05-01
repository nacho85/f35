// SDF coastline compartido entre OrmuzTerrain y FFTOcean.
// Carga UNA sola vez y comparte la misma texture GPU entre ambos componentes
// → evita dos copias de 16384×16384 RGBA (~1GB cada una) en VRAM.

import * as THREE from "three";

let _sharedRef = null; // { value: THREE.Texture | null }
let _loadStarted = false;

export function getSharedCoastlineSDF() {
  if (_sharedRef) return _sharedRef;
  _sharedRef = { value: null };
  if (_loadStarted) return _sharedRef;
  _loadStarted = true;
  new THREE.TextureLoader().load("/textures/water/coastline-sdf.png", (t) => {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.anisotropy = 16;
    t.needsUpdate = true;
    _sharedRef.value = t;
  });
  return _sharedRef;
}
