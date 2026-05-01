"use client";

import { useEffect, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  WT_OUTER_WORLD_SIZE,
  TERRAIN_CENTER_LAT,
  TERRAIN_CENTER_LON,
  WT_OUTER_ZOOM,
} from "./terrainScale";

// ─── PersianGulfWater — REARQUITECTURA LIMPIA ───────────────────────────
//
// Diseño:
//   1) Custom ShaderMaterial — NO Three.js Water, NO Reflector, NO planar
//      reflection. Reflector RT no escala bien a 2000km de mesh y daba
//      reflection texture inconsistente.
//   2) Reflexión y horizonte ambos sampleados del MISMO HDRI (scene.bg).
//      Por qué: si el reflejo del water y el horizonte del sky vienen
//      de la misma fuente, en la zona de transición match exacto → cero
//      halo, cero línea visible.
//   3) Aerial perspective basado en curvatura terrestre: a baja altura,
//      el water se funde al horizonte físico (~50km a 200m de altura);
//      a altura, el rango es mucho mayor.
//   4) Animación con uTime en UV scroll de waternormals.jpg (3 octavas
//      multi-escala con dirección de viento unificada → motion claro).
//   5) Water mask por satellite z10 → islas y costas sin inundación.
//   6) Estable a cambios de weather: scene.background change solo dispara
//      update del uniform uHdriMap, NO recrea el material → sin shader
//      cascade errors.

const EARTH_CIRC = 40075016.686;
const EARTH_RADIUS = 6371000;

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
const SNAP_Z10 = tileSnapOffset(TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON, WT_OUTER_ZOOM);

const VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorldPos;

uniform float uTime;
uniform sampler2D uNormalsMap;
uniform sampler2D uMaskMap;
uniform sampler2D uHdriMap;
uniform float uMaskCenterX;
uniform float uMaskCenterZ;
uniform float uMaskSize;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uWaterDeepColor;
uniform float uDistortion;

const float PI = 3.14159265359;

// Equirect sample del HDRI. CONVENCIÓN Three.js: v = asin(y)/π + 0.5.
// Antes usaba acos (V invertido) → mis samples salían en distinta UV
// que la background HDRI de Three.js → mismatch en alpha blend = halo.
vec3 sampleHdri(vec3 dir) {
  vec2 uv = vec2(
    atan(dir.z, dir.x) / (2.0 * PI) + 0.5,
    asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5
  );
  return texture2D(uHdriMap, uv).rgb;
}

