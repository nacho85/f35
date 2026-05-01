// Time evolution del spectrum.
//
// Tessendorf eq. (26):
//   h(k, t) = h0(k) · e^( iω(k)t) + h0(-k)* · e^(-iω(k)t)
//
//   con ω(k) = √(g · |k|)   (dispersion deep water)
//
// Input  : h0Target (RGBA float)
//   .rg = h0(k)
//   .ba = h0(-k)*
//
// Output : RGBA float — espectro complejo desplazado en el tiempo.
//   .rg = h(k,t)               complex (real, imag)
//   .ba = i·(kx/|k|)·h(k,t)    complex (real, imag)   ← slope/displacement X
//
// Z slope se obtiene en un segundo render pass (uChannel uniform) o en una
// segunda render target. Para la fase 2 sólo emitimos altura (.rg) +
// slope-X (.ba). El slope-Z se calculará por finite-difference en CPU
// shader del water plane (más barato que un tercer FFT en esta etapa).
//
// Nota: e^(iθ) = cos(θ) + i·sin(θ).  Multiplicación compleja:
//   (a+bi)(c+di) = (ac - bd) + (ad + bc)i

export const evolutionVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const evolutionFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uH0;
  uniform float     uResolution;   // N
  uniform float     uPatchSize;    // L_patch (m)
  uniform float     uTime;         // segundos

  const float PI = 3.14159265359;
  const float G  = 9.81;

  // (a+bi)·(c+di) = (ac-bd) + (ad+bc)i
  vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
  }

  void main() {
    float N  = uResolution;
    vec2 nm  = floor(vUv * N);
    vec2 idx = nm - N * 0.5;

    vec2 k = 2.0 * PI * idx / uPatchSize;
    float kLen = max(length(k), 1e-6);

    float omega = sqrt(G * kLen);
    float c = cos(omega * uTime);
    float s = sin(omega * uTime);

    vec4 h0 = texture2D(uH0, vUv);
    vec2 h0_k       = h0.rg;
    vec2 h0_negK_co = h0.ba;   // h0(-k)*

    // h0(k) · e^(iωt)
    vec2 e_pos = vec2(c, s);
    vec2 term1 = cmul(h0_k, e_pos);

    // h0(-k)* · e^(-iωt)
    vec2 e_neg = vec2(c, -s);
    vec2 term2 = cmul(h0_negK_co, e_neg);

    vec2 h_kt = term1 + term2;

    // Slope-X: i · (kx/|k|) · h(k,t)
    // Multiplicar por "i" rota 90°: (a+bi)·i = -b + ai
    float kxn = k.x / kLen;
    vec2 ih = vec2(-h_kt.y, h_kt.x);
    vec2 slopeX = ih * kxn;

    gl_FragColor = vec4(h_kt, slopeX);
  }
`;
