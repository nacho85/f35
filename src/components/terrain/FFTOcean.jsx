"use client";

// FFTOcean — agua basada en FFT (Tessendorf style, à la DCS / War Thunder).
//
// Etapa actual (fase 4 - proof of concept):
//   - Una sola cascade (patchSize=1000, N=256).
//   - Plano de 2km centrado en la cámara, 256×256 segmentos.
//     El patch FFT (1km) tilea naturalmente porque la salida de la FFT es
//     periódica → mod(worldXZ, patchSize) en el vertex shader.
//   - Vertex shader desplaza Y leyendo spatialHxTarget.
//   - Fragment shader: shading básico Fresnel + sun specular + base color.
//   - Mask coastline aplicado igual que OceanWater.jsx.
//
// Pendiente (fase 5): multi-cascade (3 patchSizes) + manto lejano estático.

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { OceanFFT } from "./ocean/oceanFFT";
import { getSharedCoastlineSDF } from "./coastlineSDFTexture";

const MASK_WORLD_SIZE = 400000;

const VERT = /* glsl */ `
  precision highp float;

  // Cascade BIG (long swells)
  uniform sampler2D uSpatialHxBig;
  uniform float     uPatchSizeBig;
  // Cascade SMALL (chop)
  uniform sampler2D uSpatialHxSmall;
  uniform float     uPatchSizeSmall;
  uniform float     uSmallWeight;
  uniform vec3      uCameraPosVtx;

  varying vec3 vWorldPos;
  varying float vHeight;

  #include <common>
  #include <logdepthbuf_pars_vertex>
  #include <fog_pars_vertex>

  void main() {
    vec4 mvPosition;
    // World XZ del vértice (sin desplazar)
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;

    // Multi-cascade: sumar altura de los dos FFT patches con distance fade
    float distToCamV = length(uCameraPosVtx - wp);
    float smallFadeV = 1.0 - smoothstep(1500.0, 6000.0, distToCamV);
    float bigFadeV   = 1.0 - smoothstep(15000.0, 60000.0, distToCamV);
    float hBig   = texture2D(uSpatialHxBig,   fract(wp.xz / uPatchSizeBig)).r * bigFadeV;
    float hSmall = texture2D(uSpatialHxSmall, fract(wp.xz / uPatchSizeSmall)).r * uSmallWeight * smallFadeV;
    float height = hBig + hSmall;

    // Vertex displacement (Y). Útil cuando vertex density es alta.
    vec3 displaced = position;
    displaced.y += height;

    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldPos.xyz;
    vHeight = height;

    mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uMaskMap;
  uniform float     uMaskWorldSize;
  uniform float     uPlaneHalfSize;
  uniform vec3      uSunDir;
  uniform vec3      uSunColor;
  uniform vec3      uShallowColor;
  uniform vec3      uDeepColor;
  uniform vec3      uSkyColor;
  uniform vec3      uCameraPosW;
  uniform float     uDebug;
  uniform sampler2D uSpatialHxBig;
  uniform sampler2D uSpatialHzBig;
  uniform float     uPatchSizeBig;
  uniform sampler2D uSpatialHxSmall;
  uniform sampler2D uSpatialHzSmall;
  uniform float     uPatchSizeSmall;
  uniform float     uSmallWeight;
  uniform samplerCube uEnvMap;     // HDRI cubemap (convertido de equirect)
  uniform float     uEnvIntensity; // exposure scalar
  uniform float     uHasEnv;       // 1.0 si uEnvMap está cargado
  uniform sampler2D uCoastDist;    // (legacy, no usado con SDF)
  uniform float     uCoastDistSize;
  uniform sampler2D uCoastColor;
  uniform float     uHasCoastColor;
  uniform sampler2D uCoastSDF;     // SDF: 128=costa, >128=water
  uniform float     uHasSDF;
  uniform float     uTime;          // tiempo para animación de foam y waves

  varying vec3 vWorldPos;
  varying float vHeight;

  #include <common>
  #include <logdepthbuf_pars_fragment>
  #include <fog_pars_fragment>

  void main() {
    // Mask satellite-water: pre-bake offline que combina OSM coastline +
    // heurística de color sobre los satellite tiles. Matchea exactamente
    // donde el terreno discarda en runtime (mismo applyWaterDiscard logic).
    // Fuera del rango del mask (lejano del centro), asume agua por defecto.
    vec2 maskUv = vec2(
      0.5 + vWorldPos.x / uMaskWorldSize,
      0.5 - vWorldPos.z / uMaskWorldSize
    );
    bool insideMask = (maskUv.x >= 0.0 && maskUv.x <= 1.0 &&
                       maskUv.y >= 0.0 && maskUv.y <= 1.0);
    float maskAlpha = 1.0;
    // SDF blureado compartido entre maskAlpha y coastDist (mismo UV, ambas usan).
    // Early-out: en deep water (centro del SDF >> coast), no hace falta blur.
    float sdfBlurred = 1.0;
    if (uHasSDF > 0.5) {
      float sdfCenter = texture2D(uCoastSDF, maskUv).r;
      if (sdfCenter > 0.65) {
        // Far from coast — saltar 8 samples, usar el centro directo.
        sdfBlurred = sdfCenter;
      } else {
        // Cerca de costa — 9-tap Gaussiano para suavizar chebyshev.
        const float MA_OFF = 1.25e-4;
        float n0  = texture2D(uCoastSDF, maskUv + vec2(0.0,  MA_OFF)).r;
        float s0  = texture2D(uCoastSDF, maskUv + vec2(0.0, -MA_OFF)).r;
        float e0  = texture2D(uCoastSDF, maskUv + vec2( MA_OFF, 0.0)).r;
        float w0  = texture2D(uCoastSDF, maskUv + vec2(-MA_OFF, 0.0)).r;
        float ne0 = texture2D(uCoastSDF, maskUv + vec2( MA_OFF,  MA_OFF)).r;
        float nw0 = texture2D(uCoastSDF, maskUv + vec2(-MA_OFF,  MA_OFF)).r;
        float se0 = texture2D(uCoastSDF, maskUv + vec2( MA_OFF, -MA_OFF)).r;
        float sw0 = texture2D(uCoastSDF, maskUv + vec2(-MA_OFF, -MA_OFF)).r;
        sdfBlurred = sdfCenter * 0.25
                   + (n0 + s0 + e0 + w0) * 0.125
                   + (ne0 + nw0 + se0 + sw0) * 0.0625;
      }
      // FFT extendido 1% (~6m mundo) hacia la costa + fade 15m mundo + 50px screen.
      const float EXT = 0.1;
      float worldFade = smoothstep(0.502 - EXT, 0.551 - EXT, sdfBlurred);
      float aa = fwidth(sdfBlurred) * 25.0;
      float screenFade = smoothstep(0.502 - EXT - aa, 0.502 - EXT + aa * 0.5, sdfBlurred);
      maskAlpha = min(worldFade, screenFade);
      if (maskAlpha < 0.01) discard;
    } else if (insideMask) {
      // Fallback al mask anterior si SDF no cargó
      float maskVal = texture2D(uMaskMap, maskUv).r;
      maskAlpha = smoothstep(0.45, 0.55, maskVal);
      if (maskAlpha < 0.01) discard;
    }

    // Per-pixel normal: slopes sumados de las dos cascades.
    // Distance-based fade: a medida que el pixel se aleja de la cámara, las
    // olas chicas (small cascade) se aplastan para evitar aliasing perspectivo
    // ("auroras boreales"). Las olas grandes (big cascade) también se suavizan
    // a distancia muy grande pero más gradual.
    float distToCam = length(uCameraPosW - vWorldPos);
    float smallFade = 1.0 - smoothstep(1500.0, 6000.0, distToCam);
    float bigFade   = 1.0 - smoothstep(15000.0, 60000.0, distToCam);

    vec2 puvBig   = fract(vWorldPos.xz / uPatchSizeBig);
    vec2 puvSmall = fract(vWorldPos.xz / uPatchSizeSmall);
    float dhdx = texture2D(uSpatialHxBig, puvBig).b * bigFade
               + texture2D(uSpatialHxSmall, puvSmall).b * uSmallWeight * smallFade;
    float dhdz = texture2D(uSpatialHzBig, puvBig).b * bigFade
               + texture2D(uSpatialHzSmall, puvSmall).b * uSmallWeight * smallFade;
    vec3 N = normalize(vec3(-dhdx, 1.0, -dhdz));
    vec3 V = normalize(uCameraPosW - vWorldPos);
    vec3 L = normalize(uSunDir);
    vec3 H = normalize(L + V);

    // Fresnel (Schlick) — water IOR ~1.33 → F0 ≈ 0.02
    float F0 = 0.02;
    float NdotV = max(dot(N, V), 0.0);
    float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

    // Specular sun. Atenuar a distancia (con bigFade ya lo aproxima por el N)
    // pero forzamos extra fade para evitar sun-glint streaks en el horizonte.
    float specFade = 1.0 - smoothstep(3000.0, 15000.0, distToCam);
    float NdotH = max(dot(N, H), 0.0);
    float spec = pow(NdotH, 256.0) * specFade;

    // Base water color: shallow (cerca de costa) → deep (offshore) según el
    // coast-distance mask. Adicionalmente mezclamos un poquito con el ángulo
    // (NdotV) para mantener el look de "horizonte más oscuro".
    vec2 cdUv = vec2(
      0.5 + vWorldPos.x / uCoastDistSize,
      0.5 - vWorldPos.z / uCoastDistSize
    );
    // coastDist desde SDF: byte 128 = costa (0), byte 255 = +25 SDF units
    // ≈ 600m offshore. Mapeamos a [0,1] para shallow→deep gradient.
    float coastDist = 1.0;
    if (uHasSDF > 0.5) {
      // Reusa sdfBlurred ya computado arriba (mismo UV → mismo valor).
      coastDist = clamp((sdfBlurred - 0.5) * 2.0, 0.0, 1.0);
    } else if (cdUv.x >= 0.0 && cdUv.x <= 1.0 && cdUv.y >= 0.0 && cdUv.y <= 1.0) {
      coastDist = texture2D(uCoastDist, cdUv).r;
    }
    // Shallow color: sampleado del coast-color regional (basado en satélite)
    // si está disponible, fallback al uniform sino.
    vec3 shallowCol = uShallowColor;
    if (uHasCoastColor > 0.5) {
      shallowCol = texture2D(uCoastColor, cdUv).rgb;
    }
    // Cerca de la costa: el FFT toma el color LOCAL del satélite (coast-color
    // bakeado del satélite mismo) sin oscurecimiento por Beer-Lambert. Eso da
    // continuidad cromática perfecta con la satelital — la transición FFT↔sat
    // se vuelve invisible porque ambos comparten el color regional.
    // Más allá de cierta distancia, transición a deep color.
    // shallowMix: 0 cerca de costa (puro coast-color), 1 lejos (deep dominate)
    float shallowMix = smoothstep(0.05, 0.45, coastDist);

    // Sin bump de saturación — provocaba bloques cyan saturados.
    vec3 shallowSat = shallowCol;

    // Beer-Lambert solo para la zona offshore — atenúa luz al ir profundo
    vec3 absorption = vec3(0.85, 0.45, 0.20);
    vec3 transmittance = exp(-absorption * coastDist * 4.0);
    vec3 deep = mix(shallowSat, uDeepColor, 1.0 - transmittance.b);

    // byDistance: shallow puro cerca de costa, transición a deep offshore
    vec3 byDistance = mix(shallowSat, deep, shallowMix);

    // Subsurface scatter
    float NdotL = max(dot(N, L), 0.0);
    float backLight = pow(max(dot(-V, refract(-L, N, 1.0/1.33)), 0.0), 2.0);
    vec3 subsurface = byDistance * (0.5 + 0.5 * NdotL) + uSunColor * backLight * 0.15 * (1.0 - coastDist);
    vec3 baseWater = mix(byDistance, subsurface, 0.5);

    // Reflexión: vector reflejado de la vista alrededor de la wave normal.
    // Si tenemos HDRI, sampleamos equirectangular. Si no, fallback al color
    // uniforme uSkyColor.
    // A distancia, mezclamos el sample HDRI hacia un color promedio del cielo
    // para evitar que los pixeles del horizonte saturen el sample en el sol
    // (que crea "haces de luz" streaking).
    vec3 R = reflect(-V, N);
    vec3 reflectColor;
    if (uHasEnv > 0.5) {
      // Cubemap sampling — hardware-accelerated, sin atan/asin per fragment.
      reflectColor = textureCube(uEnvMap, R).rgb * uEnvIntensity;
      // Soft clamp para evitar over-bright del HDRI sin tone mapping
      reflectColor = reflectColor / (1.0 + reflectColor);
      reflectColor *= 2.0;
      // Distance-fade: mezclar hacia un sky tint plano a distancia. Saca
      // streaking de sun/cloud edges en el horizonte.
      float reflectFade = 1.0 - smoothstep(2000.0, 12000.0, distToCam);
      reflectColor = mix(uSkyColor, reflectColor, reflectFade);
    } else {
      reflectColor = uSkyColor;
    }

    // Foam en crestas: detectamos pixeles donde la wave normal está muy
    // tilted (crest sharp) Y la altura está alta. Eso son las olas rompiendo
    // o crestas filosas — agregamos foam blanco animado.
    float waveSlopeMag = length(vec2(dhdx, dhdz));
    float crestHeight = max(vHeight, 0.0);
    // foam factor: alto donde slope >0.5 y altura >0.3m
    float foamFactor = smoothstep(0.5, 0.9, waveSlopeMag) * smoothstep(0.2, 0.6, crestHeight);
    // Atenuar foam con distancia para no saturar a lejos
    foamFactor *= bigFade;

    // Combine: base × (1 - fresnel) + reflection × fresnel + sun specular + foam
    vec3 color = baseWater * (1.0 - fresnel)
               + reflectColor * fresnel
               + uSunColor * spec * 1.2;
    color = mix(color, vec3(1.0, 1.0, 0.97), foamFactor * 0.7);

    // Edge fade del plano
    float dx = abs(vWorldPos.x);
    float dz = abs(vWorldPos.z);
    float maxDist = max(dx, dz);
    float edgeFade = 1.0 - smoothstep(uPlaneHalfSize * 0.60, uPlaneHalfSize * 0.95, maxDist);

    if (uDebug > 0.5) {
      // Modo debug: log-scale para detectar señales chicas.
      // Verde si >0, rojo si <0. Si todo es uniforme, hay bug en pipeline.
      float h = vHeight;
      float ah = abs(h);
      // mapeo logarítmico: 1e-6 → 0.1, 1e-3 → 0.5, 1.0 → 1.0
      float bright = clamp((log(ah + 1e-6) + 14.0) / 14.0, 0.0, 1.0);
      vec3 dbg = h > 0.0
        ? vec3(0.0, bright, 0.0)
        : vec3(bright, 0.0, 0.0);
      gl_FragColor = vec4(dbg, 1.0);
    } else {
      gl_FragColor = vec4(color, edgeFade * maskAlpha);
    }

    #include <logdepthbuf_fragment>
    #include <fog_fragment>
  }
`;

