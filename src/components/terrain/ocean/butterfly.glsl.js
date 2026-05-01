// GPU FFT — Cooley-Tukey radix-2 vía butterfly texture pre-calculada.
//
// Para cada (stage s, output y), la butterflyTexture guarda:
//   .rg = twiddle factor W = ±e^(-2πi · j / m)   (signo embebido)
//   .b  = UV de p1 (top input index) en el ping-pong previo
//   .a  = UV de p2 (bot input index) en el ping-pong previo
//
// Output of one butterfly = a[p1] + W · a[p2].
//
// Stage 0 incluye bit-reversal: los p1/p2 ya vienen bit-reverseados, así no
// necesitamos un pre-pass de permutación.
//
// La FFT 2D se hace en 2 fases: log2(N) horizontales + log2(N) verticales.
// uHorizontal selecciona la dirección.
//
// Trabajamos sobre RGBA float: .rg = un complejo A, .ba = un complejo B.
// Esto permite transformar 2 señales complejas por la mismísima FFT (e.g.
// height + slope-X juntos en hxTarget).

import * as THREE from "three";

export const butterflyVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const butterflyFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uButterfly; // log2N × N
  uniform sampler2D uPrev;      // N × N (ping-pong source)
  uniform float uStage;         // 0..log2N-1
  uniform float uLog2N;
  uniform float uHorizontal;    // 1.0 row pass / 0.0 col pass

  vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
  }

  void main() {
    float stageU = (uStage + 0.5) / uLog2N;
    vec2 bUv = (uHorizontal > 0.5)
      ? vec2(stageU, vUv.x)
      : vec2(stageU, vUv.y);
    vec4 b = texture2D(uButterfly, bUv);
    vec2 tw = b.rg;
    float p1 = b.b;
    float p2 = b.a;

    vec2 src1Uv, src2Uv;
    if (uHorizontal > 0.5) {
      src1Uv = vec2(p1, vUv.y);
      src2Uv = vec2(p2, vUv.y);
    } else {
      src1Uv = vec2(vUv.x, p1);
      src2Uv = vec2(vUv.x, p2);
    }
    vec4 a1 = texture2D(uPrev, src1Uv);
    vec4 a2 = texture2D(uPrev, src2Uv);

    vec2 c1 = a1.rg + cmul(tw, a2.rg);
    vec2 c2 = a1.ba + cmul(tw, a2.ba);

    gl_FragColor = vec4(c1, c2);
  }
`;

// Permutation final: aplica (-1)^(x+y) y normaliza por 1/N² para IFFT.
// Este shader corre una sola vez después del último butterfly pass.
export const inversionFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uSrc;
  uniform float     uResolution;

  void main() {
    vec4 v = texture2D(uSrc, vUv);
    vec2 xy = floor(vUv * uResolution);
    float sgn = mod(xy.x + xy.y, 2.0) < 0.5 ? 1.0 : -1.0;
    float invN2 = 1.0 / (uResolution * uResolution);
    gl_FragColor = v * sgn * invN2;
  }
`;

// ─── JS-side: construir butterfly texture ──────────────────────────────────

function bitReverse(n, bits) {
  let r = 0;
  for (let i = 0; i < bits; i++) {
    r = (r << 1) | (n & 1);
    n >>= 1;
  }
  return r;
}

export function buildButterflyTexture(N) {
  const log2N = Math.round(Math.log2(N));
  if ((1 << log2N) !== N) {
    throw new Error(`OceanFFT: resolution ${N} no es potencia de 2`);
  }
  const data = new Float32Array(log2N * N * 4);

  for (let s = 0; s < log2N; s++) {
    const m = 1 << (s + 1);
    const half = m >> 1;
    for (let y = 0; y < N; y++) {
      const groupStart = Math.floor(y / m) * m;
      const j = y - groupStart;
      let p1 = groupStart + (j % half);
      let p2 = p1 + half;

      const tw_j = (j < half) ? j : (j - half);
      const angle = -2 * Math.PI * tw_j / m;
      let wr = Math.cos(angle);
      let wi = Math.sin(angle);
      if (j >= half) { wr = -wr; wi = -wi; }

      if (s === 0) {
        p1 = bitReverse(p1, log2N);
        p2 = bitReverse(p2, log2N);
      }

      const idx = (y * log2N + s) * 4;
      data[idx + 0] = wr;
      data[idx + 1] = wi;
      data[idx + 2] = (p1 + 0.5) / N;
      data[idx + 3] = (p2 + 0.5) / N;
    }
  }

  const tex = new THREE.DataTexture(data, log2N, N, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
