"use client";

// HeatShimmerEffect: postprocessing pass que refracta el backbuffer con
// noise alrededor de cada fuente de calor activa (plumes con throttle alto).
// Look DCS-style: el aire detras del nozzle distorsiona TODO lo que haya
// atras (cielo, terreno, otros aviones), no solo dibuja un blob aditivo.
//
// CPU por frame, por source:
//   - proyecta la posicion world del nozzle a NDC.
//   - proyecta tambien un punto a 1m hacia atras (axis) → trailDir en NDC.
//     La MAGNITUD de trailDir da la escala perspectiva: lejos = chiquito,
//     cerca = grande. Asi el shimmer es relativo a la tobera y no
//     "explota" en pantalla cuando te acercas.
// GPU (mainUv): construye frame local along/across, mascara con falloff
// alargado hacia atras, y desplaza UVs con un gradiente de noise fino.

import { forwardRef, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Effect } from "postprocessing";
import { Uniform, Vector3, Vector4 } from "three";
import { getHeatSources } from "./heatRegistry";

const MAX_SOURCES = 6;

const fragmentShader = /* glsl */`
  // A: (cx, cy, intensity, scale)  — cx,cy en NDC [-1,1]; scale = 1m proyectado a NDC (~tamaño tobera)
  // B: (tx, ty, 0, 0)              — direccion de la estela en NDC, unit vector
  uniform vec4  uSourcesA[${MAX_SOURCES}];
  uniform vec4  uSourcesB[${MAX_SOURCES}];
  uniform float uTime;
  uniform float uAspect;
  uniform float uStrength;

  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = h21(i),         b = h21(i + vec2(1.0, 0.0));
    float c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void mainUv(inout vec2 uv) {
    vec2 disp = vec2(0.0);

    for (int i = 0; i < ${MAX_SOURCES}; i++) {
      float intensity = uSourcesA[i].z;
      if (intensity <= 0.001) continue;
      float scale = max(uSourcesA[i].w, 0.0005);   // NDC units por "metro"

      vec2 cNDC    = uSourcesA[i].xy;
      vec2 trailDir = uSourcesB[i].xy;             // unit (en NDC, aspect-aware)

      // uv en NDC [-1,1] (no aspect-corrected — trailDir ya esta en NDC real)
      vec2 pNDC = uv * 2.0 - 1.0;
      vec2 dNDC = pNDC - cNDC;

      // Frame local: along = proyeccion sobre trailDir (positivo = hacia atras
      // del nozzle), across = perpendicular.
      vec2 perp = vec2(-trailDir.y, trailDir.x);
      float along  = dot(dNDC, trailDir);
      float across = dot(dNDC, perp);

      // Largo y ancho de la estela en "metros" (multiplos de scale).
      // Alargada hacia atras: along positivo = trail; negativo = casi nada delante.
      float TRAIL_LEN_M  = 6.0;   // ~6m de estela visible
      float TRAIL_FRONT_M = 0.4;  // un poco delante del nozzle (turbulencia)
      float WIDTH_M_BASE = 0.35;  // ancho cerca del nozzle
      float WIDTH_M_END  = 1.10;  // ensancha mientras se disipa

      float a_m =  along  / scale;   // metros along (signo: + = atras)
      float c_m =  across / scale;   // metros across

      // Mascara along: 1 cerca del nozzle, fade a 0 al final de la estela.
      // Negativos (delante del nozzle) caen rapido.
      float fwd = smoothstep(-TRAIL_FRONT_M, 0.0, a_m);
      float bwd = 1.0 - smoothstep(0.0, TRAIL_LEN_M, a_m);
      float maskAlong = fwd * bwd;

      // Ancho que crece linealmente con along (cono que se abre hacia atras).
      float wAt = mix(WIDTH_M_BASE, WIDTH_M_END,
                      clamp(a_m / TRAIL_LEN_M, 0.0, 1.0));
      float maskAcross = 1.0 - smoothstep(0.0, 1.0, abs(c_m) / wAt);
      maskAcross = max(maskAcross, 0.0);

      float mask = maskAlong * maskAcross * intensity;
      if (mask <= 0.001) continue;

      // Noise en coords "estela": eje a (along) scrollea hacia atras con el tiempo
      // (calor viaja lejos del nozzle), eje c (across) frecuencia alta = lineas.
      float t = uTime * 1.6;
      vec2 nUv = vec2(c_m * 6.0, a_m * 1.8 - t);
      float n1 = vnoise(nUv);
      float n2 = vnoise(nUv * 1.9 + vec2(7.3, -t * 0.6));

      // Gradiente del noise (samples diferenciales) en coords NDC.
      float e = 0.6;  // metros de offset para gradiente
      float gx = vnoise(nUv + vec2(e * 6.0, 0.0)) - n1;
      float gy = vnoise(nUv + vec2(0.0, e * 1.8)) - n1;

      // El gradiente esta en frame estela; lo convertimos a NDC (perp/trailDir).
      vec2 gradNDC = perp * gx + trailDir * gy;
      // Pequeno componente lateral (n2) para romper alineamiento.
      gradNDC += perp * (n2 - 0.5) * 0.4;

      // Amplitud en metros-NDC. ~16cm de desplazamiento real cerca del nozzle.
      float amp = 0.18 * scale * mask * uStrength;
      disp += gradNDC * amp;
    }

    // disp esta en NDC; para uv hay que pasar a [0,1]: NDC range = 2 → uv = NDC * 0.5
    uv += disp * 0.5;
  }
`;

