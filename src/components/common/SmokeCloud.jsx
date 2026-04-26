"use client";

// Nube de humo de eyección — extraída de F35C.
// Singleton InstancedMesh a nivel módulo (sin sobrecosto si no está activo).
// Uso:
//   const stateRef = useRef({ active: false, t: 0, pos: new Vector3() });
//   ...al disparar: stateRef.current.active = true; stateRef.current.t = 0; stateRef.current.pos.copy(p);
//   <SmokeCloud stateRef={stateRef} />

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import {
  InstancedMesh, InstancedBufferAttribute, PlaneGeometry, ShaderMaterial,
  Quaternion, Vector3, Matrix4, DynamicDrawUsage, NormalBlending, DoubleSide,
} from "three";

const N_SMOKE   = 120;
export const SMOKE_DUR = 7.0;

const _pVelX  = new Float32Array(N_SMOKE);
const _pVelY  = new Float32Array(N_SMOKE);
const _pVelZ  = new Float32Array(N_SMOKE);
const _pBirth = new Float32Array(N_SMOKE);
const _pLife  = new Float32Array(N_SMOKE);
const _pPhase = new Float32Array(N_SMOKE);
const _pSpin  = new Float32Array(N_SMOKE);
const _pSeed  = new Float32Array(N_SMOKE);

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

const _iAlphaArr = new Float32Array(N_SMOKE);
const _iAgeArr   = new Float32Array(N_SMOKE);
const _iPhaseArr = new Float32Array(N_SMOKE);
const _iSeedArr  = new Float32Array(N_SMOKE);
const _iAttrAlpha = new InstancedBufferAttribute(_iAlphaArr, 1); _iAttrAlpha.setUsage(DynamicDrawUsage);
const _iAttrAge   = new InstancedBufferAttribute(_iAgeArr,   1); _iAttrAge.setUsage(DynamicDrawUsage);
const _iAttrPhase = new InstancedBufferAttribute(_iPhaseArr, 1);
const _iAttrSeed  = new InstancedBufferAttribute(_iSeedArr,  1);

const _smokePlaneGeo = new PlaneGeometry(1, 1);
_smokePlaneGeo.setAttribute("aAlpha", _iAttrAlpha);
_smokePlaneGeo.setAttribute("aAge",   _iAttrAge);
_smokePlaneGeo.setAttribute("aPhase", _iAttrPhase);
_smokePlaneGeo.setAttribute("aSeed",  _iAttrSeed);

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
      vUv2 = uv; vAlpha = aAlpha; vAge = aAge; vPhase = aPhase; vSeed = aSeed;
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
      vec2 uv = vUv2 - 0.5;
      float slowAge = vAge * 0.18;
      vec2 seed2 = vec2(cos(vPhase + vSeed)*3.1, sin(vPhase * 1.3 + vSeed)*2.7);
      vec2 nuv = uv * 2.8 + seed2 + vec2(slowAge * 0.7, slowAge * 0.4);
      float n1 = fbm(nuv);
      float n2 = fbm(nuv * 1.6 + vec2(5.3, 2.1) + slowAge * 0.3);
      float r = length(uv) * 2.0;
      float edgeCtrl = n1 * 0.55 + n2 * 0.25;
      float mask = 1.0 - smoothstep(0.10 + edgeCtrl, 0.50 + edgeCtrl, r);
      if (mask < 0.005) discard;
      float density = mask * (0.5 + n1 * 0.3 + n2 * 0.2);
      vec3 hotColor  = mix(vec3(0.08,0.05,0.03), vec3(0.30,0.25,0.20), n1);
      vec3 coolColor = mix(vec3(0.50,0.48,0.46), vec3(0.78,0.76,0.74), n2);
      vec3 col = mix(hotColor, coolColor, smoothstep(0.0, 0.35, vAge));
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

const _smokeMesh = new InstancedMesh(_smokePlaneGeo, _smokeMat, N_SMOKE);
_smokeMesh.instanceMatrix.setUsage(DynamicDrawUsage);
_smokeMesh.frustumCulled = false;
_smokeMesh.count = 0;

const _sm_cQ  = new Quaternion();
const _sm_spQ = new Quaternion();
const _sm_fQ  = new Quaternion();
const _sm_fwd = new Vector3(0, 0, 1);
const _sm_pos = new Vector3();
const _sm_scl = new Vector3();
const _sm_mat = new Matrix4();

export function SmokeCloud({ stateRef }) {
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
      const k = 0.45, decay = (1 - Math.exp(-k * age)) / k;
      const turb = Math.min(age * 0.20, 0.50);
      _sm_pos.set(
        _pVelX[i] * decay + Math.sin(_pPhase[i]       + age * 1.3) * turb,
        _pVelY[i] * decay,
        _pVelZ[i] * decay + Math.cos(_pPhase[i] * 1.7 + age * 1.0) * turb,
      );
      const sz = 0.4 + 7.0 * Math.pow(normAge, 0.45);
      _sm_scl.set(sz, sz, 1);
      _sm_spQ.setFromAxisAngle(_sm_fwd, _pSpin[i] * age);
      _sm_fQ.multiplyQuaternions(_sm_cQ, _sm_spQ);
      _sm_mat.compose(_sm_pos, _sm_fQ, _sm_scl);
      _smokeMesh.setMatrixAt(i, _sm_mat);
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
