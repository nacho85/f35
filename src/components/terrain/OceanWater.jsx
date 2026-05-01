"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import {
  TERRAIN_CENTER_LAT,
  TERRAIN_CENTER_LON,
} from "./terrainScale";

// Three.js Water + mask preciso de OSM coastlines (generado offline en
// scripts/generate-water-mask.mjs). El mask es un PNG de 4096×4096 cubriendo
// 250×250 km centrado en Bandar Abbas, con pixel value:
//   blanco (1.0) = agua según OSM
//   negro  (0.0) = tierra
// El shader samplea el mask en world XZ → discard donde no es agua.
// Plus el plano sigue cámara → nunca se ve el corte del filo del cuadrado.

// Tamaño en metros que cubre el mask (matchea config en
// scripts/generate-water-mask.mjs)
const MASK_WORLD_SIZE = 400000;

export default function OceanWater({ size = 250000, y = -2, followCamera = false }) {
  const { scene } = useThree();
  const [waterNormals, setWaterNormals] = useState(null);
  const [maskTex, setMaskTex] = useState(null);
  const waterRef = useRef(null);

  useEffect(() => {
    new THREE.TextureLoader().load("/textures/water/waternormals.jpg", (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 16; // reduce aliasing/vibración a distancia
      setWaterNormals(t);
    });
    new THREE.TextureLoader().load("/textures/water/coastline-mask.png", (t) => {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      setMaskTex(t);
    });
  }, []);

  const water = useMemo(() => {
    if (!waterNormals || !maskTex) return null;
    const geom = new THREE.PlaneGeometry(size, size);
    const w = new Water(geom, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,
      sunDirection: new THREE.Vector3(0.5, 0.7, 0.5).normalize(),
      sunColor: 0xfff0c8,
      waterColor: 0x0e4878,
      distortionScale: 6.0,
      alpha: 1.0,
      fog: false,
    });
    w.rotation.x = -Math.PI / 2;
    w.position.y = y;
    w.renderOrder = 2;

    const mat = w.material;
    mat.transparent = true;
    mat.uniforms.uMaskMap = { value: maskTex };
    mat.uniforms.uMaskWorldSize = { value: MASK_WORLD_SIZE };
    mat.uniforms.uPlaneHalfSize = { value: size / 2 };

    const origOnBeforeCompile = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      if (origOnBeforeCompile) origOnBeforeCompile(shader, renderer);
      shader.uniforms.uMaskMap = mat.uniforms.uMaskMap;
      shader.uniforms.uMaskWorldSize = mat.uniforms.uMaskWorldSize;
      shader.uniforms.uPlaneHalfSize = mat.uniforms.uPlaneHalfSize;

      shader.vertexShader = shader.vertexShader
        .replace("void main() {", `
          varying vec3 vWorldPosOcean;
          void main() {
        `)
        .replace(
          "#include <fog_vertex>",
          `
            #include <fog_vertex>
            vWorldPosOcean = (modelMatrix * vec4(position, 1.0)).xyz;
          `
        );

      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", `
          uniform sampler2D uMaskMap;
          uniform float uMaskWorldSize;
          uniform float uPlaneHalfSize;
          varying vec3 vWorldPosOcean;
          void main() {
            // Mask UV: world (0,0) está en el centro del bitmap → uv 0.5,0.5.
            // El mask cubre [-MASK/2, +MASK/2] en world X y Z.
            // Z+ en world = sur, pero el bitmap tiene y+ hacia abajo (sur),
            // y el script usa "py = (-(y - centerY)) ..." para world-Y → pixel-Y
            // (donde world-Y north=+, sur=-). Como vWorldPos.z+ = sur, mapea a
            // pixel +y abajo, así que UV.y = 0.5 + worldZ / size (sin signo).
            vec2 _maskUv = vec2(
              0.5 + vWorldPosOcean.x / uMaskWorldSize,
              0.5 - vWorldPosOcean.z / uMaskWorldSize
            );
            bool _insideMask = (_maskUv.x >= 0.0 && _maskUv.x <= 1.0 &&
                                _maskUv.y >= 0.0 && _maskUv.y <= 1.0);
            if (_insideMask && texture2D(uMaskMap, _maskUv).r < 0.5) discard;
        `)
        .replace(
          /gl_FragColor\s*=\s*vec4\(([^;]+),\s*alpha\s*\);/,
          `
            // Edge fade gradual del plano para evitar corte abrupto contra HDRI.
            float _dx = abs(vWorldPosOcean.x);
            float _dz = abs(vWorldPosOcean.z);
            float _maxDist = max(_dx, _dz);
            float _edgeFade = 1.0 - smoothstep(uPlaneHalfSize * 0.60, uPlaneHalfSize * 0.95, _maxDist);
            gl_FragColor = vec4($1, alpha * _edgeFade);
          `
        );
    };
    mat.needsUpdate = true;

    return w;
  }, [waterNormals, maskTex, size, y]);

  useFrame(({ camera }, dt) => {
    if (!water) return;
    water.material.uniforms.time.value += dt;
    if (followCamera) {
      water.position.x = camera.position.x;
      water.position.z = camera.position.z;
    }
  });

  useEffect(() => {
    if (!water) return;
    scene.add(water);
    return () => { scene.remove(water); };
  }, [water, scene]);

  return null;
}
