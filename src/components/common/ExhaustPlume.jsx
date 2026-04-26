"use client";

// Plume del afterburner reutilizable. Particle system + glow + pointLight.
// Posicion controlada por posRef (Vector3), intensidad por throttleRef (0..1).
// Local -Z = direccion del chorro (la geometria del plume extiende en -Z).
// Originalmente parte de F35C.jsx, extraido aca para reuso por F-14, F-18, etc.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry, BufferAttribute, ShaderMaterial,
  AdditiveBlending, Sphere, Vector3,
} from "three";

const PLUME_H      = 8.0;
const PLUME_R0     = 0.20;
const N_PART       = 1400;  // 800 base (AB onset) + 600 extra (AB pleno 95%+)
const N_PART_BASE  = 800;

function buildPlumeGeo() {
  const posArr   = new Float32Array(N_PART * 3);
  const dataArr  = new Float32Array(N_PART * 4);
  const extraArr = new Float32Array(N_PART);
  for (let i = 0; i < N_PART; i++) {
    const t    = Math.pow(Math.random(), 0.5);
    const maxR = PLUME_R0 * Math.max(0.90, 1 - t * 0.10);
    const r    = Math.random() * maxR;
    const phi  = Math.random() * Math.PI * 2;
    posArr[i*3+0] = Math.cos(phi) * r;
    posArr[i*3+1] = Math.sin(phi) * r;
    posArr[i*3+2] = -t * PLUME_H;
    dataArr[i*4+0] = maxR > 0.001 ? r / maxR : 0;
    dataArr[i*4+1] = t;
    dataArr[i*4+2] = Math.random() * Math.PI * 2;
    dataArr[i*4+3] = 0.5 + Math.random() * 0.9;
    extraArr[i]    = i < N_PART_BASE ? 0.0 : 1.0;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(posArr,   3));
  geo.setAttribute('aData',    new BufferAttribute(dataArr,  4));
  geo.setAttribute('aExtra',   new BufferAttribute(extraArr, 1));
  geo.boundingSphere = new Sphere(new Vector3(0, 0, -PLUME_H / 2), PLUME_H);
  return geo;
}

const _plumeGeo = buildPlumeGeo();

