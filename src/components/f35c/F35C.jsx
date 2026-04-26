"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkinnedScene } from "three/examples/jsm/utils/SkeletonUtils.js";
import { splitMeshByIslandX, splitMeshTwoWay } from "../f35/F35";
import { Quaternion, Vector3, Euler, Mesh, Group, BufferGeometry, AdditiveBlending, NormalBlending, ShaderMaterial, BufferAttribute, Float32BufferAttribute, Sphere, MeshStandardMaterial, DoubleSide, AnimationMixer, LoopOnce, PlaneGeometry, InstancedMesh, InstancedBufferAttribute, Matrix4, DynamicDrawUsage, TextureLoader, RepeatWrapping, SRGBColorSpace, Line, LineBasicMaterial } from "three";

// Zonas de armas — exportado para que la UI pueda listar los IDs/labels/colores
// Zonas expandidas ligeramente respecto al gap del histograma para capturar
// triángulos de borde (vértices justo en el límite de la zona).
// Los gaps entre zonas son ≥0.10 u — expansion de 0.05 es segura en todos los casos.
export const WEAPON_ZONES = [
  { id: "amraam_l_ext", label: "AIM-120 ala izq ext",  minX:  6.05, maxX:  7.10, color: 0xff2222 },
  { id: "gbu12_l",      label: "GBU-12 ala izq",       minX:  5.20, maxX:  6.00, color: 0xff7700 },
  { id: "jassm_l",      label: "JASSM ala izq",        minX:  3.85, maxX:  5.15, color: 0xffdd00 },
  { id: "bay_l_amraam",  label: "AMRAAM bahía izq",       minX:  1.65, maxX:  2.26, color: 0x00ffee, zOffset: -0.2, xOffset: -0.2 },
  { id: "bay_l_bomb",   label: "Bomba bahía izq",        minX:  2.26, maxX:  3.00, color: 0x00ff88, zOffset: -0.2, xOffset: -0.2 },
  { id: "bay_r_bomb",   label: "Bomba bahía der",        minX:  0.05, maxX:  0.80, color: 0xaa44ff, zOffset: -0.2 },
  { id: "bay_r_amraam", label: "AMRAAM bahía der",       minX:  0.80, maxX:  1.55, color: 0x0088ff, zOffset: -0.2 },
  { id: "jassm_r",      label: "JASSM ala der",        minX: -2.40, maxX: -1.25, color: 0x88ff00 },
  { id: "gbu12_r",      label: "GBU-12 ala der",       minX: -3.15, maxX: -2.44, color: 0xff00cc },
  { id: "amraam_r_ext", label: "AIM-120 ala der ext",  minX: -3.95, maxX: -3.25, color: 0xffffff },
];

// Armature.002 = pétalos externos (15×137v), Armature.009 = pétalos internos (15×12v)
// Ambos forman el anillo de tobera variable. Blender center (1.52, 10.01, 2.93) →
// Three.js / GLB Y-up: (x=1.52, y=2.93, z=-10.01)  (Blender Z→GLB Y, Blender Y→GLB -Z)
const NOZZLE_ANIMS            = new Set(["Armature.002", "Armature.009"]);
const THROTTLE_TRAVEL_SECONDS = 1.5; // segundos para alcanzar throttle objetivo

// ExhaustPlume + materiales del afterburner viven en common/ExhaustPlume
import { ExhaustPlume } from "../common/ExhaustPlume";

// ─── Paracaídas — cúpula con gores inflados + cuerdas ───────────────────────
// Color único oliva militar. Cada gore se abomba radialmente en su centro para
// reproducir las arrugas de tela características. Cuerdas en costuras Y centros.
const _CHUTE_N_PANELS = 20;
const _CHUTE_N_LAT    = 14;   // latitud por gore
const _CHUTE_N_LON    = 6;    // longitud por gore (más = abombado más suave)
const _CHUTE_VENT     = 0.06; // vent hole en el ápice
const _CHUTE_BULGE    = 0.10; // cuánto se infla cada gore en su centro
// vertexColors: true — el color del material (blanco) se multiplica por los colores
// de vértice que calculamos en _buildChuteGroup para dar varianza realista de tela.
const _chuteMat = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side: DoubleSide, roughness: 1.0, metalness: 0 });

// Color base oliva militar en linear-ish (MeshStandardMaterial espera sRGB 0-1)
const _CHUTE_BASE = { r: 0x14 / 255, g: 0x1e / 255, b: 0x08 / 255 };

// Textura webbing para risers — lazy singleton (evita acceder al DOM en SSR)
let _strapTex = null;
function _getStrapTex() {
  if (!_strapTex) {
    _strapTex = new TextureLoader().load('/strap.png');
    _strapTex.wrapS        = RepeatWrapping;
    _strapTex.wrapT        = RepeatWrapping;
    _strapTex.colorSpace   = SRGBColorSpace;
    _strapTex.repeat.set(1, 10); // 1 rep en ancho, 10 a lo largo del strap
  }
  return _strapTex;
}

export const DEFAULT_CHUTE_PARAMS = {
  shoulderOffset: 0.40,  // Y sobre centro del piloto donde se ancla el arnés
  offsetX:        0.05,  // desplazamiento X (izq/der) respecto al piloto
  offsetY:        0.43,  // desplazamiento Y adicional respecto al piloto
  offsetZ:        0.14,  // desplazamiento Z (fwd/bwd) respecto al piloto
  riserX:         0.06,  // separación horizontal izq/der de los risers
  riserSep:       0.045, // distancia entre los dos puntos de anclaje (spread hombros)
  riserWidth:     0.020, // ancho de las tiras riser convergentes
  riserDepth:     0.006, // espesor de las tiras riser
  lineWidth:      0.003, // ancho de las tiras divergentes (skirt → confluencia)
  confY:         -2.61,  // Y local confluencia (cuerdas largas llegan aquí)
  // BODY_Y siempre = -2.80 (fijo) → largo visible de convergentes = |BODY_Y - confY|
};
const _CHUTE_BODY_Y = -2.80; // punto de anclaje fijo al arnés del piloto

function _buildChuteGroup(params = {}) {
  const { riserX, riserSep, riserWidth, riserDepth, confY } = { ...DEFAULT_CHUTE_PARAMS, ...params };
  const CONF_Y   = confY;
  const BODY_Y   = _CHUTE_BODY_Y;
  const RISER_RX = riserX;      // X donde convergen las suspensiones
  const BODY_RX  = riserSep;    // X donde el riser toca el hombro (más estrecho)
  const group = new Group();

  // Guardar params para que useFrame los use en la fórmula de anclaje
  const { shoulderOffset, offsetX, offsetY, offsetZ } = { ...DEFAULT_CHUTE_PARAMS, ...params };
  group.userData.chute = { confY: CONF_Y, bodyY: BODY_Y, shoulderOffset, offsetX, offsetY, offsetZ };

  for (let p = 0; p < _CHUTE_N_PANELS; p++) {
    const phi0 = (p       / _CHUTE_N_PANELS) * Math.PI * 2;
    const phi1 = ((p + 1) / _CHUTE_N_PANELS) * Math.PI * 2;

    const nVerts = (_CHUTE_N_LAT + 1) * (_CHUTE_N_LON + 1);
    const pos = new Float32Array(nVerts * 3);
    const col = new Float32Array(nVerts * 3);
    const idx = [];

    // Variación de brillo por panel: cada panel es levemente distinto
    const panelBright = 0.88 + Math.random() * 0.24;

    let vi = 0;
    for (let j = 0; j <= _CHUTE_N_LAT; j++) {
      const t     = _CHUTE_VENT + (j / _CHUTE_N_LAT) * (1.0 - _CHUTE_VENT);
      const theta = t * Math.PI * 0.58;
      const y = Math.cos(theta);
      const r = Math.sin(theta);

      // Altura: ápice más claro (luz desde arriba), falda más oscura
      const heightBright = 1.10 - (j / _CHUTE_N_LAT) * 0.28;

      for (let i = 0; i <= _CHUTE_N_LON; i++) {
        const lerpT = i / _CHUTE_N_LON;
        const a = phi0 + lerpT * (phi1 - phi0);
        const bulge = 1.0 + _CHUTE_BULGE * Math.sin(lerpT * Math.PI);
        pos[vi*3+0] = Math.cos(a) * r * bulge;
        pos[vi*3+1] = y;
        pos[vi*3+2] = Math.sin(a) * r * bulge;

        // Sombra de costura: los bordes del panel (lerpT≈0 o 1) quedan en sombra
        // porque la tela se dobla hacia adentro en la costura.
        const seamLight = 0.72 + Math.sin(lerpT * Math.PI) * 0.28;

        // Ruido per-vértice muy suave (varianza de tela)
        const noise = 0.82 + Math.random() * 0.36;

        const bright = panelBright * heightBright * seamLight * noise;
        col[vi*3+0] = _CHUTE_BASE.r * bright;
        col[vi*3+1] = _CHUTE_BASE.g * bright;
        col[vi*3+2] = _CHUTE_BASE.b * bright;
        vi++;
      }
    }

    const w = _CHUTE_N_LON + 1;
    for (let j = 0; j < _CHUTE_N_LAT; j++) {
      for (let i = 0; i < _CHUTE_N_LON; i++) {
        const a = j*w+i, b = j*w+i+1, c = (j+1)*w+i+1, d = (j+1)*w+i;
        idx.push(a, b, c,  a, c, d);
      }
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color',    new Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    group.add(new Mesh(geo, _chuteMat));
  }

  // ── Cuerdas de suspensión (skirt → confluencia, dinámicas — se despliegan) ───
  const skirtTheta = Math.PI * 0.58;
  const sy  = Math.cos(skirtTheta);
  const sr  = Math.sin(skirtTheta);
  const N_LINES = _CHUTE_N_PANELS * 2;

  // Por línea: 3 puntos clave [top, mid, bot].
  // top y mid se animan en useFrame; top siempre anclado al skirt del panel (pscl).
  const { lineWidth } = { ...DEFAULT_CHUTE_PARAMS, ...params };
  const straightPts = new Float32Array(N_LINES * 9);   // 3 pts × 3 floats
  const lineSeeds   = new Float32Array(N_LINES);
  const linePhis    = new Float32Array(N_LINES);
  // 6 verts × 3 floats por línea: [top-L, top-R, mid-L, mid-R, bot-L, bot-R]
  const lmVerts     = new Float32Array(N_LINES * 18);

  let li = 0;
  for (let p = 0; p < _CHUTE_N_PANELS; p++) {
    for (let half = 0; half < 2; half++) {
      const phi  = half === 0
        ? (p / _CHUTE_N_PANELS) * Math.PI * 2
        : ((p + 0.5) / _CHUTE_N_PANELS) * Math.PI * 2;
      const rr   = half === 0 ? sr : sr * (1 + _CHUTE_BULGE);
      const sign = Math.cos(phi) >= 0 ? 1 : -1;

      const tx = Math.cos(phi) * rr, ty = sy, tz = Math.sin(phi) * rr;
      // Anclar al borde (punta) del strap: mitad de hilos al borde +X, mitad al borde -X.
      // Split por signo Z del top: frente del paracaídas → un borde, dorso → el otro.
      const hw_r = riserWidth / 2;
      const bx = sign * RISER_RX + (tz >= 0 ? -hw_r : +hw_r);
      const by = CONF_Y, bz = 0;
      const mx = (tx + bx) * 0.5, my = (ty + by) * 0.5, mz = (tz + bz) * 0.5;

      const si = li * 9;
      straightPts[si]   = tx; straightPts[si+1] = ty; straightPts[si+2] = tz;
      straightPts[si+3] = mx; straightPts[si+4] = my; straightPts[si+5] = mz;
      straightPts[si+6] = bx; straightPts[si+7] = by; straightPts[si+8] = bz;

      linePhis[li]    = phi;
      lineSeeds[li++] = Math.random();
    }
  }

  // Índices estáticos: dos quads por línea (top→mid y mid→bot), cara doble via DoubleSide
  const lmIdx = [];
  for (let i = 0; i < N_LINES; i++) {
    const b = i * 6;
    // quad superior: verts b,b+1,b+2,b+3 (top-L, top-R, mid-L, mid-R)
    lmIdx.push(b, b+2, b+1,  b+1, b+2, b+3);
    // quad inferior: verts b+2,b+3,b+4,b+5 (mid-L, mid-R, bot-L, bot-R)
    lmIdx.push(b+2, b+4, b+3,  b+3, b+4, b+5);
  }
  // Vertex colors: varianza por línea — per-line brightness + fade por altura + ruido
  const lmColors = new Float32Array(N_LINES * 18); // 6 verts × 3 floats
  for (let li = 0; li < N_LINES; li++) {
    const lineBright = 0.70 + Math.random() * 0.30;
    for (let vi = 0; vi < 6; vi++) {
      const row       = Math.floor(vi / 2);             // 0=top,1=mid,2=bot
      const heightFade = 1.05 - row * 0.10;             // top más claro, bot más oscuro
      const noise      = 0.90 + Math.random() * 0.20;
      const bright = lineBright * heightFade * noise;
      const ci = (li * 6 + vi) * 3;
      // Marrón oscuro
      lmColors[ci]   = 0.22 * bright;  // R
      lmColors[ci+1] = 0.12 * bright;  // G
      lmColors[ci+2] = 0.04 * bright;  // B
    }
  }

  const lmPosBuf = new Float32BufferAttribute(lmVerts, 3);
  lmPosBuf.setUsage(DynamicDrawUsage);
  const lmGeo = new BufferGeometry();
  lmGeo.setAttribute('position', lmPosBuf);
  lmGeo.setAttribute('color', new Float32BufferAttribute(lmColors, 3));
  lmGeo.setIndex(lmIdx);
  const linesMesh = new Mesh(lmGeo, new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.92, metalness: 0 }));
  group.add(linesMesh);

  group.userData.linesMesh   = linesMesh;
  group.userData.straightPts = straightPts;
  group.userData.lineSeeds   = lineSeeds;
  group.userData.linePhis    = linePhis;
  group.userData.lineWidth   = lineWidth;
  group.userData.N_LINES     = N_LINES;

  // ── Tiras riser — webbing con costillas nítidas (color uniforme por costilla) ──
  // Técnica: vértices duplicados en cada borde de costilla → corte duro de color,
  // sin interpolación entre costillas adyacentes.
  const riserMat = new MeshStandardMaterial({ map: _getStrapTex(), side: DoubleSide, roughness: 0.95, metalness: 0 });
  // N_RIBS no se usa para costillas visuales ahora — la textura provee el patrón.
  // Mantenemos resolución suficiente para que la geometría no sea blocky.
  const N_RIBS = 16;
  const hd     = riserDepth / 2;

  for (const sign of [1, -1]) {
    const topX = sign * RISER_RX;
    const botX = sign * BODY_RX;
    const hw   = riserWidth / 2;

    // 4 verts por fila × 2 filas × N_RIBS segmentos
    const nV  = N_RIBS * 2 * 4;
    const pos = new Float32Array(nV * 3);
    const uvs = new Float32Array(nV * 2);
    const idx = [];

    for (let rib = 0; rib < N_RIBS; rib++) {
      for (let end = 0; end < 2; end++) {
        const frac = (rib + end) / N_RIBS; // 0 (abajo/confY) → 1 (arriba/bodyY)
        const y    = CONF_Y + (BODY_Y - CONF_Y) * frac;
        const x    = topX   + (botX   - topX)   * frac;
        const vi   = (rib * 2 + end) * 4;

        pos[vi*3+0]  = x-hw; pos[vi*3+1]  = y; pos[vi*3+2]  = +hd; // front-left
        pos[vi*3+3]  = x+hw; pos[vi*3+4]  = y; pos[vi*3+5]  = +hd; // front-right
        pos[vi*3+6]  = x-hw; pos[vi*3+7]  = y; pos[vi*3+8]  = -hd; // back-left
        pos[vi*3+9]  = x+hw; pos[vi*3+10] = y; pos[vi*3+11] = -hd; // back-right

        // UV: U=0..1 cruzando el ancho, V=frac a lo largo del strap (textura repite vía texture.repeat)
        uvs[vi*2+0] = 0; uvs[vi*2+1] = frac; // front-left
        uvs[vi*2+2] = 1; uvs[vi*2+3] = frac; // front-right
        uvs[vi*2+4] = 0; uvs[vi*2+5] = frac; // back-left
        uvs[vi*2+6] = 1; uvs[vi*2+7] = frac; // back-right
      }

      const a = rib * 2 * 4;
      const b = a + 4;
      idx.push(a,   b,   a+1, a+1, b,   b+1); // cara frontal
      idx.push(a+2, a+3, b+2, a+3, b+3, b+2); // cara trasera
      idx.push(a+2, b+2, a,   a,   b+2, b  ); // canto izquierdo
      idx.push(a+1, b+1, a+3, a+3, b+1, b+3); // canto derecho
    }
    // tapas
    idx.push(0, 2, 1, 1, 2, 3);
    const bt = (N_RIBS * 2 - 1) * 4;
    idx.push(bt, bt+1, bt+2, bt+1, bt+3, bt+2);

    const tg = new BufferGeometry();
    tg.setAttribute('position', new Float32BufferAttribute(pos, 3));
    tg.setAttribute('uv',       new Float32BufferAttribute(uvs, 2));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const tm = new Mesh(tg, riserMat);
    tm.userData.isRiser = true;
    group.add(tm);
  }

  // children[0..N-1]=panels, luego risers meshes, luego linesMesh
  // panelDelays solo se aplica a los primeros N_PANELS children (chequeo isMesh)
  group.userData.panelDelays = Array.from({ length: _CHUTE_N_PANELS },
    () => Math.random() * 0.42);

  return group;
}

