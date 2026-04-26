"use client";

// Paracaídas reutilizable. Geometría: 20 paneles (gores) + cuerdas dinámicas
// + 2 risers convergentes. Inflación por panel con delays aleatorios.
//
// API:
//   <Parachute
//     anchorPosRef={Vector3 ref}   // posición de los hombros del piloto en world
//     chuteTRef={number ref}        // progreso 0..1 (0 = empacado, 1 = inflado)
//     visible={bool}                // mostrar/ocultar
//     params={...}                  // overrides de DEFAULT_CHUTE_PARAMS
//   />
// Se renderiza como hijo del root (no del piloto), pero posicionalmente sigue
// al piloto vía anchorPosRef cada frame.
//
// Originalmente parte de F35C.jsx, extraido a common para reuso.

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, Mesh, Group,
  DoubleSide, DynamicDrawUsage, Vector3, Euler, Quaternion,
  TextureLoader, RepeatWrapping, SRGBColorSpace,
} from "three";

const _CHUTE_N_PANELS = 20;
const _CHUTE_N_LAT    = 14;
const _CHUTE_N_LON    = 6;
const _CHUTE_VENT     = 0.06;
const _CHUTE_BULGE    = 0.10;
const _CHUTE_BODY_Y   = -2.80;
const _CHUTE_BASE     = { r: 0x14 / 255, g: 0x1e / 255, b: 0x08 / 255 };

const _chuteMat = new MeshStandardMaterial({
  color: 0xffffff, vertexColors: true, side: DoubleSide,
  roughness: 1.0, metalness: 0,
});

let _strapTex = null;
function _getStrapTex() {
  if (!_strapTex) {
    _strapTex = new TextureLoader().load("/strap.png");
    _strapTex.wrapS = RepeatWrapping;
    _strapTex.wrapT = RepeatWrapping;
    _strapTex.colorSpace = SRGBColorSpace;
    _strapTex.repeat.set(1, 10);
  }
  return _strapTex;
}

export const DEFAULT_CHUTE_PARAMS = {
  shoulderOffset: 0.40,
  offsetX:        0.05,
  offsetY:        0.43,
  offsetZ:        0.14,
  riserX:         0.06,
  riserSep:       0.045,
  riserWidth:     0.020,
  riserDepth:     0.006,
  lineWidth:      0.003,
  confY:         -2.61,
};

