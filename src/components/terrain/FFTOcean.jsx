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
  // Cascade MID (medium waves)
  uniform sampler2D uSpatialHxMid;
  uniform float     uPatchSizeMid;
  uniform float     uMidWeight;
  // Cascade SMALL (chop)
  uniform sampler2D uSpatialHxSmall;
  uniform float     uPatchSizeSmall;
  uniform float     uSmallWeight;
  uniform vec3      uCameraPosVtx;
  uniform float     uDispScale;        // 1=close (con displacement), 0=far (flat)

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
    float midFadeV   = 1.0 - smoothstep(5000.0, 20000.0, distToCamV);
    float bigFadeV   = 1.0 - smoothstep(15000.0, 60000.0, distToCamV);
    float hBig   = texture2D(uSpatialHxBig,   fract(wp.xz / uPatchSizeBig)).r * bigFadeV;
    float hMid   = texture2D(uSpatialHxMid,   fract(wp.xz / uPatchSizeMid)).r * uMidWeight * midFadeV;
    float hSmall = texture2D(uSpatialHxSmall, fract(wp.xz / uPatchSizeSmall)).r * uSmallWeight * smallFadeV;
    float height = (hBig + hMid + hSmall) * uDispScale;

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
  uniform sampler2D uSpatialHxMid;
  uniform sampler2D uSpatialHzMid;
  uniform float     uPatchSizeMid;
  uniform float     uMidWeight;
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
  uniform sampler2D uNormalMap;    // Normal map de alta frecuencia (waternormals)
  uniform float     uHasNormalMap;
  uniform float     uCoastWaveAngle;    // radians: rotación adicional del bias hacia-costa
  uniform float     uCoastFoamAmount;   // 0-1: cantidad de foam costera
  uniform float     uOffshoreFoamAmount;// 0-1: cantidad de foam offshore (windward)
  uniform float     uTime;          // tiempo para animación de foam y waves
  uniform float     uHorizonElev;    // sky bias (sin(elev)) para sample HDRI horizon
  uniform float     uHorizonClamp;   // pre-clamp del HDRI sample antes del tonemap

  varying vec3 vWorldPos;
  varying float vHeight;

  #include <common>
  #include <logdepthbuf_pars_fragment>
  #include <fog_pars_fragment>

  // Hash-based value noise 2D + FBM 4-octava para foam orgánico.
  float _hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float _vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(_hash21(i + vec2(0.0, 0.0)), _hash21(i + vec2(1.0, 0.0)), u.x),
               mix(_hash21(i + vec2(0.0, 1.0)), _hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float _fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * _vnoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

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
    // Solo samplear SDF si el fragment está DENTRO del rango cubierto por el
    // asset (400km × 400km centrado en origen). Fuera, ClampToEdge devuelve
    // el píxel del borde — que en norte/oeste es tierra de Irán → discard
    // erróneo → corte recto en el agua lejos del origen. Fuera del SDF
    // asumimos agua deep (maskAlpha=1, sdfBlurred=1).
    if (uHasSDF > 0.5 && insideMask) {
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
    // Fade de slopes per-pixel: generoso para que olas/foam sigan visibles
    // en agua lejana. 3 cascades = 3 fade ranges.
    float smallFade = 1.0 - smoothstep(8000.0, 50000.0, distToCam);
    float midFade   = 1.0 - smoothstep(30000.0, 150000.0, distToCam);
    float bigFade   = 1.0 - smoothstep(80000.0, 400000.0, distToCam);

    // Domain warp: perturbo el world position con noise low-freq antes del
    // fract → tile boundaries rectos se vuelven curvos. Hash inline.
    vec2 wp_xz = vWorldPos.xz;
    vec2 dw = wp_xz * 0.0012; // ~800m wavelength
    vec2 dwi = floor(dw); vec2 dwf = fract(dw);
    // warpNX y warpNY usan SEEDS distintos → dos value-noise independientes.
    // Antes warpNY permutaba los mismos hashes de warpNX → se invertían en
    // los bordes de celda → grilla visible cada ~833m en el agua.
    float dhX00 = fract(sin(dot(dwi + vec2(0,0), vec2(127.1, 311.7))) * 43758.5);
    float dhX10 = fract(sin(dot(dwi + vec2(1,0), vec2(127.1, 311.7))) * 43758.5);
    float dhX01 = fract(sin(dot(dwi + vec2(0,1), vec2(127.1, 311.7))) * 43758.5);
    float dhX11 = fract(sin(dot(dwi + vec2(1,1), vec2(127.1, 311.7))) * 43758.5);
    float dhY00 = fract(sin(dot(dwi + vec2(0,0), vec2(269.5,  21.3))) * 39847.7);
    float dhY10 = fract(sin(dot(dwi + vec2(1,0), vec2(269.5,  21.3))) * 39847.7);
    float dhY01 = fract(sin(dot(dwi + vec2(0,1), vec2(269.5,  21.3))) * 39847.7);
    float dhY11 = fract(sin(dot(dwi + vec2(1,1), vec2(269.5,  21.3))) * 39847.7);
    vec2 dws = dwf * dwf * (3.0 - 2.0 * dwf);
    float warpNX = mix(mix(dhX00, dhX10, dws.x), mix(dhX01, dhX11, dws.x), dws.y);
    float warpNY = mix(mix(dhY00, dhY10, dws.x), mix(dhY01, dhY11, dws.x), dws.y);
    vec2 warpOffset = vec2(warpNX - 0.5, warpNY - 0.5) * 200.0; // ±100m offset
    vec2 wpWarp = wp_xz + warpOffset;

    vec2 puvBig   = fract(wpWarp / uPatchSizeBig);
    vec2 puvMid   = fract(wpWarp / uPatchSizeMid);
    vec2 puvSmall = fract(wpWarp / uPatchSizeSmall);
    float dhdx = texture2D(uSpatialHxBig, puvBig).b * bigFade
               + texture2D(uSpatialHxMid, puvMid).b * uMidWeight * midFade
               + texture2D(uSpatialHxSmall, puvSmall).b * uSmallWeight * smallFade;
    float dhdz = texture2D(uSpatialHzBig, puvBig).b * bigFade
               + texture2D(uSpatialHzMid, puvMid).b * uMidWeight * midFade
               + texture2D(uSpatialHzSmall, puvSmall).b * uSmallWeight * smallFade;
    vec3 N = normalize(vec3(-dhdx, 1.0, -dhdz));

    // Detail normal map: ondas sub-metro para shimmer. Cada octava sampea
    // en 2 UVs con rotaciones opuestas → tiling se cancela, patrón orgánico.
    if (uHasNormalMap > 0.5) {
      float dtFade = 1.0 - smoothstep(800.0, 3000.0, distToCam);
      mat2 R37  = mat2(0.7986, -0.6018, 0.6018, 0.7986);  // +37°
      mat2 Rm37 = mat2(0.7986,  0.6018,-0.6018, 0.7986);  // -37°
      mat2 R71  = mat2(0.3256, -0.9455, 0.9455, 0.3256);  // +71°
      mat2 Rm71 = mat2(0.3256,  0.9455,-0.9455, 0.3256);  // -71°

      vec2 baseT = vec2(uTime * 0.04, uTime * 0.025);
      vec2 a1 = (vWorldPos.xz)         / 18.0 + baseT;
      vec2 b1 = (R37 * vWorldPos.xz)   / 18.0 - baseT;
      vec2 a2 = (vWorldPos.xz)         / 6.0  + baseT * 1.3;
      vec2 b2 = (Rm37 * vWorldPos.xz)  / 6.0  - baseT * 1.3;
      vec2 a3 = (R71 * vWorldPos.xz)   / 2.0  + baseT * 1.7;
      vec2 b3 = (Rm71 * vWorldPos.xz)  / 2.0  - baseT * 1.7;

      vec3 n1 = (texture2D(uNormalMap, a1).rgb + texture2D(uNormalMap, b1).rgb) - 2.0;
      vec3 n2 = (texture2D(uNormalMap, a2).rgb + texture2D(uNormalMap, b2).rgb) - 2.0;
      vec3 n3 = (texture2D(uNormalMap, a3).rgb + texture2D(uNormalMap, b3).rgb) - 2.0;
      vec3 dnSum = n1 + n2 * 0.5 + n3 * 0.25;
      float strength = 0.4 * dtFade;
      N = normalize(vec3(N.x + dnSum.x * strength, N.y, N.z + dnSum.y * strength));
    }
    vec3 V = normalize(uCameraPosW - vWorldPos);
    vec3 L = normalize(uSunDir);
    vec3 H = normalize(L + V);

    // Fresnel (Schlick) — water IOR ~1.33 → F0 ≈ 0.02
    float F0 = 0.02;
    float NdotV = max(dot(N, V), 0.0);
    float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

    // Specular GGX (microfacet) — agua con roughness baja (~0.04) da
    // highlights brillantes pero con shape físicamente correcto.
    float specFade = 1.0 - smoothstep(3000.0, 15000.0, distToCam);
    float NdotH = max(dot(N, H), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float roughness = 0.04;
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH2 = NdotH * NdotH;
    float denom = NdotH2 * (a2 - 1.0) + 1.0;
    float D_ggx = a2 / (3.14159265 * denom * denom);
    // Geometry term de Schlick simplificado (k = (r+1)²/8)
    float k = (roughness + 1.0) * (roughness + 1.0) * 0.125;
    float G_v = NdotV / (NdotV * (1.0 - k) + k);
    float G_l = NdotL / (NdotL * (1.0 - k) + k);
    float G_ggx = G_v * G_l;
    float spec = D_ggx * G_ggx * fresnel * specFade / max(4.0 * NdotV * NdotL, 0.01);
    spec = clamp(spec, 0.0, 5.0);

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

    // Subsurface scatter (NdotL ya computado arriba para GGX)
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
      // reflectFade removido: reflexión HDRI activa en toda el agua (incluso
      // far ocean) para look uniforme.
    } else {
      reflectColor = uSkyColor;
    }

    // ── Foam basado en textura tileable ──
    // Sampleamos la textura de foam (luminancia = máscara) en world-space,
    // scrollada con uTime. Patrón orgánico, no blobs procedurales.
    float waveSlopeMag = length(vec2(dhdx, dhdz));
    float crestHeight = max(vHeight, 0.0);
    float foamFactor = 0.0;
    // ── Persistent foam buffer + foam texture ──
    // El buffer guarda intensidad de foam por punto del mundo, decaying en
    // el tiempo. La textura aporta el patrón visual (grietas/burbujas).
    // foam_visible = buffer_intensity × foam_texture_pattern
    // ── Foam derivada del FFT (Jacobian-style) ──
    // Foam aparece donde el slope del oleaje es alto + altura cresting.
    // Boost cerca de costa: las olas rompen al perder profundidad. Sin
    // texturas, sin chunks, sin tileo — derivado puramente de la física.
    {
      // Foam sigue la SHAPE de las olas — slope alto AND altura cresting.
      // Multiplier alto + thresholds bajos para que sea visible desde
      // cualquier ángulo (no solo cuando hay sun spec).
      // Modulamos con noise grande para que las crestas no foam-een TODAS
      // al mismo tiempo → algunas zonas activas, otras no.
      vec2 a = vWorldPos.xz * 0.004 + vec2(uTime * 0.03, -uTime * 0.025);
      vec2 ai = floor(a); vec2 af = fract(a);
      float aa00 = fract(sin(dot(ai + vec2(0,0), vec2(127.1, 311.7))) * 43758.5);
      float aa10 = fract(sin(dot(ai + vec2(1,0), vec2(127.1, 311.7))) * 43758.5);
      float aa01 = fract(sin(dot(ai + vec2(0,1), vec2(127.1, 311.7))) * 43758.5);
      float aa11 = fract(sin(dot(ai + vec2(1,1), vec2(127.1, 311.7))) * 43758.5);
      vec2 aas = af * af * (3.0 - 2.0 * af);
      float regionMask = mix(mix(aa00, aa10, aas.x), mix(aa01, aa11, aas.x), aas.y);
      regionMask = smoothstep(0.4, 0.7, regionMask); // ~30% del mar tiene foam
      // Foam ofrshore (windward, slope contra viento) + costera (hacia tierra).
      vec2 windHat = normalize(vec2(1.0, 0.4));
      float slopeProjOffshore = max(-(dhdx * windHat.x + dhdz * windHat.y), 0.0);
      float slopeProjCoast = 0.0;
      float coastWeight = 0.0;
      if (uHasSDF > 0.5) {
        const float SE = 2.5e-4;
        float sR = texture2D(uCoastSDF, maskUv + vec2( SE, 0.0)).r;
        float sL = texture2D(uCoastSDF, maskUv + vec2(-SE, 0.0)).r;
        float sU = texture2D(uCoastSDF, maskUv + vec2(0.0,  SE)).r;
        float sD = texture2D(uCoastSDF, maskUv + vec2(0.0, -SE)).r;
        vec2 nUv = vec2(sR - sL, sD - sU);
        float gradLen = length(nUv);
        if (gradLen > 1e-5) {
          vec2 coastNormal = normalize(vec2(nUv.x, -nUv.y));
          // Aplico rotación user-controlada (uCoastWaveAngle)
          float ca = cos(uCoastWaveAngle);
          float sa = sin(uCoastWaveAngle);
          vec2 rotN = vec2(ca * coastNormal.x - sa * coastNormal.y,
                           sa * coastNormal.x + ca * coastNormal.y);
          vec2 toCoast = -rotN;
          slopeProjCoast = max(dhdx * toCoast.x + dhdz * toCoast.y, 0.0);
          coastWeight = 1.0 - smoothstep(0.0, 0.13, coastDist);
        }
      }
      // Phase CONTINUO para offshore: value-noise smooth (~1200m wavelength)
      // en vez de floor() escalonado → animaciones a destiempo SIN cortes
      // visibles en los bordes de "regiones".
      vec2 ph = vWorldPos.xz / 1200.0;
      vec2 phi = floor(ph); vec2 phf = fract(ph);
      float ph00 = fract(sin(dot(phi + vec2(0,0), vec2(13.7, 92.1))) * 43758.5);
      float ph10 = fract(sin(dot(phi + vec2(1,0), vec2(13.7, 92.1))) * 43758.5);
      float ph01 = fract(sin(dot(phi + vec2(0,1), vec2(13.7, 92.1))) * 43758.5);
      float ph11 = fract(sin(dot(phi + vec2(1,1), vec2(13.7, 92.1))) * 43758.5);
      vec2 phs = phf * phf * (3.0 - 2.0 * phf);
      float regionPhase = mix(mix(ph00, ph10, phs.x), mix(ph01, ph11, phs.x), phs.y) * 30.0;
      float regionTime = uTime + regionPhase;
      vec2 c = vWorldPos.xz * 0.0023 + vec2(-regionTime * 0.022, regionTime * 0.018);
      vec2 ci = floor(c); vec2 cf = fract(c);
      float cc00 = fract(sin(dot(ci + vec2(0,0), vec2(419.2, 371.9))) * 43758.5);
      float cc10 = fract(sin(dot(ci + vec2(1,0), vec2(419.2, 371.9))) * 43758.5);
      float cc01 = fract(sin(dot(ci + vec2(0,1), vec2(419.2, 371.9))) * 43758.5);
      float cc11 = fract(sin(dot(ci + vec2(1,1), vec2(419.2, 371.9))) * 43758.5);
      vec2 ccs = cf * cf * (3.0 - 2.0 * cf);
      float offRegionN2 = mix(mix(cc00, cc10, ccs.x), mix(cc01, cc11, ccs.x), ccs.y);
      offRegionN2 = smoothstep(0.4, 0.7, offRegionN2);
      // Aplico solo al offshore — multiplica para que SOLO donde ambas masks
      // coinciden aparece foam → patches dispersos sin patrón continuo.
      float offRegion = regionMask * offRegionN2;

      // Coastal usa solo regionMask (su anim es independiente del offshore)
      float slopeWind = mix(
        slopeProjOffshore * offRegion * uOffshoreFoamAmount,
        slopeProjCoast    * regionMask * uCoastFoamAmount,
        coastWeight
      );
      float slopeFoam  = smoothstep(0.04, 0.15, slopeWind);
      // Sampleamos la altura del FFT en el FRAGMENT (no via vHeight) — así
      // funciona en far mesh también (uDispScale=0 → vHeight=0).
      float fragHeight = texture2D(uSpatialHxBig, puvBig).r * bigFade
                       + texture2D(uSpatialHxMid, puvMid).r * uMidWeight * midFade
                       + texture2D(uSpatialHxSmall, puvSmall).r * uSmallWeight * smallFade;
      float fragCrestH = max(fragHeight, 0.0);
      float heightFoam = smoothstep(0.02, 0.15, fragCrestH);
      // regionMask ya aplicada dentro del slopeWind mix — no multiplicar de nuevo
      foamFactor = clamp(slopeFoam * heightFoam * 8.0, 0.0, 1.0);
    }

    foamFactor *= bigFade;

    // Combine: base × (1 - fresnel) + reflection × fresnel + sun specular + foam
    vec3 color = baseWater * (1.0 - fresnel)
               + reflectColor * fresnel
               + uSunColor * spec * 4.0; // Sun specular fuerte → glitter pattern visible
    // Foam mix con curva sqrt — boost-ea valores chicos sin cortar nada.
    // Independiza visibilidad del color base (sun spec etc).
    float foamMix = clamp(pow(foamFactor, 0.5), 0.0, 1.0);
    color = mix(color, vec3(1.0, 1.0, 0.97), foamMix);

    // Edge fade RADIAL — distancia euclidea al centro del plano (cámara si
    // followCamera). Antes era max(dx,dz) → fade cuadrado con bordes rectos
    // alineados a los ejes, visibles como líneas diagonales en pantalla.
    float dx = vWorldPos.x - uCameraPosW.x;
    float dz = vWorldPos.z - uCameraPosW.z;
    float radDist = sqrt(dx * dx + dz * dz);
    float edgeFade = 1.0 - smoothstep(uPlaneHalfSize * 0.60, uPlaneHalfSize * 0.95, radDist);

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
      // ── Aerial perspective AAA ──
      // Agua lejana se atenúa exponencialmente y se mezcla hacia el color
      // del cielo MUESTREADO EN LA DIRECCIÓN del horizonte (no gris plano).
      // Densidad calibrada para fade-out en ~150km (visibilidad realista
      // a 15000m de altitud con aerosoles atmosféricos).
      vec3 toCam = vWorldPos - uCameraPosW;
      float distXZ = length(toCam.xz);
      // Atmósfera: density × scale_height_factor (más denso a baja altura).
      // ALT_FACTOR: 1 a sea level → 0.15 a 15km. Modela atmosphere thinning.
      float altFactor = exp(-max(0.0, uCameraPosW.y) / 8400.0);
      float opticalDepth = distXZ * 1.2e-4 * (0.3 + 0.7 * altFactor);
      float transmit = exp(-opticalDepth);
      // Horizon color = sample del HDRI cubemap en la dirección cámara→fragment.
      // Esto garantiza que el agua a distancia se funde EXACTAMENTE con el cielo
      // que está arriba en la misma dirección → línea horizonte invisible.
      // Fallback: azul Rayleigh saturado si HDRI no cargó.
      vec3 horizonColor;
      if (uHasEnv > 0.5) {
        vec3 _viewDir = normalize(vWorldPos - uCameraPosW);
        vec3 _skyDir = normalize(vec3(_viewDir.x, uHorizonElev, _viewDir.z));
        horizonColor = textureCube(uEnvMap, _skyDir).rgb * uEnvIntensity;
        horizonColor = min(horizonColor, vec3(uHorizonClamp));
        horizonColor = horizonColor / (1.0 + horizonColor);
        horizonColor *= 2.0;
      } else {
        horizonColor = vec3(0.42, 0.54, 0.69);
      }
      color = mix(horizonColor, color, transmit);
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
  windSpeed = 25,
  phillipsA = 6e-3,
  debug = false,
  y = -2,
  followCamera = true,
  coastWaveAngle = 0,
  coastFoamAmount = 1.0,
  offshoreFoamAmount = 1.0,
  horizonElev = 0.139,  // sin(8°)
  horizonClamp = 0.70,
}) {
  const { gl, scene, camera } = useThree();
  const [maskTex, setMaskTex] = useState(null);
  const [normalMapTex, setNormalMapTex] = useState(null);
  const [coastDistTex, setCoastDistTex] = useState(null);
  const [coastColorTex, setCoastColorTex] = useState(null);
  const [coastSDFTex, setCoastSDFTex] = useState(null);
  const fftBigRef = useRef(null);
  const fftMidRef = useRef(null);
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
    // Normal map fine-detail para shimmer del sol sobre micro-ondas.
    new THREE.TextureLoader().load("/textures/water/waternormals.jpg", (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      try { t.anisotropy = gl.capabilities.getMaxAnisotropy(); } catch (e) {}
      setNormalMapTex(t);
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
    // Direcciones distintas por cascade → previene reforzamiento en una sola
    // dirección dominante (que crea ese patrón de stripes diagonales).
    const rotateW = (vec, angleDeg) => {
      const a = (angleDeg * Math.PI) / 180;
      return new THREE.Vector2(
        vec.x * Math.cos(a) - vec.y * Math.sin(a),
        vec.x * Math.sin(a) + vec.y * Math.cos(a)
      );
    };
    const wMid = rotateW(w, 60);
    const wSmall = rotateW(w, -75);
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
    const mid = new OceanFFT({
      renderer: gl,
      resolution,
      patchSize: patchSize / 4,            // medio: ~500m
      wind: wMid,                          // dirección distinta → no reforzamiento
      phillipsA: phillipsA * 0.7,
      seed: new THREE.Vector2(31.2, 73.8),
    });
    const small = new OceanFFT({
      renderer: gl,
      resolution,
      patchSize: patchSize / 16,           // chico: chop (~125m)
      wind: wSmall,                        // dirección distinta → no reforzamiento
      phillipsA: phillipsA * 0.5,
      seed: new THREE.Vector2(47.3, 28.5),
    });
    setupTargetTexture(big.spatialHxTarget);
    setupTargetTexture(big.spatialHzTarget);
    setupTargetTexture(mid.spatialHxTarget);
    setupTargetTexture(mid.spatialHzTarget);
    setupTargetTexture(small.spatialHxTarget);
    setupTargetTexture(small.spatialHzTarget);
    fftBigRef.current = big;
    fftMidRef.current = mid;
    fftSmallRef.current = small;
    return () => {
      big.dispose();
      mid.dispose();
      small.dispose();
      fftBigRef.current = null;
      fftMidRef.current = null;
      fftSmallRef.current = null;
    };
  }, [gl, resolution, patchSize, phillipsA, windSpeed]);

  const material = useMemo(() => {
    if (!maskTex) return null;
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      fog: false, // usamos aerial perspective custom (HDRI directional) en el shader
      depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
        uSpatialHxBig:    { value: null },
        uSpatialHzBig:    { value: null },
        uPatchSizeBig:    { value: patchSize },
        uSpatialHxMid:    { value: null },
        uSpatialHzMid:    { value: null },
        uPatchSizeMid:    { value: patchSize / 4 },
        uMidWeight:       { value: 0.7 },
        uSpatialHxSmall:  { value: null },
        uSpatialHzSmall:  { value: null },
        uPatchSizeSmall:  { value: patchSize / 16 },
        uSmallWeight:     { value: 0.6 },
        uDispScale:       { value: 1.0 },
        uCameraPosVtx:    { value: new THREE.Vector3() },
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
        uNormalMap:     { value: null },
        uHasNormalMap:  { value: 0.0 },
        uCoastWaveAngle:    { value: 0.0 },
        uCoastFoamAmount:   { value: 1.0 },
        uOffshoreFoamAmount:{ value: 1.0 },
        uTime:          { value: 0.0 },
        uHorizonElev:   { value: horizonElev },
        uHorizonClamp:  { value: horizonClamp },
        }
      ]),
    });
  }, [maskTex, patchSize, size]);

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, segments, segments);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [size, segments]);

  // Far mesh: plano gigante estático cubriendo todo el gulf 1100km.
  // Mismo material, uDispScale=0 (sin displacement). Look uniforme.
  const farGeometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1100000, 1100000, 32, 32);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  useEffect(() => {
    if (!material || !geometry) return;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    // uDispScale=1 + uPlaneHalfSize=close half antes de renderizar el close
    mesh.onBeforeRender = () => {
      material.uniforms.uDispScale.value = 1.0;
      material.uniforms.uPlaneHalfSize.value = size / 2;
    };
    meshRef.current = mesh;
    scene.add(mesh);

    const farMesh = new THREE.Mesh(farGeometry, material);
    farMesh.position.y = y;
    farMesh.renderOrder = 1;
    farMesh.frustumCulled = false;
    farMesh.onBeforeRender = () => {
      material.uniforms.uDispScale.value = 0.0;
      // huge para que edgeFade nunca dispare en el far
      material.uniforms.uPlaneHalfSize.value = 10000000.0;
    };
    scene.add(farMesh);

    return () => {
      scene.remove(mesh);
      scene.remove(farMesh);
      geometry.dispose();
      farGeometry.dispose();
      material.dispose();
    };
  }, [material, geometry, farGeometry, y, scene, size]);

  useFrame(({ clock, camera }) => {
    const big = fftBigRef.current;
    const mid = fftMidRef.current;
    const small = fftSmallRef.current;
    const mesh = meshRef.current;
    if (!big || !mid || !small || !mesh || !material) return;
    big.update(clock.elapsedTime);
    mid.update(clock.elapsedTime);
    small.update(clock.elapsedTime);
    material.uniforms.uSpatialHxMid.value = mid.spatialHxTarget.texture;
    material.uniforms.uSpatialHzMid.value = mid.spatialHzTarget.texture;
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uCoastWaveAngle.value = coastWaveAngle;
    material.uniforms.uCoastFoamAmount.value = coastFoamAmount;
    material.uniforms.uOffshoreFoamAmount.value = offshoreFoamAmount;
    material.uniforms.uHorizonElev.value = horizonElev;
    material.uniforms.uHorizonClamp.value = horizonClamp;
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
    if (normalMapTex && material.uniforms.uNormalMap.value !== normalMapTex) {
      material.uniforms.uNormalMap.value = normalMapTex;
      material.uniforms.uHasNormalMap.value = 1.0;
    }
    if (followCamera) {
      mesh.position.x = camera.position.x;
      mesh.position.z = camera.position.z;
    }
  });

  return null;
}