// ─── Propulsor del asiento eyector — llama corta, intensa, blanca ─────────────
const ROCKET_H  = 2.4;
const ROCKET_R0 = 0.07;
const N_ROCKET  = 380;

function _buildRocketGeo() {
  const posArr  = new Float32Array(N_ROCKET * 3);
  const dataArr = new Float32Array(N_ROCKET * 4);
  for (let i = 0; i < N_ROCKET; i++) {
    const t    = Math.pow(Math.random(), 0.35);
    const maxR = ROCKET_R0 * (1 + t * 1.3);
    const r    = Math.random() * maxR;
    const phi  = Math.random() * Math.PI * 2;
    posArr[i*3+0] = Math.cos(phi) * r;
    posArr[i*3+1] = Math.sin(phi) * r;
    posArr[i*3+2] = -t * ROCKET_H;
    dataArr[i*4+0] = maxR > 0.001 ? r / maxR : 0;
    dataArr[i*4+1] = t;
    dataArr[i*4+2] = Math.random() * Math.PI * 2;
    dataArr[i*4+3] = 0.6 + Math.random() * 2.0;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(posArr,  3));
  geo.setAttribute('aData',    new BufferAttribute(dataArr, 4));
  geo.boundingSphere = new Sphere(new Vector3(0, 0, -ROCKET_H / 2), ROCKET_H);
  return geo;
}
const _rocketGeo = _buildRocketGeo();

const _rocketMat = new ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 } },
  vertexShader: `
    attribute vec4 aData;
    uniform float uTime;
    uniform float uIntensity;
    varying float vNr;
    varying float vEffT;
    varying float vAlpha;
    varying float vPhase;
    void main() {
      float nr    = aData.x;
      float t     = aData.y;
      float phase = aData.z;
      float spd   = aData.w;
      vec3 pos = position;
      // Expansión tipo campana: el radio crece al alejarse del nozzle
      float bellScale = 1.0 + t * 1.8;
      pos.x *= bellScale;
      pos.y *= bellScale;
      // Turbulencia caótica del propulsor sólido — mayor al inicio, laminar al final
      float turb = mix(0.08, 0.02, t);
      pos.x += sin(uTime * spd * 2.6 + phase)          * turb;
      pos.y += cos(uTime * spd * 2.1 + phase * 1.7)    * turb;
      pos.x += sin(uTime * 31.0 + phase * 3.1)         * 0.025 * (1.0 - t);
      pos.y += cos(uTime * 27.0 + phase * 2.3)         * 0.025 * (1.0 - t);
      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      float dist = max(-mvPos.z, 0.1);
      // Puntos grandes en el core, se disuelven hacia la punta
      float sz = mix(5.5, 0.2, t * t) * (1.0 - nr * 0.50) * uIntensity;
      gl_PointSize = clamp(sz * projectionMatrix[1][1] * 300.0 / dist, 0.5, 90.0);
      // Alpha: borde exterior más transparente, tip se disuelve rápido
      vAlpha  = (1.0 - nr * 0.62) * pow(max(0.0, 1.0 - t), 1.4);
      vNr     = nr;
      vEffT   = t;
      vPhase  = phase;
      gl_Position = projectionMatrix * mvPos;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uIntensity;
    varying float vNr;
    varying float vEffT;
    varying float vAlpha;
    varying float vPhase;

    // Hash rápido para ruido por partícula
    float h11(float p) { return fract(sin(p * 127.3 + 1.7) * 43758.5); }

    void main() {
      vec2  uv   = gl_PointCoord - 0.5;
      float r    = length(uv) * 2.0;

      // Disco suave con borde difuso (simula emisión volumétrica)
      float disc = pow(max(0.0, 1.0 - r), 1.3);

      // ── Temperatura por zona radial ───────────────────────────────────────
      // Core: blanco-azulado >3000 K
      // Ring 1: amarillo brillante ~2500 K
      // Ring 2: naranja ~2000 K
      // Exterior: rojo-oscuro ~1500 K — borde que se diluye en humo
      vec3 coreCol  = vec3(1.00, 0.98, 1.00);   // blanco con leve azul
      vec3 hotCol   = vec3(1.00, 0.90, 0.35);   // amarillo brillante
      vec3 midCol   = vec3(1.00, 0.45, 0.06);   // naranja
      vec3 coolCol  = vec3(0.80, 0.10, 0.01);   // rojo oscuro
      vec3 smokeCol = vec3(0.18, 0.10, 0.08);   // humo marrón-gris

      vec3 col = mix(coreCol,  hotCol,   smoothstep(0.00, 0.15, vNr));
           col = mix(col,      midCol,   smoothstep(0.15, 0.48, vNr));
           col = mix(col,      coolCol,  smoothstep(0.48, 0.80, vNr));
           col = mix(col,      smokeCol, smoothstep(0.80, 1.00, vNr));

      // ── Temperatura a lo largo del eje ────────────────────────────────────
      // La llama se enfría hacia la punta — naranja→rojo→humo
      vec3 tipCol = mix(vec3(0.60, 0.08, 0.01), vec3(0.12, 0.07, 0.06), smoothstep(0.5, 1.0, vEffT));
      col = mix(col, tipCol, smoothstep(0.30, 0.90, vEffT) * (0.5 + vNr * 0.5));

      // ── Flicker: dos frecuencias que se mezclan (más caótico que un solo seno) ──
      float fl1  = 0.82 + 0.18 * sin(uTime * 38.0 + vPhase * 5.0);
      float fl2  = 0.90 + 0.10 * sin(uTime * 61.0 + vPhase * 8.3);
      float fl   = fl1 * fl2;

      // ── Disolución irregular en la punta ──────────────────────────────────
      float hash  = h11(vPhase);
      float hash2 = h11(vPhase * 7.3 + 2.1);
      // Algunas partículas se desvanecen antes → aspecto deshilachado real
      float earlyFade = mix(1.0, hash * hash2, smoothstep(0.18, 0.60, vEffT));

      float alpha = vAlpha * disc * fl * earlyFade;
      // Componente de brillo extra en el core (núcleo sobreexpuesto)
      float coreBright = (1.0 - smoothstep(0.0, 0.12, vNr)) * (1.0 - vEffT) * 0.4;

      gl_FragColor = vec4(col + coreBright, clamp(alpha * 0.75 * uIntensity, 0.0, 1.0));
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
});


// ─── Smoke — billboarded quads con FBM para aspecto volumétrico ──────────────
// gl.POINTS son geométricos por naturaleza (sprites cuadrados/circulares con
// límite de tamaño hardware). En cambio, InstancedMesh con PlaneGeometry da
// quads arbitrariamente grandes orientados a cámara donde el FBM tiene todo
// el espacio para crear bordes orgánicos y formas de nube reales.
const N_SMOKE   = 120;
const SMOKE_DUR = 7.0;

// Datos por partícula — re-randomizados en cada eject
const _pVelX  = new Float32Array(N_SMOKE);
const _pVelY  = new Float32Array(N_SMOKE);
const _pVelZ  = new Float32Array(N_SMOKE);
const _pBirth = new Float32Array(N_SMOKE);
const _pLife  = new Float32Array(N_SMOKE);
const _pPhase = new Float32Array(N_SMOKE);
const _pSpin  = new Float32Array(N_SMOKE);
const _pSeed  = new Float32Array(N_SMOKE); // seed adicional de ruido por partícula

function _resetSmokeParticles() {
  for (let i = 0; i < N_SMOKE; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * Math.random() * 0.55;
    _pVelX[i]  = Math.cos(a) * s;
    _pVelY[i]  = 0.9 + Math.random() * 1.6;
    _pVelZ[i]  = Math.sin(a) * s;
    _pBirth[i] = i < 25 ? Math.random() * 0.06 : Math.random() * 1.0;
    _pLife[i]  = 3.0 + Math.random() * 2.8;
    _pPhase[i] = Math.random() * 62.83;
    _pSpin[i]  = (Math.random() - 0.5) * 0.5;
    _pSeed[i]  = Math.random() * 100.0;
  }
}
_resetSmokeParticles();

// Atributos instanciados — se actualizan cada frame
const _iAlphaArr = new Float32Array(N_SMOKE);
const _iAgeArr   = new Float32Array(N_SMOKE);
const _iPhaseArr = new Float32Array(N_SMOKE);
const _iSeedArr  = new Float32Array(N_SMOKE);
const _iAttrAlpha = new InstancedBufferAttribute(_iAlphaArr, 1); _iAttrAlpha.setUsage(DynamicDrawUsage);
const _iAttrAge   = new InstancedBufferAttribute(_iAgeArr,   1); _iAttrAge.setUsage(DynamicDrawUsage);
const _iAttrPhase = new InstancedBufferAttribute(_iPhaseArr, 1);
const _iAttrSeed  = new InstancedBufferAttribute(_iSeedArr,  1);

const _smokePlaneGeo = new PlaneGeometry(1, 1);
_smokePlaneGeo.setAttribute('aAlpha', _iAttrAlpha);
_smokePlaneGeo.setAttribute('aAge',   _iAttrAge);
_smokePlaneGeo.setAttribute('aPhase', _iAttrPhase);
_smokePlaneGeo.setAttribute('aSeed',  _iAttrSeed);

const _smokeMat = new ShaderMaterial({
  vertexShader: `
    attribute float aAlpha;
    attribute float aAge;
    attribute float aPhase;
    attribute float aSeed;
    varying vec2  vUv2;
    varying float vAlpha;
    varying float vAge;
    varying float vPhase;
    varying float vSeed;
    void main() {
      vUv2   = uv;
      vAlpha = aAlpha;
      vAge   = aAge;
      vPhase = aPhase;
      vSeed  = aSeed;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2  vUv2;
    varying float vAlpha;
    varying float vAge;
    varying float vPhase;
    varying float vSeed;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vnoise(vec2 p) {
      vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                 mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
    }
    float fbm(vec2 p) {
      float v=0.0,a=0.5;
      for(int i=0;i<6;i++){v+=a*vnoise(p);p=p*2.2+vec2(1.7,9.2);a*=0.5;}
      return v;
    }

    void main() {
      // UV centrado en [-0.5, 0.5]; sin clip circular — FBM define la forma
      vec2 uv = vUv2 - 0.5;

      // Seed único por partícula (vSeed) + desplazamiento lento con la edad
      // para que la nube mute y no sea estática
      float slowAge = vAge * 0.18;
      vec2 seed2 = vec2(cos(vPhase + vSeed)*3.1, sin(vPhase * 1.3 + vSeed)*2.7);
      vec2 nuv = uv * 2.8 + seed2 + vec2(slowAge * 0.7, slowAge * 0.4);

      float n1 = fbm(nuv);
      // Segundo layer desplazado para volumen interno
      float n2 = fbm(nuv * 1.6 + vec2(5.3, 2.1) + slowAge * 0.3);

      // Radio sin clip — FBM controla la frontera orgánica
      float r = length(uv) * 2.0;

      // Forma: el FBM empuja/contrae el borde; n1 cercano a 0.5 = media densidad
      // smoothstep crea el falloff suave y corrugado
      float edgeCtrl = n1 * 0.55 + n2 * 0.25;
      float mask = 1.0 - smoothstep(0.10 + edgeCtrl, 0.50 + edgeCtrl, r);
      if (mask < 0.005) discard;

      // Densidad interna: más detalle con n2
      float density = mask * (0.5 + n1 * 0.3 + n2 * 0.2);

      // Color: negro/marrón caliente → gris pizarra → gris claro/blanco
      vec3 hotColor  = mix(vec3(0.08,0.05,0.03), vec3(0.30,0.25,0.20), n1);
      vec3 coolColor = mix(vec3(0.50,0.48,0.46), vec3(0.78,0.76,0.74), n2);
      vec3 col = mix(hotColor, coolColor, smoothstep(0.0, 0.35, vAge));

      // Ligero ribete más oscuro en bordes (da sensación de volumen)
      float rim = 1.0 - smoothstep(0.0, 0.35, mask);
      col = mix(col, col * 0.55, rim * 0.5);

      gl_FragColor = vec4(col, vAlpha * density * 0.80);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: NormalBlending,
  side: DoubleSide,
});

// InstancedMesh — singleton a nivel módulo
const _smokeMesh = new InstancedMesh(_smokePlaneGeo, _smokeMat, N_SMOKE);
_smokeMesh.instanceMatrix.setUsage(DynamicDrawUsage);
_smokeMesh.frustumCulled = false;
_smokeMesh.count = 0;

// Quaternión de piloto vertical (identidad) — destino del SLERP post-eyección
const _UPRIGHT_Q = new Quaternion(); // identity = sin rotación = vertical
// Helpers péndulo — sin allocations por frame
const _pendV3 = new Vector3();
const _pendQ  = new Quaternion();
const _pendE  = new Euler();

// Helpers para el loop — sin allocations por frame
const _sm_cQ  = new Quaternion();
const _sm_spQ = new Quaternion();
const _sm_fQ  = new Quaternion();
const _sm_fwd = new Vector3(0, 0, 1);
const _sm_pos = new Vector3();
const _sm_scl = new Vector3();
const _sm_mat = new Matrix4();

function SmokeCloud({ stateRef }) {
  const groupRef = useRef();

  useEffect(() => {
    groupRef.current?.add(_smokeMesh);
    return () => _smokeMesh.removeFromParent();
  }, []);

  useFrame(({ camera }, delta) => {
    const st = stateRef.current;
    if (st.active) {
      st.t += delta;
      if (st.t >= SMOKE_DUR) st.active = false;
    }

    const t = st.t;
    if (!st.active && t <= 0) { _smokeMesh.count = 0; return; }

    if (groupRef.current) groupRef.current.position.copy(st.pos);

    camera.getWorldQuaternion(_sm_cQ);

    for (let i = 0; i < N_SMOKE; i++) {
      const age = t - _pBirth[i];
      if (age < 0 || age > _pLife[i]) { _iAlphaArr[i] = 0; continue; }

      const normAge = age / _pLife[i];

      // Posición: drag exponencial + turbulencia lateral
      const k = 0.45, decay = (1 - Math.exp(-k * age)) / k;
      const turb = Math.min(age * 0.20, 0.50);
      _sm_pos.set(
        _pVelX[i] * decay + Math.sin(_pPhase[i]       + age * 1.3) * turb,
        _pVelY[i] * decay,
        _pVelZ[i] * decay + Math.cos(_pPhase[i] * 1.7 + age * 1.0) * turb,
      );

      // Tamaño: crece de 0.4 a ~7 con power curve
      const sz = 0.4 + 7.0 * Math.pow(normAge, 0.45);
      _sm_scl.set(sz, sz, 1);

      // Billboard + spin en el plano de pantalla
      _sm_spQ.setFromAxisAngle(_sm_fwd, _pSpin[i] * age);
      _sm_fQ.multiplyQuaternions(_sm_cQ, _sm_spQ);
      _sm_mat.compose(_sm_pos, _sm_fQ, _sm_scl);
      _smokeMesh.setMatrixAt(i, _sm_mat);

      // Alpha: fade in rápido, fade out suave
      const fadeIn  = Math.min(1, age / (_pLife[i] * 0.08));
      const fadeOut = 1 - Math.max(0, (normAge - 0.50) / 0.50);
      _iAlphaArr[i] = fadeIn * fadeOut;
      _iAgeArr[i]   = normAge;
      _iPhaseArr[i] = _pPhase[i];
      _iSeedArr[i]  = _pSeed[i];
    }

    _iAttrAlpha.needsUpdate = true;
    _iAttrAge.needsUpdate   = true;
    _iAttrPhase.needsUpdate = true;
    _iAttrSeed.needsUpdate  = true;
    _smokeMesh.instanceMatrix.needsUpdate = true;
    _smokeMesh.count = N_SMOKE;
  });

  return <group ref={groupRef} />;
}