function buildChuteGroup(params = {}) {
  const merged = { ...DEFAULT_CHUTE_PARAMS, ...params };
  const { riserX, riserSep, riserWidth, riserDepth, confY,
          shoulderOffset, offsetX, offsetY, offsetZ, lineWidth } = merged;
  const CONF_Y   = confY;
  const BODY_Y   = _CHUTE_BODY_Y;
  const RISER_RX = riserX;
  const BODY_RX  = riserSep;
  const group = new Group();

  group.userData.chute = { confY: CONF_Y, bodyY: BODY_Y, shoulderOffset, offsetX, offsetY, offsetZ };

  // ── Paneles (gores) ────────────────────────────────────────────────────
  for (let p = 0; p < _CHUTE_N_PANELS; p++) {
    const phi0 = (p       / _CHUTE_N_PANELS) * Math.PI * 2;
    const phi1 = ((p + 1) / _CHUTE_N_PANELS) * Math.PI * 2;
    const nVerts = (_CHUTE_N_LAT + 1) * (_CHUTE_N_LON + 1);
    const pos = new Float32Array(nVerts * 3);
    const col = new Float32Array(nVerts * 3);
    const idx = [];
    const panelBright = 0.88 + Math.random() * 0.24;
    let vi = 0;
    for (let j = 0; j <= _CHUTE_N_LAT; j++) {
      const t = _CHUTE_VENT + (j / _CHUTE_N_LAT) * (1.0 - _CHUTE_VENT);
      const theta = t * Math.PI * 0.58;
      const y = Math.cos(theta);
      const r = Math.sin(theta);
      const heightBright = 1.10 - (j / _CHUTE_N_LAT) * 0.28;
      for (let i = 0; i <= _CHUTE_N_LON; i++) {
        const lerpT = i / _CHUTE_N_LON;
        const a = phi0 + lerpT * (phi1 - phi0);
        const bulge = 1.0 + _CHUTE_BULGE * Math.sin(lerpT * Math.PI);
        pos[vi*3+0] = Math.cos(a) * r * bulge;
        pos[vi*3+1] = y;
        pos[vi*3+2] = Math.sin(a) * r * bulge;
        const seamLight = 0.72 + Math.sin(lerpT * Math.PI) * 0.28;
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
        idx.push(a, b, c, a, c, d);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("color",    new Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    group.add(new Mesh(geo, _chuteMat));
  }

  // Delays aleatorios por panel (inflación asimétrica)
  group.userData.panelDelays = Array.from({ length: _CHUTE_N_PANELS }, () => Math.random() * 0.35);

  // ── Cuerdas de suspensión (skirt → confluencia) ────────────────────────
  const skirtTheta = Math.PI * 0.58;
  const sy = Math.cos(skirtTheta);
  const sr = Math.sin(skirtTheta);
  const N_LINES = _CHUTE_N_PANELS * 2;
  const straightPts = new Float32Array(N_LINES * 9);
  const lineSeeds   = new Float32Array(N_LINES);
  const linePhis    = new Float32Array(N_LINES);
  const lmVerts     = new Float32Array(N_LINES * 18);
  let li = 0;
  for (let p = 0; p < _CHUTE_N_PANELS; p++) {
    for (let half = 0; half < 2; half++) {
      const phi = half === 0
        ? (p / _CHUTE_N_PANELS) * Math.PI * 2
        : ((p + 0.5) / _CHUTE_N_PANELS) * Math.PI * 2;
      const rr = half === 0 ? sr : sr * (1 + _CHUTE_BULGE);
      const sign = Math.cos(phi) >= 0 ? 1 : -1;
      const tx = Math.cos(phi) * rr, ty = sy, tz = Math.sin(phi) * rr;
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
  const lmIdx = [];
  for (let i = 0; i < N_LINES; i++) {
    const b = i * 6;
    lmIdx.push(b, b+2, b+1, b+1, b+2, b+3);
    lmIdx.push(b+2, b+4, b+3, b+3, b+4, b+5);
  }
  const lmColors = new Float32Array(N_LINES * 18);
  for (let li2 = 0; li2 < N_LINES; li2++) {
    const lineBright = 0.70 + Math.random() * 0.30;
    for (let vi = 0; vi < 6; vi++) {
      const row = Math.floor(vi / 2);
      const heightFade = 1.05 - row * 0.10;
      const noise = 0.90 + Math.random() * 0.20;
      const bright = lineBright * heightFade * noise;
      const ci = (li2 * 6 + vi) * 3;
      lmColors[ci]   = 0.22 * bright;
      lmColors[ci+1] = 0.12 * bright;
      lmColors[ci+2] = 0.04 * bright;
    }
  }
  const lmPosBuf = new Float32BufferAttribute(lmVerts, 3);
  lmPosBuf.setUsage(DynamicDrawUsage);
  const lmGeo = new BufferGeometry();
  lmGeo.setAttribute("position", lmPosBuf);
  lmGeo.setAttribute("color",    new Float32BufferAttribute(lmColors, 3));
  lmGeo.setIndex(lmIdx);
  const linesMesh = new Mesh(lmGeo, new MeshStandardMaterial({
    vertexColors: true, side: DoubleSide, roughness: 0.92, metalness: 0,
  }));
  linesMesh.frustumCulled = false;  // posiciones dinamicas; el bbox queda chico
  group.add(linesMesh);
  group.userData.linesMesh   = linesMesh;
  group.userData.straightPts = straightPts;
  group.userData.lineSeeds   = lineSeeds;
  group.userData.linePhis    = linePhis;
  group.userData.lineWidth   = lineWidth;
  group.userData.N_LINES     = N_LINES;

  // ── Risers (webbing) ───────────────────────────────────────────────────
  const riserMat = new MeshStandardMaterial({
    map: _getStrapTex(), side: DoubleSide, roughness: 0.95, metalness: 0,
  });
  const N_RIBS = 16;
  const hd = riserDepth / 2;
  for (const sign of [1, -1]) {
    const topX = sign * RISER_RX;
    const botX = sign * BODY_RX;
    const hw = riserWidth / 2;
    const nV = N_RIBS * 2 * 4;
    const pos = new Float32Array(nV * 3);
    const uvs = new Float32Array(nV * 2);
    const idx = [];
    for (let rib = 0; rib < N_RIBS; rib++) {
      for (let end = 0; end < 2; end++) {
        const frac = (rib + end) / N_RIBS;
        const cx = topX + (botX - topX) * frac;
        const cy = CONF_Y + (BODY_Y - CONF_Y) * frac;
        const baseIdx = (rib * 2 + end) * 4;
        for (let corner = 0; corner < 4; corner++) {
          const sx = (corner === 1 || corner === 3) ? hw : -hw;
          const sz = (corner === 2 || corner === 3) ? hd : -hd;
          pos[(baseIdx + corner) * 3 + 0] = cx + sx;
          pos[(baseIdx + corner) * 3 + 1] = cy;
          pos[(baseIdx + corner) * 3 + 2] = sz;
          uvs[(baseIdx + corner) * 2 + 0] = corner === 0 || corner === 2 ? 0 : 1;
          uvs[(baseIdx + corner) * 2 + 1] = frac;
        }
      }
      const baseRib = rib * 2 * 4;
      const a = baseRib, b = baseRib + 1, c = baseRib + 4 + 1, d = baseRib + 4;
      idx.push(a, b, c, a, c, d);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv",       new Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new Mesh(geo, riserMat);
    m.userData.isRiser = true;
    group.add(m);
  }

  return group;
}

const _pendV3 = new Vector3();
const _pendQ  = new Quaternion();
const _pendE  = new Euler();

export function Parachute({
  anchorPosRef,
  chuteTRef,
  visible = false,
  params = null,
  pilotQuatRef = null,
}) {
  const groupRef = useRef(null);

  // Rebuild cuando params cambia (clave estable via JSON.stringify)
  const paramsKey = JSON.stringify(params || {});
  const chuteGroup = useMemo(() => buildChuteGroup(params || {}), [paramsKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chuteGroup.visible = visible;
  }, [chuteGroup, visible]);

  useFrame((state) => {
    const chute = chuteGroup;
    if (!chute) return;
    const p = chuteTRef?.current ?? 0;
    if (p <= 0) {
      if (chute.visible) chute.visible = false;
      return;
    }
    if (!chute.visible) chute.visible = true;
    const et = state.clock.elapsedTime;

    // Hoist userData (lookup costoso si se hace por iteracion)
    const ud = chute.userData;
    const delays    = ud.panelDelays;
    const linesMesh = ud.linesMesh;
    const sp        = ud.straightPts;
    const seeds     = ud.lineSeeds;
    const nL        = ud.N_LINES;
    const hw        = (ud.lineWidth ?? 0.008) / 2;
    const cd        = ud.chute;
    const children  = chute.children;

    const ease  = (x) => x * x * (3 - 2 * x);
    const ease3 = (x) => x * x * x * (x * (x * 6 - 15) + 10);

    const yOpen  = ease(Math.min(1, p / 0.28));
    const xzOpen = ease(Math.max(0, Math.min(1, (p - 0.22) / 0.70)));
    const asymm  = Math.sin(p * Math.PI) * 0.08;
    const postP  = Math.max(0, p - 0.88);
    const osc    = Math.sin(postP * 13) * 0.04 * Math.max(0, 1 - postP * 3.5);

    // Inflado por panel
    if (delays) {
      for (let pi = 0; pi < _CHUTE_N_PANELS; pi++) {
        const pm = children[pi];
        if (!pm?.isMesh) continue;
        const d = delays[pi];
        const pp = Math.max(0, Math.min(1, (p - d) / Math.max(0.01, 1 - d)));
        pm.scale.setScalar(0.05 + ease3(pp) * 0.95);
      }
    }

    // Cuerdas: plegadas → tensas (skip si chute apenas abierta — irrelevante visualmente)
    if (linesMesh && p > 0.05) {
      const pa = linesMesh.geometry.attributes.position;
      const rawTens = Math.max(0, (p - 0.25) / 0.75);
      const tEased  = rawTens * rawTens * (3 - 2 * rawTens);
      const slack   = 1 - tEased;
      for (let li = 0; li < nL; li++) {
        const pi = li >> 1;  // bitshift = /2
        const pm = children[pi];
        const pscl = (pm?.isMesh && !pm?.userData?.isRiser) ? (pm.scale.x) : 1;
        const seed = seeds[li];
        const si   = li * 9;
        const tx = sp[si],   ty = sp[si+1], tz = sp[si+2];
        const mx = sp[si+3], my = sp[si+4], mz = sp[si+5];
        const bx = sp[si+6], by = sp[si+7], bz = sp[si+8];
        const atx = tx * pscl, aty = ty * pscl, atz = tz * pscl;
        const wFreq = 2.2 + seed * 4.5;
        const wAmp  = slack * slack * 0.38;
        const wX = Math.sin(et * wFreq       + seed * 17.3) * wAmp;
        const wZ = Math.cos(et * wFreq * 0.7 + seed * 11.9) * wAmp;
        const fmx = atx + (mx - tx) * tEased + wX;
        const fmy = aty + (my - ty) * tEased;
        const fmz = atz + (mz - tz) * tEased + wZ;
        const dx1 = fmx-atx, dy1 = fmy-aty, dz1 = fmz-atz;
        const l1 = Math.sqrt(dx1*dx1+dy1*dy1+dz1*dz1) || 1;
        const t1x = dz1/l1, t1z = -dx1/l1;
        const dx2 = bx-fmx, dy2 = by-fmy, dz2 = bz-fmz;
        const l2 = Math.sqrt(dx2*dx2+dy2*dy2+dz2*dz2) || 1;
        const t2x = dz2/l2, t2z = -dx2/l2;
        const tmx = t1x+t2x, tmz = t1z+t2z;
        const tml = Math.sqrt(tmx*tmx+tmz*tmz) || 1;
        const tmxn = tmx/tml, tmzn = tmz/tml;
        const a = pa.array;
        const vi6 = li * 18;
        a[vi6]    = atx - t1x*hw;  a[vi6+1]  = aty;  a[vi6+2]  = atz - t1z*hw;
        a[vi6+3]  = atx + t1x*hw;  a[vi6+4]  = aty;  a[vi6+5]  = atz + t1z*hw;
        a[vi6+6]  = fmx - tmxn*hw; a[vi6+7]  = fmy;  a[vi6+8]  = fmz - tmzn*hw;
        a[vi6+9]  = fmx + tmxn*hw; a[vi6+10] = fmy;  a[vi6+11] = fmz + tmzn*hw;
        a[vi6+12] = bx  - t2x*hw;  a[vi6+13] = by;   a[vi6+14] = bz  - t2z*hw;
        a[vi6+15] = bx  + t2x*hw;  a[vi6+16] = by;   a[vi6+17] = bz  + t2z*hw;
      }
      pa.needsUpdate = true;
    }

    // Caos del grupo
    const chaos = Math.max(0, 1.0 - p * 2.0) * (1 + Math.sin(et * 23) * 0.3);
    const wobX = (Math.sin(et * 8.7) * 0.55 + Math.sin(et * 14.3 + 1.1) * 0.45) * chaos * 0.55;
    const wobZ = (Math.cos(et * 7.2) * 0.55 + Math.cos(et * 19.1 + 2.4) * 0.45) * chaos * 0.50;
    const wobY = (Math.sin(et * 5.1 + 0.8) * 0.5 + Math.sin(et * 11.9) * 0.5)   * chaos * 0.35;
    const sNoise = (Math.sin(et * 6.7) * 0.6 + Math.sin(et * 17.3) * 0.4)        * chaos * 0.20;

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

    // Anclaje al hombro del piloto
    if (anchorPosRef?.current) {
      const ap = anchorPosRef.current;
      const sx = ap.x + (cd?.offsetX ?? 0);
      const sy = ap.y + (cd?.shoulderOffset ?? 0.40) + (cd?.offsetY ?? 0);
      const sz = ap.z + (cd?.offsetZ ?? 0);
      _pendV3.set(0, (cd?.bodyY ?? _CHUTE_BODY_Y) * (yOpen * 2), 0).applyEuler(chute.rotation);
      chute.position.set(sx - _pendV3.x, sy - _pendV3.y, sz - _pendV3.z);
    }

    // Aplicar pendulo al piloto si tenemos su quat ref
    if (pilotQuatRef?.current) {
      const couplingT = Math.min(1, p / 0.6);
      const coupEase = couplingT * couplingT * (3 - 2 * couplingT);
      _pendQ.setFromEuler(_pendE.set(
        chute.rotation.x * 0.6 * coupEase,
        0,
        chute.rotation.z * 0.6 * coupEase,
      ));
      pilotQuatRef.current.premultiply(_pendQ);
    }
  });

  return <primitive ref={groupRef} object={chuteGroup} />;
}