void main() {
  // ─── 1. Water mask: discard si no es agua según satellite z10 ──────
  vec2 maskUv = vec2(
    0.5 + (vWorldPos.x - uMaskCenterX) / uMaskSize,
    0.5 + (vWorldPos.z - uMaskCenterZ) / uMaskSize
  );
  if (maskUv.x < 0.0 || maskUv.x > 1.0 || maskUv.y < 0.0 || maskUv.y > 1.0) discard;
  vec4 maskColor = texture2D(uMaskMap, maskUv);
  bool isWater = (maskColor.b > maskColor.r + 0.02)
              && (maskColor.b > 0.10)
              && (maskColor.b > maskColor.g - 0.10);
  if (!isWater) discard;

  // ─── 2. Wave normal: 3 octavas con scroll en dirección de viento ───
  vec2 wp = vWorldPos.xz;
  vec2 windDir = normalize(vec2(1.0, 0.6));
  vec2 uv1 = wp / 6.0   + windDir * uTime * 0.40;  // chop 6m
  vec2 uv2 = wp / 25.0  + windDir * uTime * 0.20;  // wave 25m
  vec2 uv3 = wp / 100.0 + windDir * uTime * 0.10;  // swell 100m
  vec3 n1 = texture2D(uNormalsMap, uv1).rgb * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormalsMap, uv2).rgb * 2.0 - 1.0;
  vec3 n3 = texture2D(uNormalsMap, uv3).rgb * 2.0 - 1.0;
  vec3 nTS = normalize(n1 * 0.4 + n2 * 0.7 + n3 * 1.0);

  // Tangent space → world (plano con normal +Y):
  // T=+X, B=+Z, N=+Y → world = (nTS.x, nTS.z, nTS.y)
  vec3 worldN = normalize(vec3(nTS.x * uDistortion, 1.0, nTS.y * uDistortion));

  // ─── 3. Reflexión del HDRI ────────────────────────────────────────
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 reflDir = reflect(-viewDir, worldN);
  reflDir.y = max(reflDir.y, 0.02);  // clamp arriba para no samplear suelo
  vec3 reflectionColor = sampleHdri(reflDir);

  // ─── 4. Fresnel (Schlick) ─────────────────────────────────────────
  float cosT = max(0.0, dot(worldN, viewDir));
  float fresnel = mix(0.02, 1.0, pow(1.0 - cosT, 5.0));

  // ─── 5. Sun specular ─────────────────────────────────────────────
  vec3 H = normalize(uSunDir + viewDir);
  float spec = pow(max(0.0, dot(worldN, H)), 100.0);

  // ─── 6. Color combinado: agua profunda + reflexión + sun glint ───
  vec3 effectColor = mix(uWaterDeepColor, reflectionColor, fresnel)
                   + uSunColor * spec * 1.5;

  // ─── 7. Discard radical en horizonte físico, sin fade ─────────────
  // Cualquier fade radial (smoothstep por distancia) crea un anillo
  // circular visible desde ángulos oblicuos = halo elíptico. La única
  // forma de eliminar TODO halo es discard hard al horizonte exacto.
  // Por curvatura terrestre: drop = d²/(2R) supera camY → invisible.
  vec2 xzDelta = vWorldPos.xz - cameraPosition.xz;
  float dist = length(xzDelta);
  float earthDrop = (dist * dist) / (2.0 * 6371000.0);
  if (earthDrop > cameraPosition.y) discard;

  // Output directo del effect — sin aerial perspective, sin fade.
  float alpha = mix(0.5, 0.95, fresnel);
  gl_FragColor = vec4(effectColor, alpha);
}
`;

export default function PersianGulfWater({
  size = 2000000,
  y = 0,
  centerX = 0,
  centerZ = 70000,
}) {
  const { scene } = useThree();
  const [outerSat, setOuterSat] = useState(null);
  const [hdri, setHdri] = useState(null);

  // Buscar outer satellite (water mask source)
  useEffect(() => {
    let raf;
    const find = () => {
      let outerMesh = null;
      scene.traverse(o => {
        if (
          o.isMesh &&
          o.geometry?.parameters?.width > 1000000 &&
          o.geometry?.parameters?.width < 1500000 &&
          o.material?.type === "MeshStandardMaterial" &&
          o.material?.map
        ) outerMesh = o;
      });
      if (outerMesh) { setOuterSat(outerMesh.material.map); return; }
      raf = requestAnimationFrame(find);
    };
    find();
    return () => raf && cancelAnimationFrame(raf);
  }, [scene]);

  // Inicial scene.background load (HDRI). Después: update vía useFrame.
  useEffect(() => {
    let raf;
    const find = () => {
      if (scene.background && scene.background.isTexture) {
        setHdri(scene.background);
        return;
      }
      raf = requestAnimationFrame(find);
    };
    find();
    return () => raf && cancelAnimationFrame(raf);
  }, [scene]);

  const waterNormals = useMemo(() => {
    const t = new THREE.TextureLoader().load("/textures/water/waternormals.jpg");
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
    return t;
  }, []);

  // Material creado UNA SOLA VEZ con todos los uniforms iniciales.
  // Cambios de HDRI (weather) → solo update del uniform, NO recrear.
  // Esto evita el shader cascade error que se daba al recompilar.
  const material = useMemo(() => {
    if (!outerSat || !hdri) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime:           { value: 0 },
        uNormalsMap:     { value: waterNormals },
        uMaskMap:        { value: outerSat },
        uHdriMap:        { value: hdri },
        uMaskCenterX:    { value: -SNAP_Z10.x },
        uMaskCenterZ:    { value: -SNAP_Z10.z },
        uMaskSize:       { value: WT_OUTER_WORLD_SIZE },
        uSunDir:         { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() },
        uSunColor:       { value: new THREE.Color(0xfff0c8) },
        uWaterDeepColor: { value: new THREE.Color(0x0a1828) },
        uDistortion:     { value: 0.6 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    // Solo crea con outerSat y hdri iniciales. HDRI updates después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outerSat, waterNormals]);

  // Animation + update uniforms sin recrear material.
  useFrame((_, dt) => {
    if (!material) return;
    material.uniforms.uTime.value += dt;
    // Si scene.background cambió (cambio de weather), update uHdri uniform.
    const bg = scene.background;
    if (bg && bg.isTexture && material.uniforms.uHdriMap.value !== bg) {
      material.uniforms.uHdriMap.value = bg;
    }
  });

  useEffect(() => {
    return () => {
      if (material) material.dispose();
      waterNormals.dispose();
    };
  }, [material, waterNormals]);

  if (!material) return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[centerX, y, centerZ]}
      renderOrder={2}
    >
      <planeGeometry args={[size, size, 1, 1]} />
      <primitive attach="material" object={material} />
    </mesh>
  );
}