function SeatRocketFlame({ posRef, intensityRef }) {
  const grpRef   = useRef();
  const lightRef = useRef();

  useFrame(({ clock }) => {
    if (!grpRef.current) return;
    const intensity = intensityRef.current;
    // Siempre actualizar uniforms — shader queda caliente desde el primer frame
    if (posRef.current) grpRef.current.position.copy(posRef.current);
    const t = clock.elapsedTime;
    _rocketMat.uniforms.uTime.value      = t;
    _rocketMat.uniforms.uIntensity.value = intensity; // alpha=0 cuando intensity=0
    if (lightRef.current) {
      lightRef.current.intensity = intensity > 0.01
        ? intensity * 12.0 * (0.72 + 0.28 * Math.sin(t * 48))
        : 0;
    }
  });

  // rotation: -90° X para que local -Z (dirección de partículas) apunte hacia abajo (-Y)
  // Siempre visible: cuando intensity=0 el shader produce alpha=0 — sin costo visual,
  // pero el programa GLSL se compila en el primer frame normal (no al primer eject).
  return (
    <group ref={grpRef} rotation={[-Math.PI / 2, 0, 0]}>
      <points geometry={_rocketGeo} material={_rocketMat} />
      <pointLight ref={lightRef} color={0xffaa44} intensity={0} distance={5} decay={2} />
    </group>
  );
}


// Ángulos máximos de apertura de tobera (de los TRANSFORM constraints en Blender)
const NOZZLE_OUTER_ANGLE = 1.0856; // rad — pétalos exteriores (Armature.002) a throttle=1 (abierto)
const NOZZLE_INNER_ANGLE = 0.4468; // rad — pétalos interiores (Armature.009) a throttle=1 (abierto)

// Meshes pétalos externos (Armature.002) — cada uno es hijo directo de su bone
// Nombres en Three.js: sin punto (GLTFLoader elimina el separador decimal)
const OUTER_PETAL_MESHES = [
  "F-35C-BODY031","F-35C-BODY030","F-35C-BODY065","F-35C-BODY064","F-35C-BODY032",
  "F-35C-BODY041","F-35C-BODY042","F-35C-BODY045","F-35C-BODY057","F-35C-BODY058",
  "F-35C-BODY059","F-35C-BODY060","F-35C-BODY061","F-35C-BODY062","F-35C-BODY063",
];
// Meshes pétalos internos (Armature.009)
const INNER_PETAL_MESHES = [
  "F-35C-BODY082","F-35C-BODY066","F-35C-BODY067","F-35C-BODY068","F-35C-BODY081",
  "F-35C-BODY080","F-35C-BODY079","F-35C-BODY076","F-35C-BODY075","F-35C-BODY074",
  "F-35C-BODY073","F-35C-BODY072","F-35C-BODY071","F-35C-BODY070","F-35C-BODY069",
];

const ALWAYS_HIDDEN = [
  "engine-part",
  "EuroTyphoon-Body016",
  "EuroTyphoon-Body015",
  // Geometría de escape del modelo — se reemplaza con el efecto de partículas
  "Sphere.005",  // tubo 0.76×8.09×0.75, Y 10→18  (el "porongo blanco" principal)
  "Sphere.004",  // tubo 0.64×2.88×0.59, Y 10→13
  "Sphere.003",  // tubo 0.52×1.94×0.40, Y 10.5→12.5
  "Sphere.010",  // tubo 0.31×2.56×0.31, Y 10→12.6
  "Sphere.011",  // tubo 0.38×1.36×0.37, Y 10→11.4
];

const GEAR_TRAVEL_SECONDS   = 5.0;
const BAY_TRAVEL_SECONDS    = 3.0;
const CANOPY_TRAVEL_SECONDS = 2.0;

// Animaciones de compuertas de armas — se manejan con bayTime independiente del gear.
// Rellenar una vez identificadas con el debug picker (ver F35CTestScene debugAnim).
const WEAPON_BAY_ANIMS = new Set([
  // pendiente identificación visual
]);
const CANOPY_OPEN_ANGLE     = -Math.PI * 0.55;

// Estabilizadores horizontales (stabilators)
// Right bone baja con ángulo positivo, Left bone sube con ángulo positivo
// pitch > 0 = morro sube (ambos bajan)  →  right: +pitch, left: -pitch
// roll  > 0 = rolla derecha (diferencial) → right: -roll,  left: -roll
const STAB_ANGLE            = 20 * Math.PI / 180; // 20° deflexión máxima

// Flaperons (borde trasero de las alas)
// flap  > 0 = ambos bajan (lift)  → right: +flap, left: -flap
// aileron > 0 = rolla derecha: right sube, left baja → right: -aileron, left: -aileron
const FLAPERON_ANGLE        = Math.PI / 4; // 45° deflexión máxima flap
const AILERON_ANGLE         = Math.PI / 6; // 30° deflexión máxima aileron

// Flaps de borde de ataque (leading edge) — siempre simétricos
const LEADING_FLAP_ANGLE    = 25 * Math.PI / 180; // 25° máximo

// Rudders (timones verticales — TopWing-LeftFllap / TopWing-RightFlap)
// rudder > 0 = guiñada derecha: ambos deflectan en la misma dirección relativa a su tail
const RUDDER_ANGLE          = 25 * Math.PI / 180; // 25° máximo

// Weapon bay doors — BODY017-020, 4 paneles en la panza
// Los 4 son hijos de Armature026 (sin keyframes exportados → animación manual)
// Se cierran girando alrededor del eje Z (longitudinal del avión)
// Paneles exteriores (017=derecho, 020=izquierdo) → sign=-1
// Paneles interiores (018=derecho, 019=izquierdo) → sign=+1
const BAY_DOOR_ANGLE  = 90 * Math.PI / 180; // 90° — pose GLB=abierto, bayProgress=1=cerrado
const BAY_DOOR_MESHES = ["F-35C-BODY017","F-35C-BODY018","F-35C-BODY019","F-35C-BODY020"];
const BAY_DOOR_SIGNS  = { "F-35C-BODY017": -1, "F-35C-BODY018": 1, "F-35C-BODY019": -1, "F-35C-BODY020": 1 };
const BAY_DOOR_OFFSET = { "F-35C-BODY017": -4 * Math.PI / 180 }; // offset fino sobre el ángulo base (−=más abierto)

// Wing fold — paneles exteriores se pliegan hacia arriba (~90°)
const WING_FOLD_ANGLE       = Math.PI / 2; // 90°

// Arresting hook (gancho de portaviones)
// La geometría está en Armature.001 / Bone.001-003 (con TRANSFORM constraint al Empty).
// Los valores de rotación vienen del Blender constraint inspector:
//   Bone.003 (brazo)      : fromX 0→90°  → toX 0→1.0926 rad
//   Bone.001 (fairing izq): fromX 0→10°  → toY 0→-1.6808 rad
//   Bone.002 (fairing der): fromX 0→10°  → toY 0→+1.6808 rad
// hookT 0→1 corresponde a 0→90° del Empty; fairings abren en el primer 11% del recorrido.
const HOOK_TRAVEL_SECONDS = 2.5;
const HOOK_ARM_ANGLE      = 1.0926;          // rad — Bone.003 X al máximo despliegue
const HOOK_FAIR_ANGLE     = 1.6808;          // rad — Bone.001/002 Y al máximo (abre rapido)
const HOOK_FAIR_SPEED     = 9.0;             // fairings abren 9× más rápido que el brazo
const HOOK_ANIM           = "Armature.001";  // clip a excluir del mixer de gear

// ─── Identificación de componentes del tren de aterrizaje ────────────────────
// Confirmado visualmente frame a frame (debugGearColors).
// "Izquierdo/Derecho" = desde la vista del usuario mirando el avión desde arriba-frente
// (= lado opuesto al del piloto: izquierdo usuario ≡ ala de estribor del avión)
//
// TREN TRASERO IZQUIERDO (usuario): .043 .044 .046 .047 .048  +  rueda .056
// TREN TRASERO DERECHO  (usuario): .049 .050 .051 .052 .054   +  rueda .055
// TREN DELANTERO:                  .040 .053  +  F-35C-Front-Gear-Hatch-left/right
// ─────────────────────────────────────────────────────────────────────────────
const REAR_GEAR_LEFT  = ["F-35C-BODY043","F-35C-BODY044",
                         "F-35C-BODY046","F-35C-BODY047","F-35C-BODY048",
                         "F-35C-BODY056"]; // rueda izq (usuario)

const DEFAULT_PILOT_POSE   = { elbow: 27, shoulderIn: -13, shoulderFwd: 20, forearmOut: 17, forearmDown: 4, forearmZ: -6, forearmRoll: 60, torso: 8, kneeExt: 30 };
const DEFAULT_PILOT_OFFSET = { x: 1.42, y: 2.4, z: 1.07, tilt: -20.5, scale: 1.37 };

function _applyPilotPose(b, pose) {
  if (!b) return;
  const p = pose ? { ...DEFAULT_PILOT_POSE, ...pose } : DEFAULT_PILOT_POSE;

  const elbowQ        = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI * p.elbow / 180);
  const forearmOutQL  = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0),  Math.PI * p.forearmOut / 180);
  const forearmOutQR  = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0),  Math.PI * p.forearmOut / 180);
  const forearmDnQL   = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI * p.forearmDown / 180);
  const forearmDnQR   = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0),  Math.PI * p.forearmDown / 180);
  const forearmZQL    = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI * p.forearmZ / 180);
  const forearmZQR    = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1),  Math.PI * p.forearmZ / 180);
  const forearmRollQL = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0),  Math.PI * p.forearmRoll / 180);
  const forearmRollQR = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI * p.forearmRoll / 180);
  if (b.lForearm && b.lForearmOrig) b.lForearm.quaternion.copy(b.lForearmOrig.quaternion).premultiply(elbowQ).premultiply(forearmOutQL).premultiply(forearmDnQL).premultiply(forearmZQL).multiply(forearmRollQL);
  if (b.rForearm && b.rForearmOrig) b.rForearm.quaternion.copy(b.rForearmOrig.quaternion).premultiply(elbowQ).premultiply(forearmOutQR).premultiply(forearmDnQR).premultiply(forearmZQR).multiply(forearmRollQR);

  const shoulderInQL  = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI * p.shoulderIn / 180);
  const shoulderInQR  = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1),  Math.PI * p.shoulderIn / 180);
  const shoulderFwdQL = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0),  Math.PI * p.shoulderFwd / 180);
  const shoulderFwdQR = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI * p.shoulderFwd / 180);
  if (b.lUpperArm && b.lUpperArmOrig) b.lUpperArm.quaternion.copy(b.lUpperArmOrig.quaternion).premultiply(shoulderInQL).premultiply(shoulderFwdQL);
  if (b.rUpperArm && b.rUpperArmOrig) b.rUpperArm.quaternion.copy(b.rUpperArmOrig.quaternion).premultiply(shoulderInQR).premultiply(shoulderFwdQR);

  const torsoQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * p.torso / 180);
  if (b.spineClone && b.spineOrig) b.spineClone.quaternion.copy(b.spineOrig.quaternion).premultiply(torsoQ);

  const kneeExtQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI * p.kneeExt / 180);
  if (b.lShin) b.lShin.bone.quaternion.copy(b.lShin.seatedQ).premultiply(kneeExtQ);
  if (b.rShin) b.rShin.bone.quaternion.copy(b.rShin.seatedQ).premultiply(kneeExtQ);
}

const WHEEL_NAMES       = ["F-35C-BODY055", "F-35C-BODY056"]; // traseras — stow + spin
const WHEEL_STOW_ANGLE  = 70 * Math.PI / 180;
const WHEEL_STOW_LIFT   = 0.14;
const WHEEL_STOW_INWARD = 0.08;