export default function FFTOcean({
  size = 4000,
  segments = 256,
  patchSize = 1000,
  resolution = 256,
  windDir = new THREE.Vector2(1.0, 0.4),
  windSpeed = 18,
  phillipsA = 3e-3,
  debug = false,
  y = -2,
  followCamera = true,
}) {
  const { gl, scene, camera } = useThree();
  const [maskTex, setMaskTex] = useState(null);
  const [coastDistTex, setCoastDistTex] = useState(null);
  const [coastColorTex, setCoastColorTex] = useState(null);
  const [coastSDFTex, setCoastSDFTex] = useState(null);
  const fftBigRef = useRef(null);
  const fftSmallRef = useRef(null);
  const meshRef = useRef(null);

  // HDRI cargado como equirect, luego convertido a cubemap nativo.
  // Cubemap sampling usa hardware (textureCube) — no requiere atan/asin
  // per fragment, mucho más rápido que el equirect 2D anterior.
  const [envTex, setEnvTex] = useState(null);
  useEffect(() => {
    new HDRLoader().load("/textures/sky/qwantani_4k.hdr", (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      const target = new THREE.WebGLCubeRenderTarget(512);
      target.fromEquirectangularTexture(gl, t);
      target.texture.generateMipmaps = false;
      target.texture.minFilter = THREE.LinearFilter;
      target.texture.magFilter = THREE.LinearFilter;
      setEnvTex(target.texture);
      t.dispose();
    });
  }, [gl]);

  useEffect(() => {
    new THREE.TextureLoader().load("/textures/water/satellite-water-mask.png", (t) => {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      setMaskTex(t);
    });
    new THREE.TextureLoader().load("/textures/water/coast-distance.png", (t) => {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      setCoastDistTex(t);
    });
    new THREE.TextureLoader().load("/textures/water/coast-color.png", (t) => {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      setCoastColorTex(t);
    });
    // SDF compartido con OrmuzTerrain — una sola texture GPU.
    const sharedRef = getSharedCoastlineSDF();
    const tick = () => {
      if (sharedRef.value) setCoastSDFTex(sharedRef.value);
      else _rafId = requestAnimationFrame(tick);
    };
    let _rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(_rafId);
  }, []);

  // Multi-cascade: 2 OceanFFT instances con distintos patchSize y seed.
  // Sumadas, rompen el patrón visible que se nota desde altura cuando un
  // único patchSize tiene un dominant wavelength que tessella.
  useEffect(() => {
    if (!gl) return;
    const w = windDir.clone().normalize().multiplyScalar(windSpeed);
    const setupTargetTexture = (target) => {
      target.texture.minFilter = THREE.LinearFilter;
      target.texture.magFilter = THREE.LinearFilter;
      target.texture.wrapS = THREE.RepeatWrapping;
      target.texture.wrapT = THREE.RepeatWrapping;
      target.texture.needsUpdate = true;
    };
    const big = new OceanFFT({
      renderer: gl,
      resolution,
      patchSize,                          // grande: long swells (default 2000m)
      wind: w,
      phillipsA,
      seed: new THREE.Vector2(13.7, 92.1),
    });
    const small = new OceanFFT({
      renderer: gl,
      resolution,
      patchSize: patchSize / 16,           // chico: chop (~125m)
      wind: w,
      phillipsA: phillipsA * 0.6,          // amplitud menor para no dominar
      seed: new THREE.Vector2(47.3, 28.5), // seed distinta → no se alinea
    });
    setupTargetTexture(big.spatialHxTarget);
    setupTargetTexture(big.spatialHzTarget);
    setupTargetTexture(small.spatialHxTarget);
    setupTargetTexture(small.spatialHzTarget);
    fftBigRef.current = big;
    fftSmallRef.current = small;
    return () => {
      big.dispose();
      small.dispose();
      fftBigRef.current = null;
      fftSmallRef.current = null;
    };
  }, [gl, resolution, patchSize, phillipsA, windSpeed]);

  const material = useMemo(() => {
    if (!maskTex) return null;
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      fog: true,
      depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
        uSpatialHxBig:    { value: null },
        uSpatialHzBig:    { value: null },
        uPatchSizeBig:    { value: patchSize },
        uSpatialHxSmall:  { value: null },
        uSpatialHzSmall:  { value: null },
        uPatchSizeSmall:  { value: patchSize / 16 },
        uSmallWeight:     { value: 0.6 },
        uCameraPosVtx:    { value: new THREE.Vector3() },
        uChoppy:        { value: 0.0 }, // off por ahora
        uOriginXZ:      { value: new THREE.Vector2() },
        uMaskMap:       { value: maskTex },
        uMaskWorldSize: { value: MASK_WORLD_SIZE },
        uPlaneHalfSize: { value: size / 2 },
        uSunDir:        { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() },
        uSunColor:      { value: new THREE.Color(0xfff0c8) },
        uShallowColor:  { value: new THREE.Color(0x4cb5c4) },
        uDeepColor:     { value: new THREE.Color(0x0a3050) },
        uSkyColor:      { value: new THREE.Color(0x90b8d8) },
        uCameraPosW:    { value: new THREE.Vector3() },
        uDebug:         { value: debug ? 1.0 : 0.0 },
        uEnvMap:        { value: null },
        uEnvIntensity:  { value: 1.0 },
        uHasEnv:        { value: 0.0 },
        uCoastDist:     { value: null },
        uCoastDistSize: { value: 400000 },
        uCoastColor:    { value: null },
        uHasCoastColor: { value: 0.0 },
        uCoastSDF:      { value: null },
        uHasSDF:        { value: 0.0 },
        uTime:          { value: 0.0 },
        }
      ]),
    });
  }, [maskTex, patchSize, size]);

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, segments, segments);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [size, segments]);

  useEffect(() => {
    if (!material || !geometry) return;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    meshRef.current = mesh;
    scene.add(mesh);
    return () => { scene.remove(mesh); geometry.dispose(); material.dispose(); };
  }, [material, geometry, y, scene]);

  useFrame(({ clock, camera }) => {
    const big = fftBigRef.current;
    const small = fftSmallRef.current;
    const mesh = meshRef.current;
    if (!big || !small || !mesh || !material) return;
    big.update(clock.elapsedTime);
    small.update(clock.elapsedTime);
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uSpatialHxBig.value = big.spatialHxTarget.texture;
    material.uniforms.uSpatialHzBig.value = big.spatialHzTarget.texture;
    material.uniforms.uSpatialHxSmall.value = small.spatialHxTarget.texture;
    material.uniforms.uSpatialHzSmall.value = small.spatialHzTarget.texture;
    material.uniforms.uCameraPosW.value.copy(camera.position);
    material.uniforms.uCameraPosVtx.value.copy(camera.position);
    if (envTex && material.uniforms.uEnvMap.value !== envTex) {
      material.uniforms.uEnvMap.value = envTex;
      material.uniforms.uHasEnv.value = 1.0;
    }
    if (coastDistTex && material.uniforms.uCoastDist.value !== coastDistTex) {
      material.uniforms.uCoastDist.value = coastDistTex;
    }
    if (coastColorTex && material.uniforms.uCoastColor.value !== coastColorTex) {
      material.uniforms.uCoastColor.value = coastColorTex;
      material.uniforms.uHasCoastColor.value = 1.0;
    }
    if (coastSDFTex && material.uniforms.uCoastSDF.value !== coastSDFTex) {
      material.uniforms.uCoastSDF.value = coastSDFTex;
      material.uniforms.uHasSDF.value = 1.0;
    }
    if (followCamera) {
      mesh.position.x = camera.position.x;
      mesh.position.z = camera.position.z;
    }
  });

  return null;
}