class HeatShimmerEffectImpl extends Effect {
  constructor() {
    const mkArr = () => Array.from({ length: MAX_SOURCES }, () => new Vector4());
    super("HeatShimmerEffect", fragmentShader, {
      uniforms: new Map([
        ["uSourcesA", new Uniform(mkArr())],  // (cx,cy,intensity,scale)
        ["uSourcesB", new Uniform(mkArr())],  // (tx,ty,0,0) trail dir NDC unit
        ["uTime",     new Uniform(0)],
        ["uAspect",   new Uniform(1)],
        ["uStrength", new Uniform(1)],
      ]),
    });
  }
}

export const HeatShimmerEffect = forwardRef(function HeatShimmerEffect(
  { strength = 1 },
  ref
) {
  const effect = useMemo(() => new HeatShimmerEffectImpl(), []);
  const camera = useThree(s => s.camera);
  const size   = useThree(s => s.size);
  const _vC = useRef(new Vector3());
  const _vB = useRef(new Vector3());
  const _vS = useRef(new Vector3());

  useFrame(({ clock }) => {
    const u = effect.uniforms;
    u.get("uTime").value     = clock.elapsedTime;
    u.get("uAspect").value   = size.width / size.height;
    u.get("uStrength").value = strength;

    const A = u.get("uSourcesA").value;
    const B = u.get("uSourcesB").value;
    let i = 0;
    for (const src of getHeatSources()) {
      if (i >= MAX_SOURCES) break;
      const intensity = src.throttleRef?.current ?? 0;
      const pos  = src.posRef?.current;
      const axis = src.axisRef?.current;       // world unit, points "rear" (away from plane)
      if (intensity < 0.05 || !pos) {
        A[i].x = 0; A[i].y = 0; A[i].z = 0; A[i].w = 0;
        B[i].x = 0; B[i].y = 0; i++;
        continue;
      }
      _vC.current.copy(pos).project(camera);
      if (_vC.current.z > 1) {
        A[i].x = 0; A[i].y = 0; A[i].z = 0; A[i].w = 0;
        B[i].x = 0; B[i].y = 0; i++;
        continue;
      }
      // Punto a 1m hacia atras del nozzle (en world)
      if (axis) {
        _vB.current.copy(pos).addScaledVector(axis, 1.0).project(camera);
      } else {
        // Sin axis: tomamos un punto 1m hacia abajo en mundo (fallback)
        _vB.current.copy(pos); _vB.current.y -= 1; _vB.current.project(camera);
      }
      // Punto a 1m al costado para escala perspectiva (independiente de orientacion)
      _vS.current.copy(pos);
      _vS.current.x += camera.matrixWorld.elements[0]; // primer columna world (right-x)
      _vS.current.y += camera.matrixWorld.elements[1]; // (right-y)
      _vS.current.z += camera.matrixWorld.elements[2]; // (right-z)
      _vS.current.project(camera);
      const sx = _vS.current.x - _vC.current.x;
      const sy = _vS.current.y - _vC.current.y;
      const scale = Math.hypot(sx, sy);          // NDC units per meter

      let tx = _vB.current.x - _vC.current.x;
      let ty = _vB.current.y - _vC.current.y;
      const tlen = Math.hypot(tx, ty);
      if (tlen > 1e-5) { tx /= tlen; ty /= tlen; } else { tx = 0; ty = -1; }

      A[i].x = _vC.current.x;
      A[i].y = _vC.current.y;
      A[i].z = Math.min(1, intensity);
      A[i].w = scale;
      B[i].x = tx;
      B[i].y = ty;
      i++;
    }
    for (; i < MAX_SOURCES; i++) {
      A[i].x = 0; A[i].y = 0; A[i].z = 0; A[i].w = 0;
      B[i].x = 0; B[i].y = 0;
    }
  });

  return <primitive ref={ref} object={effect} dispose={null} />;
});