export default function F35C({
  url         = "/F-35C.glb",
  scale       = 1,
  position    = [0, 0, 0],
  rotation    = [0, 0, 0],
  gearDown    = true,
  canopyOpen  = false,
  pitch       = 0,  // -1 a +1 · >0 = morro sube
  roll        = 0,  // -1 a +1 · >0 = rolla derecha
  flap        = 0,  //  0 a +1 · >0 = flap baja (lift)
  aileron     = 0,  // -1 a +1 · >0 = rolla derecha (flaperon diferencial) — usado cuando no hay controlsRef
  leadingFlap  = 0,  //  0 a +1 · >0 = borde de ataque droop
  rudder       = 0,  // -1 a +1 · >0 = guiñada derecha
  weaponBayOpen = false,
  wingFold     = 0,  //  0 a +1 · 0=extendido 1=plegado arriba
  hookDown     = false, // true=desplegado, false=recogido
  throttle     = 0,    // 0=tobera cerrada/off · 1=postcombustión plena
  hiddenWeapons = null, // Set de IDs a ocultar, e.g. new Set(["amraam_l_ext"])
  eject                = false, // true → dispara secuencia de eyección
  ejectTriggerRef      = null,  // si se provee, se llena con () => trigger() para disparo síncrono
  resetEjectTriggerRef = null,  // si se provee, se llena con () => reset()
  pilotPose    = null,  // { elbow, shoulderIn, shoulderFwd, forearmOut, forearmDown, forearmZ, forearmRoll, torso, kneeExt }
  pilotOffset  = null,  // { x, y, z, tilt, scale }
  chuteParams  = null,  // { shoulderOffset, riserX, riserSep, riserWidth, confY }
  taxiSpeedRef = null,  // ref con velocidad en tierra (m/s) para girar ruedas
  rearWheelWobbleRef = null, // ref 0..1 para recortar Y/Z del eje trasero en tiempo real
  rearWheelLiftAmount = WHEEL_STOW_LIFT, // altura Y que ganan las ruedas traseras al retraerse
  rearWheelStowOverride = null, // 0..1 override manual del extra de retracción de ruedas traseras
  debugRearWheelAxes = false,
  controlsRef  = null,  // ref con { throttle, roll, pitch, ... } del FlightController

  debugAnim      = null,
  debugProgress  = 1,
  debugGearColors = false,
}) {
  const groupRef        = useRef(null);
  const weaponMeshRefs  = useRef({});
  const wheelSpinRef        = useRef([]);   // [{ pivot, axis, angle }]
  const wheelSmoothSpeedRef = useRef(0);    // velocidad suavizada para inercia de rueda
  const wheelAxisTmp        = useRef(new Vector3());
  const targetTime   = useRef(0);
  const animTime     = useRef(0);
  const bayTarget    = useRef(0);
  const bayTime      = useRef(0);
  const canopyTarget = useRef(0);
  const canopyT      = useRef(0);
  const wheelBones      = useRef([]);
  const wheelBaseReady  = useRef(false);
  const canopyPivot  = useRef(null);
  const stabLeft      = useRef(null); // { obj, baseQ }
  const stabRight     = useRef(null);
  const stabBaseReady = useRef(false); // se fija en el primer frame post-mixer
  const flapLeft      = useRef(null); // { obj, baseQ }
  const flapRight     = useRef(null);
  const flapBaseReady = useRef(false);
  const leadLeft      = useRef(null); // { obj, baseQ }
  const leadRight     = useRef(null);
  const leadBaseReady = useRef(false);
  const rudderLeft    = useRef(null); // { obj, baseQ }  TopWing-LeftFllap
  const rudderRight   = useRef(null); // { obj, baseQ }  TopWing-RightFlap
  const rudderReady   = useRef(false);
  const bayDoors      = useRef([]);   // [{ bone, baseQ, sign }]  BODY017-020
  const bayDoorsReady = useRef(false);
  // Ladder hatch — F-35C-Ledder-Hatch, parented a Armature.014/Bone
  // El GLB la tiene fija abierta (~97° en Y) en todos sus keyframes → se fuerza a identidad
  const ladderHatchBone = useRef(null);
  // Wing fold: 2 bones por lado (leading + trailing del panel exterior)
  const wingFoldBones = useRef([]); // [{ obj, baseQ, sign }]
  const wingFoldReady = useRef(false);
  // Arresting hook — tres bones de Armature.001
  const hookBones     = useRef(null); // { arm, b3, b1, b2, bq3, bq1, bq2 }
  const hookReady     = useRef(false);
  const hookTarget    = useRef(0);    // 0=recogido, 1=desplegado
  const hookT         = useRef(0);
  // Tobera / throttle
  const throttleTarget = useRef(0);  // 0-1 objetivo
  const throttleT      = useRef(0);  // 0-1 suavizado (usado para anim + exhaust)
  const nozzlePosRef   = useRef(null); // Vector3 posición boca tobera (local al grupo)
  const nozzleBones    = useRef([]);   // [{bone, maxAngle, baseQ}] — pétalos exteriores e interiores
  const nozzleReady    = useRef(false);
  const turbineMesh    = useRef(null); // F-35C-BODY.002 — disco turbina visible en tobera
  // Eyección
  const ejectionState  = useRef({
    active: false, t: 0, seatSep: false, chuteT: 0,
    chuteJolted: false,   // flag: sacudón al abrirse el canopy
    pilotPos: new Vector3(), pilotVel: new Vector3(),
    seatPos:  new Vector3(), seatVel:  new Vector3(),
    seatOmega: new Vector3(2.1, 0.4, 1.6),
    pilotBaseQ: new Quaternion(),
    joltLegAmp: 0,  // amplitud del sacudón de piernas (decae a 0)
    saved: null, // snapshot de transforms antes del eject para poder resetear
  });
  const pilotObjRef    = useRef(null);
  const seatObjRef     = useRef(null);
  const helmetObjRef   = useRef(null);
  const chuteRef       = useRef(null);
  // Piloto rigged (Pilot.glb separado)
  const riggedPilotRef       = useRef(null); // Scene root del piloto rigged
  const pilotSkinnedMeshRef  = useRef(null); // SkinnedMesh dentro del scene
  const pilotVisualOffsetRef = useRef(new Vector3()); // offset local SkinnedMesh − scene root

  // Propulsor del asiento
  const seatRocketPosRef       = useRef(new Vector3());
  const seatRocketIntensityRef = useRef(0);
  const smokeStateRef          = useRef({ active: false, t: 0, pos: new Vector3() });
  // Cabina volando
  const canopyFlyObj   = useRef(null);
  const canopyFlyActive = useRef(false);
  const canopyFlyPos   = useRef(new Vector3());
  const canopyFlyVel   = useRef(new Vector3());
  const canopyFlyOmega = useRef(new Vector3());
  // Brazos con keyframes corruptos — se ocultan durante la transición del gear
  const gearClipMeshes = useRef([]);
  const debugAnimRef  = useRef(debugAnim);

  const { scene, animations } = useGLTF(url);
  const clonedScene = useMemo(() => cloneSkinnedScene(scene), [scene]);
  const { actions, mixer } = useAnimations(animations, groupRef);
  const { scene: rootScene, gl, camera } = useThree();

  // Piloto rigged — GLB separado con armature + animación eject_legs
  const { scene: pilotGLB, animations: pilotAnims } = useGLTF('/PilotOriginal.glb');
  const clonedPilotScene = useMemo(() => cloneSkinnedScene(pilotGLB), [pilotGLB]);
  const pilotMixerRef    = useRef(null); // { boneName: { bone, seatedQ, straightQ } }
  const pilotMorphGrabRef = useRef(null); // { mesh, index } — morph target brazos arriba
  const pilotPoseBonesRef = useRef(null);
  const pilotPoseRef      = useRef(pilotPose);
  pilotPoseRef.current    = pilotPose; // actualizar cada render sin disparar efectos // { lForearm, rForearm, lForearmOrig, rForearmOrig, lUpperArm, rUpperArm, lUpperArmOrig, rUpperArmOrig, spineClone, spineOrig }

  // triggerEject — en ref para ser accesible desde keyboard listener sin stale closure
  const triggerEjectRef = useRef(null);
  triggerEjectRef.current = function triggerEject() {
    const es = ejectionState.current;
    if (es.active) return;

    // ── 0. Snapshot para reset ────────────────────────────────────────────────
    const snapObj = (obj) => obj ? {
      obj, parent: obj.parent,
      lp: obj.position.clone(), lq: obj.quaternion.clone(), ls: obj.scale.clone(),
    } : null;
    const pivotForSnap = canopyPivot.current?.pivot ?? null;
    es.saved = {
      canopy:  snapObj(pivotForSnap),
      seat:    snapObj(seatObjRef.current),
      helmet:  snapObj(helmetObjRef.current),
    };

    // ── 1. Cabina: desanclar del avión y lanzar violentamente ────────────────
    const pivotInfo = canopyPivot.current;
    if (pivotInfo) {
      const { pivot } = pivotInfo;
      const wp = new Vector3(), wq = new Quaternion(), ws = new Vector3();
      pivot.getWorldPosition(wp);
      pivot.getWorldQuaternion(wq);
      pivot.getWorldScale(ws);
      pivot.removeFromParent();
      rootScene.add(pivot);
      pivot.position.copy(wp);
      pivot.quaternion.copy(wq);
      pivot.scale.copy(ws);
      canopyFlyObj.current    = pivot;
      canopyFlyPos.current.copy(wp);
      canopyFlyVel.current.set(0.4, 20.0, -3.5);  // fuerte hacia arriba + adelante
      canopyFlyOmega.current.set(3.5, 5.0, 4.2);  // tumble agresivo
      canopyFlyActive.current = true;
      canopyPivot.current     = null;              // evitar que useFrame la anime
    }

    // ── 2. Piloto / asiento: desanclar a rootScene ───────────────────────────
    [pilotObjRef, seatObjRef, helmetObjRef].forEach((ref) => {
      const obj = ref.current;
      if (!obj) return;
      const wp = new Vector3(), wq = new Quaternion(), ws = new Vector3();
      obj.getWorldPosition(wp); obj.getWorldQuaternion(wq); obj.getWorldScale(ws);
      obj.removeFromParent();
      rootScene.add(obj);
      obj.position.copy(wp);
      obj.quaternion.copy(wq);
      obj.scale.copy(ws);
    });

    // Capturar quaternion base del piloto (ya en rootScene → quaternion == world)
    const pilotObj  = pilotObjRef.current;
    const helmetObj = helmetObjRef.current;
    if (pilotObj) es.pilotBaseQ.copy(pilotObj.quaternion);

    // Actualizar matrices ahora que el piloto está en rootScene con posición final
    if (pilotObj) pilotObj.updateMatrixWorld(true);

    // Reparentar casco al piloto: así sigue automáticamente cualquier rotación
    if (pilotObj && helmetObj) {
      pilotObj.worldToLocal(helmetObj.position);   // world pos → local del piloto
      helmetObj.quaternion.premultiply(pilotObj.quaternion.clone().invert());
      pilotObj.add(helmetObj);
    }

    const initPilotPos = new Vector3();
    const initSeatPos  = new Vector3();
    // Recomputar offset visual con matrices válidas:
    // pilotVisualOffsetRef = offset relativo (visual center − scene root), en world space.
    // Se usa cada frame como: pilotObj.position = es.pilotPos − pilotVisualOffsetRef
    if (pilotObj) {
      const sm = pilotSkinnedMeshRef.current;
      if (sm) {
        sm.geometry.computeBoundingBox();
        const center = new Vector3();
        sm.geometry.boundingBox.getCenter(center);
        sm.localToWorld(center);                                  // world pos del centro visual
        pilotVisualOffsetRef.current.copy(center).sub(pilotObj.position); // offset relativo
        initPilotPos.copy(center);                                // arrancar desde el centro real
      } else {
        pilotVisualOffsetRef.current.set(0, 0, 0);
        pilotObj.getWorldPosition(initPilotPos);
      }
    }
    seatObjRef.current?.getWorldPosition(initSeatPos);

    // El humo arranca cuando dispara la catapulta (T_IGN=0.05s), no inmediatamente.
    // Se activa desde useFrame al detectar t >= T_IGN para sincronizar con el movimiento.
    _resetSmokeParticles();
    smokeStateRef.current.active = false;
    smokeStateRef.current.t      = 0;
    smokeStateRef.current.pos.copy(initPilotPos);

    es.active   = true;
    es.t        = 0;
    es.seatSep  = false;
    es.chuteT   = 0;
    es.pilotPos.copy(initPilotPos);
    es.pilotVel.set(0, 0, 0);   // velocidad inicial cero — las fases la construyen
    es.seatPos.copy(initSeatPos);
    es.seatVel.set(0, 0, 0);
  };

  useEffect(() => {

    ALWAYS_HIDDEN.forEach((name) => {
      const obj = clonedScene.getObjectByName(name);
      if (obj) obj.visible = false;
    });

    // Geometría de escape del modelo — ocultar todo lo que tenga "Sphere" en el nombre
    clonedScene.traverse(obj => {
      if (obj.name.includes('Sphere')) obj.visible = false;
    });

    // Separar "Wepons" en sub-meshes individuales por zona X.
    // Cada arma queda como un Mesh independiente → se puede mostrar/ocultar.
    weaponMeshRefs.current = {};
    const wepons = clonedScene.getObjectByName("Wepons");
    if (wepons?.isMesh) {
      const geo = wepons.geometry;
      const pos = geo.attributes.position;
      // Guard: si pos no existe, la geometría ya fue reemplazada (StrictMode double-invoke)
      if (pos) {
      wepons.updateWorldMatrix(true, false);
      const wmat    = wepons.matrixWorld;
      const origMat = Array.isArray(wepons.material) ? wepons.material[0] : wepons.material;

      // Pre-calcular world X por vértice
      const tmp    = new Vector3();
      const worldX = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        tmp.fromBufferAttribute(pos, i).applyMatrix4(wmat);
        worldX[i] = tmp.x;
      }

      // Asignación por X — las bahías quedan separadas por los splits 2.26 y 0.80
      const vertexZone = new Int16Array(pos.count).fill(-1);
      for (let i = 0; i < pos.count; i++) {
        const x = worldX[i];
        vertexZone[i] = WEAPON_ZONES.findIndex(z => x >= z.minX && x < z.maxX);
      }

      // Asignar triángulos: solo si los 3 vértices están en la misma zona (strict 3/3)
      const weaponIdxs = WEAPON_ZONES.map(() => []);
      const idxArr     = geo.index?.array;
      const triCount   = idxArr ? idxArr.length / 3 : pos.count / 3;

      for (let t = 0; t < triCount; t++) {
        const i0 = idxArr ? idxArr[t*3]   : t*3;
        const i1 = idxArr ? idxArr[t*3+1] : t*3+1;
        const i2 = idxArr ? idxArr[t*3+2] : t*3+2;
        const w  = vertexZone[i0];
        if (w >= 0 && w === vertexZone[i1] && w === vertexZone[i2]) {
          weaponIdxs[w].push(i0, i1, i2);
        }
      }

      // Crear sub-meshes como HIJOS de "Wepons" (transform identidad — misma local space)
      // Wepons queda visible=false pero sus hijos se controlan individualmente
      WEAPON_ZONES.forEach((zone, w) => {
        if (!weaponIdxs[w].length) return;
        const subGeo = new BufferGeometry();
        subGeo.setAttribute("position", pos);
        if (geo.attributes.normal) subGeo.setAttribute("normal", geo.attributes.normal);
        if (geo.attributes.uv)     subGeo.setAttribute("uv",     geo.attributes.uv);
        subGeo.setIndex(weaponIdxs[w]);

        const mat = origMat.clone();
        mat.color.setHex(zone.color);
        mat.vertexColors = false;
        mat.needsUpdate  = true;

        const mesh = new Mesh(subGeo, mat);
        mesh.name = `Weapon_${zone.id}`;
        if (zone.zOffset) mesh.position.z = zone.zOffset;
        if (zone.xOffset) mesh.position.x = zone.xOffset;
        wepons.add(mesh);
        weaponMeshRefs.current[zone.id] = mesh;
      });

      // Vaciar la geometría original en lugar de ocultar todo el nodo
      // (ocultar el nodo ocultaría también los hijos)
      wepons.geometry = new BufferGeometry();
      } // end if (pos)
    }   // end if (wepons?.isMesh)

    // Rear wheel bones — baseQ captured lazily in useFrame (post mixer.update)
    wheelBaseReady.current = false;
    wheelSpinRef.current   = [];
    wheelBones.current = WHEEL_NAMES.flatMap((name) => {
      const withDot = name.replace(/BODY(\d)/, "BODY.$1");
      const obj = clonedScene.getObjectByName(name) ?? clonedScene.getObjectByName(withDot);
      if (!obj || !obj.parent) { console.warn(`[F35C] wheel not found: ${name}`); return []; }
      const bone = obj.parent;
      const arm  = bone.parent ?? bone;
      const worldPos = new Vector3();
      arm.getWorldPosition(worldPos);
      const inwardSign = worldPos.x >= 0 ? -1 : 1;

      // BODY055/056 spin pendiente (mesh incluye strut, necesita split primero)
      return [{ bone, baseQ: null, arm, baseArmPos: null, inwardSign }];
    });

    // Rueda delantera — solo spin (BODY040 es solo la rueda, sin strut)
    // Estabilizadores — baseQ se captura en el primer frame post-mixer
    // ── Pintura de cubiertas y llantas ────────────────────────────────────────
    // Colores llamativos para identificación:
    //   ROJO    = cubierta/goma (tread)
    //   AMARILLO = llanta/rim
    //   AZUL    = eje/strut
    const strutMat = new MeshStandardMaterial({ color: 0x0088ff, roughness: 0.4, metalness: 0.5 });

    // ── BODY040: split en runtime (L/axle/R) — sin tocar el GLB ──────────────
    const body040name = "F-35C-BODY040";
    const body040 = clonedScene.getObjectByName(body040name)
                 ?? clonedScene.getObjectByName("F-35C-BODY.040");
    // PCA: encuentra el eigenvector más pequeño de la covarianza = eje del disco (axle direction exacto)
    const wheelAxisPCA = (geo, forceNeg = false) => {
      const pos = geo.getAttribute('position');
      const n = pos.count;
      if (n < 3) return new Vector3(forceNeg ? -1 : 1, 0, 0);
      let cx=0,cy=0,cz=0;
      for(let i=0;i<n;i++){cx+=pos.getX(i);cy+=pos.getY(i);cz+=pos.getZ(i);}
      cx/=n; cy/=n; cz/=n;
      let mxx=0,myy=0,mzz=0,mxy=0,mxz=0,myz=0;
      for(let i=0;i<n;i++){
        const x=pos.getX(i)-cx, y=pos.getY(i)-cy, z=pos.getZ(i)-cz;
        mxx+=x*x; myy+=y*y; mzz+=z*z; mxy+=x*y; mxz+=x*z; myz+=y*z;
      }
      const mv = ([a,b,c]) => [mxx*a+mxy*b+mxz*c, mxy*a+myy*b+myz*c, mxz*a+myz*b+mzz*c];
      const nm = v => { const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2)||1; return v.map(x=>x/l); };
      const dt = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
      // Eigenvector mayor (power iteration)
      let v1 = nm([1,1,1]);
      for(let i=0;i<60;i++) v1=nm(mv(v1));
      const λ1 = dt(mv(v1),v1);
      // Deflate y segundo eigenvector
      const mv2 = ([a,b,c]) => { const r=mv([a,b,c]); const d=dt(v1,[a,b,c]); return [r[0]-λ1*d*v1[0],r[1]-λ1*d*v1[1],r[2]-λ1*d*v1[2]]; };
      let v2 = nm([v1[1]-v1[2],v1[2]-v1[0],v1[0]-v1[1]]);
      for(let i=0;i<60;i++) v2=nm(mv2(v2));
      // Tercer eigenvector = producto vectorial (el más pequeño = axle)
      const v3 = nm([v1[1]*v2[2]-v1[2]*v2[1], v1[2]*v2[0]-v1[0]*v2[2], v1[0]*v2[1]-v1[1]*v2[0]]);
      const axis = new Vector3(v3[0],v3[1],v3[2]);
      if (forceNeg && axis.x > 0) axis.negate();
      if (!forceNeg && axis.x < 0) axis.negate();
      return axis;
    };

    const createAxisDebugLine = (axis, color = 0x00ffff, length = 1.2) => {
      const dir = axis.clone().normalize().multiplyScalar(length * 0.5);
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute([
        -dir.x, -dir.y, -dir.z,
         dir.x,  dir.y,  dir.z,
      ], 3));
      const mat = new LineBasicMaterial({ color, depthTest: false, depthWrite: false });
      const line = new Line(geo, mat);
      line.renderOrder = 999;
      return line;
    };

    const body040L = clonedScene.getObjectByName(`${body040name}_L`);
    const body040R = clonedScene.getObjectByName(`${body040name}_R`);
    if (body040L && body040R) {
      // Ya spliteado — re-registrar con eje PCA
      wheelSpinRef.current.push({ pivot: body040L, axis: wheelAxisPCA(body040L.geometry, false), spinSign: 1 });
      wheelSpinRef.current.push({ pivot: body040R, axis: wheelAxisPCA(body040R.geometry, false), spinSign: 1 });
    } else if (body040 && body040.visible) {
      const split = splitMeshByIslandX(body040, { leftMax: 1.65, rightMin: 1.72 });
      if (split) {
        const axleMesh = new Mesh(split.axle, strutMat.clone());
        axleMesh.name = `${body040name}_axle`;
        axleMesh.position.copy(body040.position);
        axleMesh.quaternion.copy(body040.quaternion);
        axleMesh.scale.copy(body040.scale);

        const wheelMat = new MeshStandardMaterial({ color: 0xff1a1a, roughness: 0.8, metalness: 0.0 });
        clonedScene.updateMatrixWorld(true);
        const applyWheelByNormal = (geo, label) => {
          // Paso 1: normals sobre geometría original
          geo.computeVertexNormals();
          const pos = geo.getAttribute('position');
          const nml = geo.getAttribute('normal');

          // Paso 2: centroide de vértices rim (|nx|>0.7) = centro real de la rueda
          let rcx=0,rcy=0,rcz=0, nRim=0, ax=0,ay=0,az=0;
          for (let i=0; i<nml.count; i++) {
            const nx = nml.getX(i);
            if (Math.abs(nx) > 0.7) {
              rcx+=pos.getX(i); rcy+=pos.getY(i); rcz+=pos.getZ(i);
              ax+=nml.getX(i); ay+=nml.getY(i); az+=nml.getZ(i);
              nRim++;
            }
          }
          let cx, cy, cz;
          if (nRim > 0) {
            cx=rcx/nRim; cy=rcy/nRim; cz=rcz/nRim;
          } else {
            let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
            for (let i=0; i<pos.count; i++) {
              const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
              if(x<minX)minX=x; if(x>maxX)maxX=x;
              if(y<minY)minY=y; if(y>maxY)maxY=y;
              if(z<minZ)minZ=z; if(z>maxZ)maxZ=z;
            }
            cx=(minX+maxX)/2; cy=(minY+maxY)/2; cz=(minZ+maxZ)/2;
          }

          // Paso 3: centrar
          for (let i=0; i<pos.count; i++) pos.setXYZ(i, pos.getX(i)-cx, pos.getY(i)-cy, pos.getZ(i)-cz);
          pos.needsUpdate = true;
          geo.computeVertexNormals();

          // Paso 4: eje exacto por PCA
          const axleAxis = wheelAxisPCA(geo, false);
          console.log(`[F35C] ${label} PCA axleAxis: (${axleAxis.x.toFixed(4)}, ${axleAxis.y.toFixed(4)}, ${axleAxis.z.toFixed(4)}) center:(${cx.toFixed(3)},${cy.toFixed(3)},${cz.toFixed(3)})`);

          const tmpMesh = new Mesh(geo, wheelMat.clone());
          tmpMesh.name = `${body040name}_${label}`;
          // Hijo de body040 para heredar su animación — posición en espacio LOCAL de body040
          tmpMesh.position.set(cx, cy, cz);
          tmpMesh.quaternion.identity();
          tmpMesh.scale.set(1, 1, 1);
          body040.add(tmpMesh);
          wheelSpinRef.current.push({ pivot: tmpMesh, axis: axleAxis, spinSign: 1 });
          return tmpMesh;
        };

        applyWheelByNormal(split.L, 'L');
        applyWheelByNormal(split.R, 'R');
        // Axle también hijo de body040
        axleMesh.position.set(0, 0, 0);
        axleMesh.quaternion.identity();
        axleMesh.scale.set(1, 1, 1);
        body040.add(axleMesh);
        // Vaciar la geometría de body040 (sigue en jerarquía y anima, pero no renderiza)
        body040.geometry = new BufferGeometry();
        console.log(`[F35C] BODY040 split OK — L:${split.L.attributes.position.count/3}t axle:${split.axle.attributes.position.count/3}t R:${split.R.attributes.position.count/3}t`);
      } else {
        console.warn('[F35C] splitMeshByIslandX falló para BODY040');
      }
    }

    // ── BODY055/056: tren trasero — split wheel/strut por Y, pintura por normal ─
    // Wheel axis = X. BODY055: corte por X en 0.45. BODY056: corte por Z en -2.83.
    if (
      body040 &&
      body040.visible &&
      !body040L &&
      !body040R &&
      !wheelSpinRef.current.some(({ pivot }) => pivot === body040)
    ) {
      clonedScene.updateMatrixWorld(true);
      const invWorld = new Matrix4().copy(body040.matrixWorld).invert();
      const localAxis = new Vector3(0, 0, 1).transformDirection(invWorld).normalize();
      wheelSpinRef.current.push({ pivot: body040, axis: localAxis, spinSign: 1 });
    }

    const rearWheelDefs = [
      { name: "F-35C-BODY055", dotName: "F-35C-BODY.055", axis: 'x', cut: 0.45,  wheelBelow: true  },
      { name: "F-35C-BODY056", dotName: "F-35C-BODY.056", axis: 'x', cut: 2.57,  wheelBelow: false },
    ];
    for (const { name, dotName, axis, cut, wheelBelow } of rearWheelDefs) {
      const obj = clonedScene.getObjectByName(name) ?? clonedScene.getObjectByName(dotName);
      if (!obj) { console.warn(`[F35C] no encontrado: ${name}`); continue; }
      const existingWheel = obj.parent?.children.find(c => c.name === `${name}_wheel`);
      if (existingWheel) {
        // Ya spliteado — re-registrar con eje PCA
        const rearAxis = wheelAxisPCA(existingWheel.geometry, true);
        if (debugRearWheelAxes && !existingWheel.getObjectByName(`${name}_axisDebug`)) {
          const axisLine = createAxisDebugLine(rearAxis, name.endsWith("055") ? 0x00ffff : 0xffaa00);
          axisLine.name = `${name}_axisDebug`;
          existingWheel.add(axisLine);
        }
        wheelSpinRef.current.push({ pivot: existingWheel, axis: rearAxis, baseAxis: rearAxis.clone(), isRearWheel: true });
        continue;
      }
      const split = splitMeshTwoWay(obj, axis, cut);
      if (!split) { console.warn(`[F35C] split falló: ${name}`); continue; }
      const wheelGeo = wheelBelow ? split.below : split.above;
      const strutGeo = wheelBelow ? split.above : split.below;

      // Paso 1: computar normales en la geometría original (pre-centrado)
      wheelGeo.computeVertexNormals();
      const wpos = wheelGeo.getAttribute('position');
      const wnml = wheelGeo.getAttribute('normal');

      // Paso 2: bbox midpoint para el centro — más robusto cuando solo hay una cara rim
      // (splitMeshTwoWay produce geometría con solo la cara rim exterior, no ambas)
      let wminX=Infinity,wmaxX=-Infinity,wminY=Infinity,wmaxY=-Infinity,wminZ=Infinity,wmaxZ=-Infinity;
      let rcx=0, rcy=0, rcz=0, nRim=0;
      for (let i=0; i<wpos.count; i++) {
        const x=wpos.getX(i),y=wpos.getY(i),z=wpos.getZ(i);
        if(x<wminX)wminX=x; if(x>wmaxX)wmaxX=x;
        if(y<wminY)wminY=y; if(y>wmaxY)wmaxY=y;
        if(z<wminZ)wminZ=z; if(z>wmaxZ)wmaxZ=z;
        if (Math.abs(wnml.getX(i)) > 0.7) {
          rcx += x; rcy += y; rcz += z;
          nRim++;
        }
      }
      const wcx=(wminX+wmaxX)/2;
      const wcy=nRim > 0 ? rcy / nRim : (wminY+wmaxY)/2;
      const wcz=nRim > 0 ? rcz / nRim : (wminZ+wmaxZ)/2;

      // Paso 3: centrar geometría en bbox midpoint
      for (let i=0; i<wpos.count; i++) wpos.setXYZ(i, wpos.getX(i)-wcx, wpos.getY(i)-wcy, wpos.getZ(i)-wcz);
      wpos.needsUpdate = true;
      wheelGeo.computeVertexNormals();

      // Paso 4: eje exacto por PCA — eigenvector mínimo de la covarianza = disc normal
      const rearAxleAxis = wheelAxisPCA(wheelGeo, true);
      console.log(`[F35C] ${name} PCA axleAxis: (${rearAxleAxis.x.toFixed(4)}, ${rearAxleAxis.y.toFixed(4)}, ${rearAxleAxis.z.toFixed(4)}) center:(${wcx.toFixed(3)},${wcy.toFixed(3)},${wcz.toFixed(3)})`);

      const wheelMesh = new Mesh(wheelGeo, new MeshStandardMaterial({ color: 0xff1a1a, roughness: 0.8, metalness: 0.0 }));
      wheelMesh.name = `${name}_wheel`;
      // Posición = centro de la rueda en espacio del parent
      wheelMesh.position.copy(new Vector3(wcx, wcy, wcz).applyMatrix4(obj.matrix));
      wheelMesh.quaternion.copy(obj.quaternion);
      wheelMesh.scale.copy(obj.scale);

      // Strut: material original clonado (sin pintar)
      const strutMat2 = Array.isArray(obj.material) ? obj.material[0].clone() : obj.material.clone();
      const strutMesh = new Mesh(strutGeo, strutMat2);
      strutMesh.name = `${name}_strut`;
      strutMesh.position.copy(obj.position);
      strutMesh.quaternion.copy(obj.quaternion);
      strutMesh.scale.copy(obj.scale);

      obj.parent.add(wheelMesh, strutMesh);
      obj.visible = false;
      if (debugRearWheelAxes) {
        const axisLine = createAxisDebugLine(rearAxleAxis, name.endsWith("055") ? 0x00ffff : 0xffaa00);
        axisLine.name = `${name}_axisDebug`;
        wheelMesh.add(axisLine);
      }
      wheelSpinRef.current.push({ pivot: wheelMesh, axis: rearAxleAxis, baseAxis: rearAxleAxis.clone(), isRearWheel: true });
      console.log(`[F35C] ${name} split wheel:${wheelGeo.attributes.position.count/3}t strut:${strutGeo.attributes.position.count/3}t`);
    }

    const left  = clonedScene.getObjectByName("ButtomWing-LeftFlap");
    const right = clonedScene.getObjectByName("ButtomWing-RightFlap");
    if (left)  stabLeft.current  = { obj: left,  baseQ: null };
    if (right) stabRight.current = { obj: right, baseQ: null };
    stabBaseReady.current = false;

    // Flaperons (borde trasero) — baseQ se captura igual en el primer frame
    const fl = clonedScene.getObjectByName("MainBack-LeftFlap");
    const fr = clonedScene.getObjectByName("MainBack-RightFlap");
    if (fl) flapLeft.current  = { obj: fl, baseQ: null };
    if (fr) flapRight.current = { obj: fr, baseQ: null };
    flapBaseReady.current = false;

    // Flaps de borde de ataque (leading edge)
    const ll = clonedScene.getObjectByName("MainFront-LeftFlap");
    const lr = clonedScene.getObjectByName("MainFront-RightFlap");
    if (ll) leadLeft.current  = { obj: ll, baseQ: null };
    if (lr) leadRight.current = { obj: lr, baseQ: null };
    leadBaseReady.current = false;

    // Rudders — timones verticales
    const rl = clonedScene.getObjectByName("TopWing-LeftFllap");  // typo en el GLB ("Fllap")
    const rr = clonedScene.getObjectByName("TopWing-RightFlap");
    if (rl) rudderLeft.current  = { obj: rl, baseQ: null };
    else    console.warn("[F35C] rudder left not found (TopWing-LeftFllap)");
    if (rr) rudderRight.current = { obj: rr, baseQ: null };
    else    console.warn("[F35C] rudder right not found (TopWing-RightFlap)");
    rudderReady.current = false;

    // Wing fold — buscar bones por traverse para evitar problemas de nombre
    const wfNames = new Set([
      "ButtomWing-LeftFlap001", "MainBack-LeftFlap001",
      "ButtomWing-LeftFlap002", "MainBack-LeftFlap002",
    ]);
    const wfSign = {
      "ButtomWing-LeftFlap001":  1, "MainBack-LeftFlap001":  1,
      "ButtomWing-LeftFlap002": -1, "MainBack-LeftFlap002": -1,
    };
    wingFoldBones.current = [];
    clonedScene.traverse(obj => {
      if (wfNames.has(obj.name)) {
        wingFoldBones.current.push({ obj, baseQ: null, sign: wfSign[obj.name] });
      }
    });
    if (wingFoldBones.current.length === 0) {
      // Fallback: log todos los nombres con "Flap" para diagnóstico
    }
    wingFoldReady.current = false;


    // Ladder hatch — el GLB la tiene fija abierta; capturamos el bone del parent
    const ladderMesh = clonedScene.getObjectByName("F-35C-Ledder-Hatch");
    ladderHatchBone.current = ladderMesh?.parent ?? null;
    if (!ladderMesh) console.warn("[F35C] ladder hatch not found (F-35C-Ledder-Hatch)");

    // Turbina — disco fan visible a través de la tobera
    turbineMesh.current =
      clonedScene.getObjectByName("F-35C-BODY.002") ??
      clonedScene.getObjectByName("F-35C-BODY002") ?? null;
    if (!turbineMesh.current) console.warn("[F35C] turbine mesh not found (F-35C-BODY.002)");

    // Meshes mal posicionados en el GLB — se ocultan
    for (const name of ["f35b-body033", "f35b-body034", "f35b-body059", "f35b-body060"]) {
      const obj = clonedScene.getObjectByName(name);
      if (obj) obj.visible = false;
    }

    // BODY044: brazo tren izq con keyframes corruptos (f22-f29).
    // Su path de interpolación cruza el ala — se oculta en la fase problemática
    // (t > 0.72 = aprox f21/29) hasta que queda dentro del fuselaje.
    gearClipMeshes.current = ["F-35C-BODY044"].flatMap(name => {
      const withDot = name.replace(/BODY(\d)/, "BODY.$1");
      const obj = clonedScene.getObjectByName(name) ?? clonedScene.getObjectByName(withDot);
      if (!obj) { console.warn(`[F35C] gearClip not found: ${name}`); return []; }
      return [obj];
    });

    // Debug: pintar piezas del tren trasero — loguear todos los nombres reales
    if (debugGearColors) {
      // Paso 1: loguear TODOS los nodos cuyo nombre contiene BODY04 o BODY05
      clonedScene.traverse(obj => {
        if (/BODY[._]?0[45]\d/i.test(obj.name)) { /* debug: obj.name */ }
      });

      // Paso 2: intentar con punto y sin punto
      const paintByName = (name, hex) => {
        // Intentar con punto (e.g. "F-35C-BODY.049") y sin punto (e.g. "F-35C-BODY049")
        const candidates = [name, name.replace(/BODY(\d)/, "BODY.$1")];
        for (const n of candidates) {
          const obj = clonedScene.getObjectByName(n);
          if (obj) {
            obj.traverse(child => {
              if (child.isMesh) {
                child.material = child.material.clone();
                child.material.color.setHex(hex);
                if (child.material.emissive) {
                  child.material.emissive.setHex(hex);
                  child.material.emissiveIntensity = 0.4;
                }
              }
            });
            return;
          }
        }
        console.warn(`[GearDebug] NOT FOUND: "${name}"`);
      };

      // Tren trasero IZQUIERDO — un color por pieza, mismo orden que REAR_GEAR_LEFT
      const DEBUG_COLORS = [0xff0000,0x00ff00,0x0088ff,0xffff00,0xff00ff,0xff8800];
      REAR_GEAR_LEFT.forEach((name, i) => paintByName(name, DEBUG_COLORS[i]));
      // Tren trasero DERECHO — despintado
    }

    // Weapon bay doors — BODY017-020, parented to Armature026 bones
    // Sin keyframes en el GLB → rotación manual proporcional a bayTime
    bayDoorsReady.current = false;
    bayDoors.current = BAY_DOOR_MESHES.flatMap(name => {
      const obj = clonedScene.getObjectByName(name);
      if (!obj || !obj.parent) { console.warn(`[F35C] bay door not found: ${name}`); return []; }
      const bone = obj.parent;
      const sign   = BAY_DOOR_SIGNS[name]  ?? 1;
      const offset = BAY_DOOR_OFFSET[name] ?? 0;
      return [{ bone, baseQ: null, sign, offset }];
    });

    // Canopy pivot
    const glass = clonedScene.getObjectByName("Cockpit-Glass");
    const pivot = glass?.parent?.parent ?? null;
    if (pivot) {
      canopyPivot.current = { pivot, baseQ: pivot.quaternion.clone() };
    } else {
      console.warn("[F35C] canopy pivot not found");
    }

    // Arresting hook — buscar Bone.003 del gancho identificándolo por su hijo "Plane".
    // Jerarquía GLB: Armature.001 → Bone.001 → F-35C-BODY.023 (fairing izq)
    //                              → Bone.002 → F-35C-BODY.022 (fairing der)
    //                              → Bone.003 → Plane → F-35C-BODY.021 (brazo)
    hookReady.current = false;
    hookBones.current = null;
    {
      // Three.js GLTFLoader sanitiza nombres: "Bone.003"→"Bone003", "F-35C-BODY.022"→"F-35C-BODY022"
      // y añade sufijos _1, _2... para duplicados según orden DFS.
      // "Plane" es único en el modelo y no tiene punto, así que su nombre es estable.
      // Estrategia: buscar el nodo cuyo hijo directo se llama "Plane" (solo uno en todo el GLB).
      let b3 = null, b2 = null, b1 = null;
      clonedScene.traverse(o => {
        if (b3) return;
        if (o.children.some(c => c.name === "Plane")) {
          b3 = o;   // este es el Bone.003 del gancho (cualquiera sea su nombre sanitizado)
          const arm = o.parent;
          if (arm) {
            // b2 = hermano que contiene F-35C-BODY022 (fairing der)
            // b1 = hermano que contiene F-35C-BODY023 (fairing izq)
            arm.children.forEach(c => {
              if (c !== b3 && c.children.some(gc => gc.name === "F-35C-BODY022")) b2 = c;
              if (c !== b3 && c.children.some(gc => gc.name === "F-35C-BODY023")) b1 = c;
            });
          }
        }
      });

      if (b3) {
        hookBones.current = { b3, b1, b2, bq3: null, bq1: null, bq2: null };
      } else {
        console.warn("[F35C] hook: gancho no encontrado (nodo con hijo 'Plane' ausente).");
      }
    }

    // Nozzle petals — los pétalos son meshes rígidos hijos de sus bones (no SkinnedMesh).
    // Encontramos cada petal mesh por nombre → mesh.parent IS el bone → lo rotamos.
    nozzleBones.current = [];
    nozzleReady.current = false;
    let outerFound = 0, innerFound = 0;
    for (const meshName of OUTER_PETAL_MESHES) {
      const mesh = clonedScene.getObjectByName(meshName);
      if (mesh?.parent) { nozzleBones.current.push({ bone: mesh.parent, maxAngle: NOZZLE_OUTER_ANGLE, baseQ: null }); outerFound++; }
    }
    for (const meshName of INNER_PETAL_MESHES) {
      const mesh = clonedScene.getObjectByName(meshName);
      if (mesh?.parent) { nozzleBones.current.push({ bone: mesh.parent, maxAngle: NOZZLE_INNER_ANGLE, baseQ: null }); innerFound++; }
    }

    // Posición de la tobera — Sphere.005 empieza en Blender Y≈10 → Three.js Z≈-10
    nozzlePosRef.current = new Vector3(1.49, 2.90, -10.0);

    // Eyección — piloto rigged reemplaza al mesh estático
    seatObjRef.current   = clonedScene.getObjectByName("Seat")   ?? null;
    helmetObjRef.current = clonedScene.getObjectByName("Helmet") ?? null;
    if (!seatObjRef.current) console.warn('[F35C] Seat object not found in scene — rocket flame will fire at origin');

    // Ocultar Pilot y Helmet estáticos — reemplazados por el rigged V2
    const staticPilot = clonedScene.getObjectByName("Pilot");
    if (staticPilot) staticPilot.visible = false;
    const staticHelmet = clonedScene.getObjectByName("Helmet");
    if (staticHelmet) staticHelmet.visible = false;

    // Agregar piloto rigged al grupo en (0,0,0) — coordenadas Blender world baked
    const off = pilotOffset ? { ...DEFAULT_PILOT_OFFSET, ...pilotOffset } : DEFAULT_PILOT_OFFSET;
    clonedPilotScene.position.set(off.x, off.y, off.z);
    clonedPilotScene.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * off.tilt / 180);
    clonedPilotScene.scale.setScalar(off.scale);
    if (groupRef.current) groupRef.current.add(clonedPilotScene);
    riggedPilotRef.current = clonedPilotScene;
    pilotObjRef.current    = clonedPilotScene;

    // Capturar SkinnedMesh y su offset visual respecto al scene root
    let sm = null;
    clonedPilotScene.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; });
    pilotSkinnedMeshRef.current = sm;

    // Leer quaterniones sentado→recto del clip de animación
    // Samplear en el GLB ORIGINAL (los tracks referencian sus UUIDs, no los del clon)
    let smOrig = null;
    pilotGLB.traverse(o => { if (o.isSkinnedMesh && !smOrig) smOrig = o; });

    if (pilotAnims && pilotAnims.length > 0 && sm && smOrig) {
      const mixer = new AnimationMixer(pilotGLB);
      const clip  = pilotAnims.find(a => a.name === 'eject_legs') ?? pilotAnims[0];
      const action = mixer.clipAction(clip);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();

      const LEG_BONES = ['L_Thigh', 'L_Shin', 'R_Thigh', 'R_Shin'];

      // Frame 0 → pose sentado (del original, copiar al clon)
      mixer.setTime(0);
      const bones = {};
      LEG_BONES.forEach(n => {
        const bOrig  = smOrig.skeleton.bones.find(b => b.name === n);
        const bClone = sm.skeleton.bones.find(b => b.name === n);
        if (bOrig && bClone) bones[n] = { bone: bClone, seatedQ: bOrig.quaternion.clone() };
      });

      // Frame final → pose recto
      mixer.setTime(clip.duration);
      Object.keys(bones).forEach(n => {
        const bOrig = smOrig.skeleton.bones.find(b => b.name === n);
        if (bOrig) bones[n].straightQ = bOrig.quaternion.clone();
      });
      mixer.setTime(0);

      // Spread legs 12° outward in seated pose
      const spreadAngle = Math.PI * 24 / 180;
      const spreadL = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -spreadAngle);
      const spreadR = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0),  spreadAngle);
      if (bones['L_Thigh']) { bones['L_Thigh'].seatedQ.premultiply(spreadL); bones['L_Thigh'].bone.quaternion.copy(bones['L_Thigh'].seatedQ); }
      if (bones['R_Thigh']) { bones['R_Thigh'].seatedQ.premultiply(spreadR); bones['R_Thigh'].bone.quaternion.copy(bones['R_Thigh'].seatedQ); }

      // Hips tilt
      const hipsOrig  = smOrig.skeleton.bones.find(b => b.name === 'Hips');
      const hipsClone = sm.skeleton.bones.find(b => b.name === 'Hips');
      if (hipsOrig && hipsClone) hipsClone.quaternion.copy(hipsOrig.quaternion);


      // Store arm/torso/knee bone refs for reactive pose updates
      pilotPoseBonesRef.current = {
        lForearm:     sm.skeleton.bones.find(b => b.name === 'L_Forearm'),
        rForearm:     sm.skeleton.bones.find(b => b.name === 'R_Forearm'),
        lForearmOrig: smOrig.skeleton.bones.find(b => b.name === 'L_Forearm'),
        rForearmOrig: smOrig.skeleton.bones.find(b => b.name === 'R_Forearm'),
        lUpperArm:     sm.skeleton.bones.find(b => b.name === 'L_UpperArm'),
        rUpperArm:     sm.skeleton.bones.find(b => b.name === 'R_UpperArm'),
        lUpperArmOrig: smOrig.skeleton.bones.find(b => b.name === 'L_UpperArm'),
        rUpperArmOrig: smOrig.skeleton.bones.find(b => b.name === 'R_UpperArm'),
        spineClone: sm.skeleton.bones.find(b => b.name === 'Spine'),
        spineOrig:  smOrig.skeleton.bones.find(b => b.name === 'Spine'),
        lShin: bones['L_Shin'],
        rShin: bones['R_Shin'],
      };
      _applyPilotPose(pilotPoseBonesRef.current, pilotPose);

      pilotMixerRef.current = bones;

      // Morph target brazos arriba (grab_chute)
      if (sm.morphTargetDictionary?.['grab_chute'] !== undefined) {
        const idx = sm.morphTargetDictionary['grab_chute'];
        sm.morphTargetInfluences[idx] = 0;
        pilotMorphGrabRef.current = { mesh: sm, index: idx };
      }
    } else {
      console.warn('[F35C] no animations or no SkinnedMesh');
    }

    // Paracaídas — grupo con cúpula + cuerdas, oculto hasta eyección
    const resolvedChuteP = { ...DEFAULT_CHUTE_PARAMS, ...chuteParams };
    const chuteGroup = _buildChuteGroup(resolvedChuteP);
    chuteGroup.visible = false;
    rootScene.add(chuteGroup);
    chuteRef.current = chuteGroup;

    // Teclado E → eyectar
    const onKey = (e) => { if (e.code === 'KeyE') triggerEjectRef.current?.(); };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      if (chuteRef.current)     { rootScene.remove(chuteRef.current);     chuteRef.current = null; }
      if (canopyFlyObj.current) { rootScene.remove(canopyFlyObj.current); canopyFlyObj.current = null; }
      if (riggedPilotRef.current?.parent) riggedPilotRef.current.parent.remove(riggedPilotRef.current);
    };
  }, [clonedScene, clonedPilotScene, debugGearColors, rootScene, chuteParams]);

  useEffect(() => {
    const hidden = hiddenWeapons ?? new Set();
    Object.entries(weaponMeshRefs.current).forEach(([id, mesh]) => {
      mesh.visible = !hidden.has(id);
    });
  }, [hiddenWeapons]);

  useEffect(() => {
    _applyPilotPose(pilotPoseBonesRef.current, pilotPose);
  }, [pilotPose]);

  useEffect(() => {
    if (!clonedPilotScene) return;
    const off = pilotOffset ? { ...DEFAULT_PILOT_OFFSET, ...pilotOffset } : DEFAULT_PILOT_OFFSET;
    clonedPilotScene.position.set(off.x, off.y, off.z);
    clonedPilotScene.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * off.tilt / 180);
    clonedPilotScene.scale.setScalar(off.scale);
  }, [pilotOffset, clonedPilotScene]);

  useEffect(() => {
    if (!mixer || animations.length === 0) return;
    Object.values(actions).forEach((a) => { a.play(); a.paused = true; a.time = 0; });
  }, [actions, mixer, animations]);

  // Pre-compilar todos los shaders (blast, rocket, exhaust) para que no haya stall
  // en el primer frame del eject.
  useEffect(() => {
    gl.compile(rootScene, camera);
  }, [gl, rootScene, camera]);

  useEffect(() => {
    const actionList = Object.values(actions);
    if (!actionList.length) return;
    const maxDur = actionList.reduce((m, a) => Math.max(m, a.getClip().duration), 0);
    targetTime.current = gearDown ? 0 : maxDur;
  }, [gearDown, actions]);

  useEffect(() => {
    canopyTarget.current = canopyOpen ? 1 : 0;
  }, [canopyOpen]);

  useEffect(() => {
    hookTarget.current = hookDown ? 1 : 0;
  }, [hookDown]);

  useEffect(() => {
    const anyAction = Object.values(actions)[0];
    if (!anyAction) return;
    // baseQ = compuertas abiertas (estado por defecto del GLB)
    // weaponBayOpen=false → cerrar → avanzar al final del timeline
    // weaponBayOpen=true  → abrir  → volver al inicio (baseQ)
    bayTarget.current = weaponBayOpen ? 0 : anyAction.getClip().duration;
  }, [weaponBayOpen, actions]);

  useEffect(() => {
    throttleTarget.current = Math.max(0, Math.min(1, throttle));
  }, [throttle]);

  useEffect(() => { debugAnimRef.current = debugAnim; }, [debugAnim]);

  useEffect(() => { if (eject) triggerEjectRef.current?.(); }, [eject]);

  const resetEjectRef = useRef(null);
  resetEjectRef.current = function resetEject() {
    const es = ejectionState.current;

    // Restaurar objetos desde el snapshot
    if (es.saved) {
      // Canopy — volver a su parent original con transform original
      const { canopy, seat, helmet } = es.saved;
      if (canopy?.parent) {
        canopy.obj.removeFromParent();
        canopy.parent.add(canopy.obj);
        canopy.obj.position.copy(canopy.lp);
        canopy.obj.quaternion.copy(canopy.lq);
        canopy.obj.scale.copy(canopy.ls);
        canopyPivot.current    = { pivot: canopy.obj, baseQ: canopy.lq.clone() };
        canopyFlyObj.current   = null;
        canopyFlyActive.current = false;
      }
      // Helmet — quitar del piloto y volver a su parent original
      if (helmet?.parent) {
        helmet.obj.removeFromParent();
        helmet.parent.add(helmet.obj);
        helmet.obj.position.copy(helmet.lp);
        helmet.obj.quaternion.copy(helmet.lq);
        helmet.obj.scale.copy(helmet.ls);
      }
      // Seat — volver a su parent original
      if (seat?.parent) {
        seat.obj.removeFromParent();
        seat.parent.add(seat.obj);
        seat.obj.position.copy(seat.lp);
        seat.obj.quaternion.copy(seat.lq);
        seat.obj.scale.copy(seat.ls);
      }
      es.saved = null;
    }

    // Piloto rigged — volver al grupo del avión
    const pilotObj = pilotObjRef.current;
    if (pilotObj && groupRef.current) {
      pilotObj.removeFromParent();
      groupRef.current.add(pilotObj);
      pilotObj.position.set(DEFAULT_PILOT_OFFSET.x, DEFAULT_PILOT_OFFSET.y, DEFAULT_PILOT_OFFSET.z);
      pilotObj.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * DEFAULT_PILOT_OFFSET.tilt / 180);
      pilotObj.scale.setScalar(DEFAULT_PILOT_OFFSET.scale);
    }

    // Paracaídas
    if (chuteRef.current) {
      chuteRef.current.visible = false;
      chuteRef.current.scale.set(1, 1, 1);
      for (let pi = 0; pi < _CHUTE_N_PANELS; pi++) {
        const pm = chuteRef.current.children[pi];
        if (pm?.isMesh) pm.scale.setScalar(1);
      }
    }

    // Morph brazos
    if (pilotMorphGrabRef.current) {
      pilotMorphGrabRef.current.mesh.morphTargetInfluences[pilotMorphGrabRef.current.index] = 0;
    }

    // Efectos
    smokeStateRef.current.active   = false;
    smokeStateRef.current.t        = 0;
    seatRocketIntensityRef.current = 0;

    // Resetear estado de eyección
    es.active = false; es.t = 0; es.seatSep = false; es.chuteT = 0; es.chuteJolted = false;
    es.joltLegAmp = 0;
    es.pilotVel.set(0, 0, 0); es.seatVel.set(0, 0, 0);

    // Re-aplicar pose
    _applyPilotPose(pilotPoseBonesRef.current, pilotPoseRef.current);
  };

  // Exponer triggers síncronos — wrapper estable que siempre llama a la versión actual
  useEffect(() => {
    if (ejectTriggerRef)      ejectTriggerRef.current      = () => triggerEjectRef.current?.();
    if (resetEjectTriggerRef) resetEjectTriggerRef.current = () => resetEjectRef.current?.();
  }, [ejectTriggerRef, resetEjectTriggerRef]);

  useEffect(() => {
    if (!mixer) return;
    Object.entries(actions).forEach(([name, a]) => {
      a.play(); a.paused = true;
      a.time = debugAnim && name === debugAnim
        ? a.getClip().duration * debugProgress
        : 0;
    });
    mixer.update(0);
  }, [debugAnim, debugProgress, actions, mixer]);

  useFrame((_, delta) => {
    const actionList = Object.values(actions);
    if (!mixer || !actionList.length) return;

    const maxDur = actionList.reduce((m, a) => Math.max(m, a.getClip().duration), 0);
    if (maxDur === 0) return;

    // Gear
    const gearDiff = targetTime.current - animTime.current;
    if (Math.abs(gearDiff) >= 0.001) {
      const step = (maxDur / GEAR_TRAVEL_SECONDS) * delta;
      animTime.current += Math.sign(gearDiff) * Math.min(Math.abs(gearDiff), step);
    }

    // Canopy
    const canopyDiff = canopyTarget.current - canopyT.current;
    if (Math.abs(canopyDiff) >= 0.001) {
      const step = (1 / CANOPY_TRAVEL_SECONDS) * delta;
      canopyT.current += Math.sign(canopyDiff) * Math.min(Math.abs(canopyDiff), step);
    }

    // Weapon bay
    const bayDiff = bayTarget.current - bayTime.current;
    if (Math.abs(bayDiff) >= 0.001) {
      const step = (maxDur / BAY_TRAVEL_SECONDS) * delta;
      bayTime.current += Math.sign(bayDiff) * Math.min(Math.abs(bayDiff), step);
    }

    // Throttle / tobera — leer de controlsRef si está disponible (main stage)
    if (controlsRef?.current != null) {
      throttleTarget.current = Math.max(0, Math.min(1, controlsRef.current.throttle));
    }
    const thDiff = throttleTarget.current - throttleT.current;
    if (Math.abs(thDiff) >= 0.001) {
      const step = (1 / THROTTLE_TRAVEL_SECONDS) * delta;
      throttleT.current += Math.sign(thDiff) * Math.min(Math.abs(thDiff), step);
    }

    if (debugAnimRef.current) return;

    actionList.forEach((a) => {
      const name = a.getClip().name;
      const dur  = a.getClip().duration;
      let t;
      if      (NOZZLE_ANIMS.has(name))          t = throttleT.current * dur;
      else if (WEAPON_BAY_ANIMS.has(name))     t = bayTime.current;
      else if (name === HOOK_ANIM)             t = 0; // controlado manualmente post-mixer
      else                                     t = animTime.current;
      a.time = Math.max(0, Math.min(dur, t));
    });
    mixer.update(0);

    // Ladder hatch — forzar cerrada (identidad) después de cada mixer.update
    if (ladderHatchBone.current) ladderHatchBone.current.quaternion.set(0, 0, 0, 1);

    // BODY044: ocultar entre t≈0.72 (f21/29) y t≈0.97 (cerca de stowed).
    // La interpolación geodésica en ese rango cruza el ala izquierda.
    // A t=0 (gear down) y t=1 (stowed dentro del fuselaje) es visible/irrelevante.
    const t = Math.max(0, Math.min(1, animTime.current / maxDur));
    if (gearClipMeshes.current.length > 0) {
      const hide = t > 0.68;
      gearClipMeshes.current.forEach(obj => { obj.visible = !hide; });
    }

    if (wheelBones.current.length > 0) {
      // Capturar baseQ y baseArmPos en el primer frame, post mixer.update
      if (!wheelBaseReady.current) {
        wheelBones.current.forEach(entry => {
          entry.baseQ      = entry.bone.quaternion.clone();
          entry.baseArmPos = entry.arm.position.clone();
        });
        wheelBaseReady.current = true;
      }
      const wheelStowT = rearWheelStowOverride === null
        ? t
        : Math.max(0, Math.min(1, rearWheelStowOverride));
      const stowQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), WHEEL_STOW_ANGLE * wheelStowT);
      wheelBones.current.forEach((entry) => {
        const { bone, baseQ, arm, baseArmPos } = entry;
        if (!baseQ || !baseArmPos) return;
        bone.quaternion.copy(baseQ).premultiply(stowQ);
        // Posición absoluta respecto a la base (no delta) para evitar drift con la animación
        arm.position.x = baseArmPos.x + WHEEL_STOW_INWARD * wheelStowT * entry.inwardSign;
        arm.position.y = baseArmPos.y + rearWheelLiftAmount * wheelStowT;
      });
    }

    // Giro de ruedas delanteras — proporcional a taxiSpeedRef
    const taxiSpeed = taxiSpeedRef?.current ?? 0;
    if (taxiSpeed > 0.01 && wheelSpinRef.current.length) {
      const wheelRadius = 0.17; // radio aprox. del neumático (m)
      const angularVel  = taxiSpeed / wheelRadius;
      const rearWobble = rearWheelWobbleRef?.current ?? 1;
      for (const { pivot, axis, baseAxis = null, isRearWheel = false, spinSign = -1 } of wheelSpinRef.current) {
        let spinAxis = axis;
        if (isRearWheel && baseAxis && rearWobble < 0.999) {
          spinAxis = wheelAxisTmp.current.copy(baseAxis);
          spinAxis.y *= rearWobble;
          spinAxis.z *= rearWobble;
          if (spinAxis.lengthSq() > 1e-6) spinAxis.normalize();
          else spinAxis.set(baseAxis.x < 0 ? -1 : 1, 0, 0);
        }
        pivot.rotateOnAxis(spinAxis, spinSign * angularVel * delta);
      }
    }

    // Cabina
    if (canopyPivot.current) {
      const { pivot, baseQ } = canopyPivot.current;
      const openQ = new Quaternion().setFromAxisAngle(new Vector3(0, -1, 0), CANOPY_OPEN_ANGLE * canopyT.current);
      pivot.quaternion.copy(baseQ).multiply(openQ);
    }

    // Capturar baseQ de estabilizadores en el primer frame (post mixer.update)
    if (!stabBaseReady.current) {
      if (stabLeft.current)  stabLeft.current.baseQ  = stabLeft.current.obj.quaternion.clone();
      if (stabRight.current) stabRight.current.baseQ = stabRight.current.obj.quaternion.clone();
      stabBaseReady.current = true;
    }

    // ── Superficies de control — FBW auto-drive ─────────────────────────────
    // Si hay controlsRef (main stage), leer estado de vuelo directamente cada frame.
    // Si no (test scene / storybook), usar las props estáticas.
    const _fc   = controlsRef?.current;
    const effPitch    = _fc ? _fc.pitch  : pitch;
    const effRoll     = _fc ? _fc.roll   : roll;
    const effRudder   = _fc ? _fc.rudder : rudder;
    // Aileron: FBW usa roll input; prop manual cuando no hay controlsRef
    const effAileron  = _fc ? effRoll : aileron;
    // Flap simétrico automático: desplegado a baja vel. en vuelo, recogido en alta vel.
    const effSpd      = _fc?.speed ?? 0;
    const autoFlapAmt = _fc ? Math.min(1, Math.max(0, (90 - effSpd) / 35)) * (_fc.airborne ? 1 : 0) : flap;
    const effFlap     = Math.max(autoFlapAmt, flap);
    // Leading edge droop: también automático en baja velocidad
    const effLead     = _fc ? Math.min(1, Math.max(0, (90 - effSpd) / 35)) : leadingFlap;

    // Estabilizadores — right baja con +, left sube con +
    // pitch > 0 = morro sube: right +, left −
    // roll  > 0 = rolla derecha: right −, left −
    const cp = Math.max(-1, Math.min(1, effPitch));
    const cr = Math.max(-1, Math.min(1, effRoll));
    if (stabRight.current?.baseQ) {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), STAB_ANGLE * (cp - cr));
      stabRight.current.obj.quaternion.copy(stabRight.current.baseQ).multiply(q);
    }
    if (stabLeft.current?.baseQ) {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), STAB_ANGLE * (-cp - cr));
      stabLeft.current.obj.quaternion.copy(stabLeft.current.baseQ).multiply(q);
    }

    // Capturar baseQ de flaperons en el primer frame
    if (!flapBaseReady.current) {
      if (flapLeft.current)  flapLeft.current.baseQ  = flapLeft.current.obj.quaternion.clone();
      if (flapRight.current) flapRight.current.baseQ = flapRight.current.obj.quaternion.clone();
      flapBaseReady.current = true;
    }

    // Flaperons — flap>0 ambos bajan, aileron>0 rolla derecha (right sube, left baja)
    const cf = Math.max(0, Math.min(1, effFlap));
    const ca = Math.max(-1, Math.min(1, effAileron));
    if (flapRight.current?.baseQ) {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), FLAPERON_ANGLE * cf - AILERON_ANGLE * ca);
      flapRight.current.obj.quaternion.copy(flapRight.current.baseQ).multiply(q);
    }
    if (flapLeft.current?.baseQ) {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -FLAPERON_ANGLE * cf - AILERON_ANGLE * ca);
      flapLeft.current.obj.quaternion.copy(flapLeft.current.baseQ).multiply(q);
    }

    // Capturar baseQ de leading edge flaps
    if (!leadBaseReady.current) {
      if (leadLeft.current)  leadLeft.current.baseQ  = leadLeft.current.obj.quaternion.clone();
      if (leadRight.current) leadRight.current.baseQ = leadRight.current.obj.quaternion.clone();
      leadBaseReady.current = true;
    }

    // Leading edge flaps — simétricos, borde de ataque droop
    const clf = Math.max(0, Math.min(1, effLead));
    if (leadRight.current?.baseQ) {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -LEADING_FLAP_ANGLE * clf);
      leadRight.current.obj.quaternion.copy(leadRight.current.baseQ).multiply(q);
    }
    if (leadLeft.current?.baseQ) {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), LEADING_FLAP_ANGLE * clf);
      leadLeft.current.obj.quaternion.copy(leadLeft.current.baseQ).multiply(q);
    }

    // Capturar baseQ de rudders
    if (!rudderReady.current) {
      if (rudderLeft.current)  rudderLeft.current.baseQ  = rudderLeft.current.obj.quaternion.clone();
      if (rudderRight.current) rudderRight.current.baseQ = rudderRight.current.obj.quaternion.clone();
      rudderReady.current = true;
    }

    // Rudders — ambos deflectan en la misma dirección Y local para crear guiñada
    const crd = Math.max(-1, Math.min(1, effRudder));
    if (rudderLeft.current?.baseQ) {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), RUDDER_ANGLE * crd);
      rudderLeft.current.obj.quaternion.copy(rudderLeft.current.baseQ).multiply(q);
    }
    if (rudderRight.current?.baseQ) {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), RUDDER_ANGLE * crd);
      rudderRight.current.obj.quaternion.copy(rudderRight.current.baseQ).multiply(q);
    }

    // Weapon bay doors — rotación manual, eje Z (longitudinal), proporcional a bayTime
    if (!bayDoorsReady.current && bayDoors.current.length > 0) {
      bayDoors.current.forEach(d => { d.baseQ = d.bone.quaternion.clone(); });
      bayDoorsReady.current = true;
    }
    // bayProgress 0=abierto 1=cerrado
    // ángulo: −EXTRA_OPEN (abierto) → +CLOSE_ANGLE (cerrado), recorrido total = 120°
    const bayProgress = Math.max(0, Math.min(1, bayTime.current / maxDur));
    bayDoors.current.forEach(({ bone, baseQ, sign, offset }) => {
      if (!baseQ) return;
      const angle = BAY_DOOR_ANGLE * bayProgress + offset;
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle * sign);
      bone.quaternion.copy(baseQ).multiply(q);
    });

    // Capturar baseQ de wing fold
    if (!wingFoldReady.current && wingFoldBones.current.length > 0) {
      wingFoldBones.current.forEach(entry => { entry.baseQ = entry.obj.quaternion.clone(); });
      wingFoldReady.current = true;
    }

    // Wing fold — premultiply para rotar en frame del armature (todos giran mismo eje)
    // left (Y>0) sube con +Z, right (Y<0) sube con -Z
    const cwf = Math.max(0, Math.min(1, wingFold));
    wingFoldBones.current.forEach(({ obj, baseQ, sign }) => {
      if (!baseQ) return;
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), WING_FOLD_ANGLE * cwf * sign);
      obj.quaternion.copy(baseQ).premultiply(q);
    });

    // Arresting hook — interpolar hookT hacia hookTarget
    const hookDiff = hookTarget.current - hookT.current;
    if (Math.abs(hookDiff) >= 0.001) {
      const step = (1 / HOOK_TRAVEL_SECONDS) * delta;
      hookT.current += Math.sign(hookDiff) * Math.min(Math.abs(hookDiff), step);
    }
    if (hookBones.current) {
      const { b3, b1, b2 } = hookBones.current;
      // Capturar baseQ en el primer frame post-mixer (t=0 = pose de reposo del clip)
      if (!hookReady.current) {
        hookBones.current.bq3 = b3.quaternion.clone();
        if (b1) hookBones.current.bq1 = b1.quaternion.clone();
        if (b2) hookBones.current.bq2 = b2.quaternion.clone();
        hookReady.current = true;
      }
      const ht = hookT.current;
      // Brazo (Bone.003): rotación X local — constraint fromX 0→90° toX 0→1.0926 rad
      if (hookBones.current.bq3) {
        const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), HOOK_ARM_ANGLE * ht);
        b3.quaternion.copy(hookBones.current.bq3).multiply(q);
      }
      // Fairings (Bone.001/002): Y local, se abren rápido (HOOK_FAIR_SPEED×) y se quedan abiertos
      const ft = Math.min(1, ht * HOOK_FAIR_SPEED);
      if (b1 && hookBones.current.bq1) {
        const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -HOOK_FAIR_ANGLE * ft);
        b1.quaternion.copy(hookBones.current.bq1).multiply(q);
      }
      if (b2 && hookBones.current.bq2) {
        const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), HOOK_FAIR_ANGLE * ft);
        b2.quaternion.copy(hookBones.current.bq2).multiply(q);
      }
    }

    // Nozzle petals — capturar baseQ en el primer frame y rotar eje X según throttle
    if (!nozzleReady.current && nozzleBones.current.length > 0) {
      nozzleBones.current.forEach(e => { e.baseQ = e.bone.quaternion.clone(); });
      nozzleReady.current = true;
    }
    if (nozzleReady.current) {
      const th = throttleT.current;
      nozzleBones.current.forEach(({ bone, maxAngle, baseQ }) => {
        if (!baseQ) return;
        // Curva U real del F135:
        //   idle (th=0)      → 40% abierto (necesita área grande para baja presión)
        //   military (th≈0.65) → cerrado al máximo (garganta convergente mínima)
        //   AB (th=1)        → 100% abierto (acomoda el volumen del postcombustor)
        const MILITARY_TH = 0.85;
        const nozzleOpen = th < MILITARY_TH
          ? 0.90 - (th / MILITARY_TH) * 0.15        // 90% → 75% (idle → military)
          : 0.75 + ((th - MILITARY_TH) / (1 - MILITARY_TH)) * 0.25; // 75% → 100% (military → AB)
        const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), maxAngle * (nozzleOpen - 1));
        bone.quaternion.copy(baseQ).multiply(q);
      });
    }

    // ── Cabina volando ────────────────────────────────────────────────────────
    if (canopyFlyActive.current && canopyFlyObj.current) {
      const cg = -9.8;
      canopyFlyVel.current.y += cg * delta;
      canopyFlyPos.current.addScaledVector(canopyFlyVel.current, delta);
      canopyFlyObj.current.position.copy(canopyFlyPos.current);
      canopyFlyObj.current.rotation.x += canopyFlyOmega.current.x * delta;
      canopyFlyObj.current.rotation.y += canopyFlyOmega.current.y * delta;
      canopyFlyObj.current.rotation.z += canopyFlyOmega.current.z * delta;
    }

    // ── Eyección ─────────────────────────────────────────────────────────────
    const es = ejectionState.current;
    if (es.active) {
      es.t += delta;
      const t = es.t;
      const gravity = -5.5;

      // ── Fases de propulsión (física del ACES II / Martin-Baker Mk.16) ─────────
      // t < 0.05s  IGNICIÓN   : carga pirotécnica armándose, asiento fijo, llama crece
      // 0.05–0.25s CATAPULTA  : impulso explosivo (~45g), lanza por los rieles
      // 0.25–0.62s SUSTENTADOR: cohete continuo, libre del cockpit
      // t > 0.62s  BALÍSTICO  : sin empuje, solo gravedad (pico ~20 units sobre cockpit)
      // t > 1.45s  SEPARACIÓN : arnés se libera, paracaídas inicia

      const T_IGN  = 0.05;  // fin de ignición
      const T_CAT  = 0.25;  // fin de catapulta
      const T_ROCK = 0.62;  // fin del cohete sustentador
      const T_SEP  = 0.90;  // separación asiento / piloto (MB Mk.16: ~0.8–1.2s)

      // Intensidad visual de la llama
      let rocketIntensity;
      if (t < T_IGN) {
        rocketIntensity = t / T_IGN;                             // 0→1: ignición crece
      } else if (t < T_ROCK) {
        rocketIntensity = 1.0;                                   // llama plena
      } else {
        rocketIntensity = Math.max(0, 1 - (t - T_ROCK) / 0.18); // apagado rápido
      }
      seatRocketIntensityRef.current = rocketIntensity;

      // Posición de la llama sigue al asiento
      if (groupRef.current) {
        const worldSeatPos = es.seatPos.clone();
        groupRef.current.worldToLocal(worldSeatPos);
        seatRocketPosRef.current.copy(worldSeatPos);
      }

      // Aceleración de propulsión (solo se aplica a partir del fin de ignición)
      let rocketAccel = 0;
      if (t >= T_IGN && t < T_CAT) {
        rocketAccel = 55.0;  // catapulta: impulso explosivo muy alto y breve
      } else if (t >= T_CAT && t < T_ROCK) {
        rocketAccel = 16.0;  // sustentador: empuje moderado continuo
      }

      // Separación asiento / piloto
      if (!es.seatSep && t >= T_SEP) es.seatSep = true;

      // Paracaídas
      // Apertura: 1.1s total → totalmente abierto en t≈2.0s, antes del pico (~3s)
      if (t > T_SEP) es.chuteT = Math.min(1.0, (t - T_SEP) / 1.1);

      // Sacudón: cuando el canopy caza aire (~50% inflado) los tirantes se tensan
      // y jalean al piloto bruscamente hacia arriba — en la vida real puede causar
      // fracturas vertebrales en eyecciones fuera de rango.
      if (!es.chuteJolted && es.chuteT > 0.48) {
        es.chuteJolted  = true;
        es.pilotVel.y  += 8.0;                             // tirón vertical fuerte
        es.pilotVel.x  += (Math.random() - 0.5) * 3.0;   // desequilibrio lateral
        es.pilotVel.z  += (Math.random() - 0.5) * 3.0;
        es.joltLegAmp   = 1.0;                             // arrancar oscilación de piernas
      }

      // Activar humo cuando dispara la catapulta (sincronizado con el movimiento)
      if (t >= T_IGN && !smokeStateRef.current.active && smokeStateRef.current.t === 0) {
        smokeStateRef.current.active = true;
        smokeStateRef.current.pos.copy(es.seatPos);
      }

      // ── Integración solo una vez que la catapulta dispara ────────────────────
      if (t >= T_IGN) {
        // Piloto
        es.pilotVel.y += (gravity + rocketAccel) * delta;
        if (es.seatSep) {
          // Paracaídas frena gradualmente según apertura
          const drag = Math.min(es.chuteT * 0.09, 0.07);
          es.pilotVel.y  = Math.max(es.pilotVel.y * (1 - drag), -1.2);
          es.pilotVel.x *= 0.97;
          es.pilotVel.z *= 0.97;
        }

        // Asiento: misma propulsión que piloto hasta separación, luego cae libre
        es.seatVel.y += (es.seatSep ? gravity * 1.4 : gravity + rocketAccel) * delta;
        es.seatVel.x *= 0.99;
        es.seatVel.z *= 0.99;

        // Posiciones
        es.pilotPos.addScaledVector(es.pilotVel, delta);
        es.seatPos.addScaledVector(es.seatVel,  delta);
      }

      // Aplicar a meshes
      const pilotObj = pilotObjRef.current;
      const seatObj  = seatObjRef.current;
      if (pilotObj) {
        // es.pilotPos = posición visual (SkinnedMesh world).
        // El scene root (pilotObj) va desplazado por el offset local del mesh.
        pilotObj.position.copy(es.pilotPos).sub(pilotVisualOffsetRef.current);

        // Orientación: inclinación del cockpit → vertical al separarse del asiento
        if (es.seatSep) {
          const uprightT = Math.min(1, (t - T_SEP) / 1.5);
          const ease = uprightT * uprightT * (3 - 2 * uprightT);
          pilotObj.quaternion.copy(es.pilotBaseQ).slerp(_UPRIGHT_Q, ease);
        } else {
          pilotObj.quaternion.copy(es.pilotBaseQ);
        }

        // Piernas: SLERP sentado → recto + oscilación de sacudón
        if (es.seatSep && pilotMixerRef.current) {
          const bones  = pilotMixerRef.current;
          const phaseA = Math.min(1, Math.max(0, (t - T_SEP) / 1.2));
          // Decaer amplitud del sacudón (~3 oscilaciones antes de apagarse)
          if (es.joltLegAmp > 0.001) es.joltLegAmp *= Math.exp(-delta * 3.8);
          else es.joltLegAmp = 0;
          const isLegBone = { L_Thigh: true, R_Thigh: true, L_Shin: true, R_Shin: true };
          for (const n in bones) {
            const { bone, seatedQ, straightQ } = bones[n];
            // Las piernas oscilan; el resto (spine, brazos) sólo hace el SLERP normal
            const swing = isLegBone[n] && es.joltLegAmp > 0
              ? Math.sin(t * 9.0) * es.joltLegAmp * 0.75
              : 0;
            bone.quaternion.copy(seatedQ).slerp(straightQ, phaseA + swing);
          }
        }
        // Brazos arriba agarrando tirantes — empieza 0.5s después que las piernas
        if (pilotMorphGrabRef.current) {
          const phaseArm = Math.min(1, Math.max(0, (t - (T_SEP + 0.5)) / 1.2));
          pilotMorphGrabRef.current.mesh.morphTargetInfluences[pilotMorphGrabRef.current.index] = phaseArm;
        }

      }
      // helmetObj es hijo de pilotObj → sigue automáticamente
      if (seatObj) {
        seatObj.position.copy(es.seatPos);
        if (es.seatSep) {
          seatObj.rotation.x += es.seatOmega.x * delta;
          seatObj.rotation.z += es.seatOmega.z * delta;
        }
      }

      // Paracaídas — apertura física con inflado por panel
      const chute = chuteRef.current;
      if (chute && es.chuteT > 0) {
        chute.visible = true;
        const p  = es.chuteT;
        const et = es.t;
        const ease  = (x) => x * x * (3 - 2 * x);
        const ease3 = (x) => x * x * x * (x * (x * 6 - 15) + 10); // más abrupto

        // ── Escala global del grupo ──────────────────────────────────────────
        const yOpen  = ease(Math.min(1, p / 0.28));
        const xzOpen = ease(Math.max(0, Math.min(1, (p - 0.22) / 0.70)));
        const asymm  = Math.sin(p * Math.PI) * 0.08;
        const postP  = Math.max(0, p - 0.88);
        const osc    = Math.sin(postP * 13) * 0.04 * Math.max(0, 1 - postP * 3.5);

        // ── Inflado individual por panel ─────────────────────────────────────
        // Cada gore tiene un delay aleatorio (guardado en userData.panelDelays).
        // Escala de 0.05 (comprimido en pack) → 1.0 (totalmente inflado).
        // Los paneles opuestos al viento se inflran antes que los del lado de sotavento.
        const delays = chute.userData.panelDelays;
        if (delays) {
          for (let pi = 0; pi < _CHUTE_N_PANELS; pi++) {
            const pm = chute.children[pi];
            if (!pm?.isMesh) continue;
            const d   = delays[pi];
            const pp  = Math.max(0, Math.min(1, (p - d) / Math.max(0.01, 1 - d)));
            pm.scale.setScalar(0.05 + ease3(pp) * 0.95);
          }
        }

        // ── Cuerdas: plegadas → tensas ───────────────────────────────────────
        // Mientras p < 0.25 las cuerdas están todas colapsadas en la confluencia
        // (como un paquete). A partir de ahí el midpoint de cada cuerda sube hasta
        // su posición recta; el wobble disminuye hasta cero cuando p=1 (totalmente tensas).
        const linesMesh = chute.userData.linesMesh;
        if (linesMesh) {
          const pa    = linesMesh.geometry.attributes.position;
          const sp    = chute.userData.straightPts;
          const seeds = chute.userData.lineSeeds;
          const nL    = chute.userData.N_LINES;
          const hw    = (chute.userData.lineWidth ?? 0.008) / 2;

          const rawTens = Math.max(0, (p - 0.25) / 0.75);
          const tEased  = rawTens * rawTens * (3 - 2 * rawTens);
          const slack   = 1 - tEased;

          for (let li = 0; li < nL; li++) {
            // Top anclado al skirt del panel correspondiente (mismo scale que el nylon)
            const pi   = Math.floor(li / 2);
            const pm   = chute.children[pi];
            const pscl = (pm?.isMesh && !pm?.userData?.isRiser) ? (pm.scale.x) : 1;

            const seed = seeds[li];
            const si   = li * 9;
            const tx = sp[si],   ty = sp[si+1], tz = sp[si+2];  // top canónico (sin scale)
            const mx = sp[si+3], my = sp[si+4], mz = sp[si+5];  // mid canónico
            const bx = sp[si+6], by = sp[si+7], bz = sp[si+8];  // confluencia (fija)

            // Top sigue al skirt del panel → misma escala que el nylon
            const atx = tx * pscl, aty = ty * pscl, atz = tz * pscl;

            // Mid: empieza pegado al skirt (plegado) → se extiende al punto recto
            const wFreq = 2.2 + seed * 4.5;
            const wAmp  = slack * slack * 0.38;
            const wX    = Math.sin(et * wFreq       + seed * 17.3) * wAmp;
            const wZ    = Math.cos(et * wFreq * 0.7 + seed * 11.9) * wAmp;

            const fmx = atx + (mx - tx) * tEased + wX;
            const fmy = aty + (my - ty) * tEased;
            const fmz = atz + (mz - tz) * tEased + wZ;

            // Anchura perpendicular al segmento: cross(segDir, worldUp) = (dz, 0, -dx) / len
            // Segmento superior (top → mid)
            const dx1 = fmx-atx, dy1 = fmy-aty, dz1 = fmz-atz;
            const l1  = Math.sqrt(dx1*dx1+dy1*dy1+dz1*dz1) || 1;
            const t1x = dz1/l1, t1z = -dx1/l1;
            // Segmento inferior (mid → bot)
            const dx2 = bx-fmx, dy2 = by-fmy, dz2 = bz-fmz;
            const l2  = Math.sqrt(dx2*dx2+dy2*dy2+dz2*dz2) || 1;
            const t2x = dz2/l2, t2z = -dx2/l2;
            // Mid: promedio normalizado de ambos segmentos (bisectriz de anchura)
            const tmx = t1x+t2x, tmz = t1z+t2z;
            const tml = Math.sqrt(tmx*tmx+tmz*tmz) || 1;
            const tmxn = tmx/tml, tmzn = tmz/tml;

            const a   = pa.array;
            const vi6 = li * 18;  // 6 verts × 3 floats
            // top-L/R
            a[vi6]    = atx - t1x*hw;  a[vi6+1]  = aty;  a[vi6+2]  = atz - t1z*hw;
            a[vi6+3]  = atx + t1x*hw;  a[vi6+4]  = aty;  a[vi6+5]  = atz + t1z*hw;
            // mid-L/R
            a[vi6+6]  = fmx - tmxn*hw;  a[vi6+7]  = fmy;  a[vi6+8]  = fmz - tmzn*hw;
            a[vi6+9]  = fmx + tmxn*hw;  a[vi6+10] = fmy;  a[vi6+11] = fmz + tmzn*hw;
            // bot-L/R (confluencia fija)
            a[vi6+12] = bx  - t2x*hw;  a[vi6+13] = by;   a[vi6+14] = bz  - t2z*hw;
            a[vi6+15] = bx  + t2x*hw;  a[vi6+16] = by;   a[vi6+17] = bz  + t2z*hw;
          }
          pa.needsUpdate = true;
        }

        // ── Caos de grupo durante despliegue ─────────────────────────────────
        // Frecuencias inconmensurables → sin periodicidad visible.
        // Amortiguado exponencialmente, desaparece al terminar la apertura.
        const chaos = Math.max(0, 1.0 - p * 2.0) * (1 + Math.sin(et * 23) * 0.3);
        const wobX  = (Math.sin(et * 8.7) * 0.55 + Math.sin(et * 14.3 + 1.1) * 0.45) * chaos * 0.55;
        const wobZ  = (Math.cos(et * 7.2) * 0.55 + Math.cos(et * 19.1 + 2.4) * 0.45) * chaos * 0.50;
        const wobY  = (Math.sin(et * 5.1 + 0.8) * 0.5 + Math.sin(et * 11.9) * 0.5)   * chaos * 0.35;
        const sNoise = (Math.sin(et * 6.7) * 0.6 + Math.sin(et * 17.3) * 0.4)         * chaos * 0.20;

        chute.rotation.set(
          Math.sin(p * Math.PI) * 0.10 + wobX,
          wobY,
          Math.sin(p * Math.PI * 1.4) * 0.06 + wobZ,
        );
        chute.scale.set(
          (xzOpen + asymm + osc + sNoise)        * 3,
          yOpen * 2,
          (xzOpen - asymm * 0.5 + sNoise * 0.7) * 3,
        );

        // ── Anclaje: BODY_Y (arnés) queda fijo en los hombros del piloto ─────
        // Anchor: BODY_Y (arnés) queda fijo en el hombro del piloto aunque el chute rote
        const cd = chute.userData.chute;
        const sx = es.pilotPos.x + (cd?.offsetX ?? 0);
        const sy = es.pilotPos.y + (cd?.shoulderOffset ?? 0.40) + (cd?.offsetY ?? 0);
        const sz = es.pilotPos.z + (cd?.offsetZ ?? 0);
        // Punto BODY_Y en local escalado → rotar para corregir desplazamiento
        _pendV3.set(0, (cd?.bodyY ?? _CHUTE_BODY_Y) * (yOpen * 2), 0).applyEuler(chute.rotation);
        chute.position.set(sx - _pendV3.x, sy - _pendV3.y, sz - _pendV3.z);

        // Péndulo: piloto oscila acoplado al swing del chute
        const pilotObj2 = pilotObjRef.current;
        if (pilotObj2 && es.seatSep) {
          const couplingT = Math.min(1, (t - T_SEP) / 0.8);
          const coupEase  = couplingT * couplingT * (3 - 2 * couplingT);
          _pendQ.setFromEuler(_pendE.set(
            chute.rotation.x * 0.6 * coupEase,
            0,
            chute.rotation.z * 0.6 * coupEase,
          ));
          pilotObj2.quaternion.premultiply(_pendQ);
        }
      }
    }

  }, -1);

  return (
    <group ref={groupRef} scale={scale} position={position} rotation={rotation}>
      <primitive object={clonedScene} />
      <ExhaustPlume posRef={nozzlePosRef} throttleRef={throttleT} />
      <SeatRocketFlame posRef={seatRocketPosRef} intensityRef={seatRocketIntensityRef} />
      <SmokeCloud stateRef={smokeStateRef} />
    </group>
  );
}

useGLTF.preload("/F-35C.glb");
useGLTF.preload("/PilotOriginal.glb");