const _ptMat = new ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uThrottle: { value: 0 } },
  vertexShader: `
    attribute vec4  aData;
    attribute float aExtra;
    uniform float uTime;
    uniform float uThrottle;
    varying float vNr;
    varying float vEffT;
    varying float vAlpha;
    varying float vPhase;
    varying float vMachWave;
    void main() {
      float nr    = aData.x;
      float t     = aData.y;
      float phase = aData.z;
      float spd   = aData.w;

      float rawFlame = smoothstep(0.70, 0.95, uThrottle);
      float flameT   = step(0.30, uThrottle) * max(rawFlame, 0.04);
      float plumeScale = flameT;
      float effT = t * plumeScale;

      vec3 pos = position;
      pos.z = -effT * 8.0;

      float abStr    = smoothstep(0.30, 0.55, uThrottle);
      float machPhase = effT * 40.0 - uTime * 0.35;
      float machWv   = 0.5 + 0.5 * sin(machPhase);
      float radiusMod = 1.0 + (machWv - 0.5) * 0.38 * abStr;
      pos.x *= radiusMod;
      pos.y *= radiusMod;

      float wobble = mix(0.055, 0.010, plumeScale);
      float anim = uTime * spd;
      pos.x += sin(anim * 1.7 + phase)        * wobble * (1.0 - effT * 0.5);
      pos.y += cos(anim * 1.3 + phase * 1.25) * wobble * (1.0 - effT * 0.5);

      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      float dist = max(-mvPos.z, 0.1);

      float innerSz = mix(2.6, 0.04, effT) * (1.0 - nr * 0.45);
      float outerSz = mix(1.8, 0.04, effT) * (0.3 + nr * 0.7);
      float thBase  = flameT;
      float thExtra = smoothstep(0.95, 1.0, uThrottle);
      float thAB    = mix(thBase, thExtra, aExtra);
      float worldSz = mix(innerSz, outerSz, smoothstep(0.0, 0.5, nr)) * thAB;
      gl_PointSize = clamp(worldSz * projectionMatrix[1][1] * 300.0 / dist, 0.5, 48.0);

      vAlpha     = (1.0 - nr * 0.70) * pow(max(0.0, 1.0 - effT), 2.2);
      vNr        = nr;
      vEffT      = effT;
      vPhase     = phase;
      vMachWave  = machWv;
      gl_Position = projectionMatrix * mvPos;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uThrottle;
    varying float vNr;
    varying float vEffT;
    varying float vAlpha;
    varying float vPhase;
    varying float vMachWave;
    void main() {
      vec2  uv   = gl_PointCoord - 0.5;
      float r    = length(uv) * 2.0;

      float nr = clamp(vNr,   0.0, 1.0);
      float et = clamp(vEffT, 0.0, 1.0);

      float discEdge = mix(0.50, 0.06, et);
      float disc = 1.0 - smoothstep(discEdge, 1.0, r);

      float rawFlame = smoothstep(0.70, 0.95, uThrottle);
      float frozenMin = 0.10 + 0.15 * smoothstep(0.55, 0.70, uThrottle);
      float flameT   = step(0.30, uThrottle) * max(rawFlame, frozenMin);
      float abFactor = flameT;

      vec3 coreCol  = mix(vec3(1.00, 0.50, 0.05), vec3(0.92, 0.96, 1.00), abFactor);
      vec3 hotCol   = mix(vec3(1.00, 0.38, 0.03), vec3(1.00, 0.88, 0.35), abFactor);
      vec3 midCol   = vec3(1.00, 0.32, 0.04);
      vec3 coolCol  = vec3(0.85, 0.10, 0.01);
      vec3 col = mix(coreCol, hotCol,  smoothstep(0.00, 0.22, nr));
           col = mix(col,     midCol,  smoothstep(0.22, 0.58, nr));
           col = mix(col,     coolCol, smoothstep(0.58, 0.88, nr));

      vec3  tipCol   = vec3(0.40, 0.58, 1.00);
      float tipBlend = smoothstep(0.08, 0.92, et) * abFactor;
      col = mix(col, tipCol, tipBlend * 0.90);

      float abStr    = smoothstep(0.85, 0.95, uThrottle);
      float coreMask = 1.0 - smoothstep(0.0, 1.0, nr);
      float machWave = vMachWave;
      float machPow  = pow(machWave, 6.0);
      float machMod  = mix(0.12, 1.25, machPow);
      col *= mix(1.0, machMod, abStr * coreMask);

      col = mix(col, coolCol * 0.5, et * 0.35 * (1.0 - tipBlend));

      float fl = 0.88 + 0.12 * sin(uTime * 22.0) * sin(uTime * 15.7 + nr * 2.0);

      float hash    = fract(sin(vPhase * 127.3 + 1.7) * 4831.3);
      float tipFade = mix(1.0, hash * hash, smoothstep(0.22, 0.65, et));

      float alpha = vAlpha * disc * fl * tipFade;
      float machAlpha = mix(1.0, mix(0.15, 0.88, machPow), abStr * coreMask);
      alpha *= machAlpha;

      float throttleAlpha = flameT;
      gl_FragColor = vec4(col, clamp(alpha * 0.26 * throttleAlpha * throttleAlpha, 0.0, 1.0));
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
});

const _glowGeo = (() => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3));
  g.boundingSphere = new Sphere(new Vector3(0, 0, 0), 3);
  return g;
})();

const _glowMat = new ShaderMaterial({
  uniforms: { uThrottle: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `
    uniform float uThrottle;
    void main() {
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      float dist   = max(-mvPos.z, 0.1);
      float abG     = smoothstep(0.68, 0.95, uThrottle);
      float worldSz = abG * 0.70;
      gl_PointSize = clamp(worldSz * projectionMatrix[1][1] * 300.0 / dist, 1.0, 90.0);
      gl_Position  = projectionMatrix * mvPos;
    }
  `,
  fragmentShader: `
    uniform float uThrottle;
    uniform float uTime;
    void main() {
      vec2  uv = gl_PointCoord - 0.5;
      float r  = length(uv) * 2.0;
      float g  = pow(1.0 - smoothstep(0.0, 1.0, r), 1.5);
      float fl = 0.88 + 0.12 * sin(uTime * 23.0) * sin(uTime * 17.0);
      vec3 idleCol = vec3(0.95, 0.22, 0.03);
      vec3 abCol   = vec3(0.65, 0.82, 1.00);
      vec3 col = mix(idleCol, abCol, smoothstep(0.25, 0.70, uThrottle));
      float abGlow = smoothstep(0.68, 0.95, uThrottle);
      gl_FragColor = vec4(col, g * fl * abGlow * 0.55);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
});

export function ExhaustPlume({ posRef, throttleRef }) {
  const grpRef   = useRef();
  const lightRef = useRef();

  useFrame(({ clock }) => {
    if (!grpRef.current) return;
    if (posRef.current) grpRef.current.position.copy(posRef.current);

    const th = throttleRef.current;
    const t = clock.elapsedTime;
    _ptMat.uniforms.uTime.value       = t;
    _ptMat.uniforms.uThrottle.value   = th;
    _glowMat.uniforms.uTime.value     = t;
    _glowMat.uniforms.uThrottle.value = th;

    if (lightRef.current) {
      const abT = Math.max(0, (th - 0.70) / 0.25);
      lightRef.current.intensity = abT * abT * 3.0 *
        (0.80 + 0.20 * Math.sin(t * 17.3) * Math.sin(t * 23.7));
    }
  });

  return (
    <group ref={grpRef}>
      <points geometry={_plumeGeo} material={_ptMat} />
      <points geometry={_glowGeo}  material={_glowMat} />
      <pointLight ref={lightRef} color={0xff8833} intensity={0} distance={8} decay={2} />
    </group>
  );
}
