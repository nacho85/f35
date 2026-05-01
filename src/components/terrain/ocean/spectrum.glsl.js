// Phillips spectrum — generación inicial del campo de altura espectral h0(k).
//
// Tessendorf "Simulating Ocean Water" (2001):
//   P(k) = A * exp(-1/(k·L)²) / k⁴ * |k̂·ŵ|²
//   con L = V²/g (longitud de onda dominante para viento V)
//
//   h0(k)  = (ξr + iξi) / √2 * √P(k)
//   h0(-k) conjugado, se calcula en el evolution stage.
//
// Output: RGBA float texture
//   .rg = h0(k)   (real, imag)
//   .ba = h0(-k)* (real, imag)  — conjugado de h0(-k), pre-calculado
//
// Random gauss vía dos uniformes uniformes (Box-Muller).

export const spectrumVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const spectrumFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uResolution;     // N (ej 256)
  uniform float uPatchSize;      // L_patch en metros (ej 1000)
  uniform vec2  uWind;           // dirección viento (mundo XZ), magnitud = V
  uniform float uPhillipsA;      // amplitude scalar (Tessendorf 'A')
  uniform float uMinK;           // suprimir ondas muy largas (numerical stability)
  uniform vec2  uSeed;           // seed por cascade

  const float PI = 3.14159265359;
  const float G  = 9.81;

  // Hash → uniforme [0,1)
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // Box-Muller → 2 muestras de gauss(0,1)
  vec2 gauss2(vec2 seed) {
    float u1 = max(hash21(seed),                1e-7);
    float u2 = hash21(seed + vec2(13.37, 7.77));
    float r  = sqrt(-2.0 * log(u1));
    float t  = 2.0 * PI * u2;
    return vec2(r * cos(t), r * sin(t));
  }

  // Phillips spectrum P(k)
  float phillips(vec2 k) {
    float kLen2 = dot(k, k);
    if (kLen2 < uMinK * uMinK) return 0.0;
    float kLen  = sqrt(kLen2);

    float V  = length(uWind);
    if (V < 1e-4) return 0.0;
    vec2  wHat = uWind / V;
    vec2  kHat = k / kLen;

    float L  = V * V / G;
    float kL = kLen * L;

    float dirFactor = pow(max(dot(kHat, wHat), 0.0), 2.0);

    // damping de ondas muy chicas (suppress < l)
    float l = L / 1000.0;
    float damp = exp(-kLen2 * l * l);

    return uPhillipsA * exp(-1.0 / (kL * kL)) / (kLen2 * kLen2) * dirFactor * damp;
  }

  void main() {
    float N = uResolution;
    // Coord espectral: i ∈ [-N/2, N/2)
    vec2 nm = floor(vUv * N);
    vec2 idx = nm - N * 0.5;

    // k = 2π * idx / L_patch
    vec2 k     =  2.0 * PI * idx       / uPatchSize;
    vec2 kNeg  = -k;

    vec2 g_k    = gauss2(nm + uSeed);
    vec2 g_kNeg = gauss2((N - nm) + uSeed + vec2(101.0, 53.0));

    float sqrtPk    = sqrt(phillips(k)    * 0.5);
    float sqrtPkNeg = sqrt(phillips(kNeg) * 0.5);

    vec2 h0_k    = g_k    * sqrtPk;     // h0(k)
    vec2 h0_kNeg = g_kNeg * sqrtPkNeg;  // h0(-k)

    // Guardamos h0(-k)* (conjugado) para evitarlo en evolution
    vec2 h0_kNeg_conj = vec2(h0_kNeg.x, -h0_kNeg.y);

    gl_FragColor = vec4(h0_k, h0_kNeg_conj);
  }
`;
