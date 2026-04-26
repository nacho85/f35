"use client";

// Llama del cohete del asiento eyector — extraída de F35C.
// 380 GL_POINTS con shader: core blanco-azul → amarillo → naranja → rojo → humo.
// Expansión tipo campana, turbulencia caótica, flicker dual-frequency, dissipación irregular.
//
// Uso:
//   const posRef       = useRef(new Vector3());
//   const intensityRef = useRef(0);
//   ...durante fase de cohete: intensityRef.current = 1.0; posRef.current.copy(worldPos);
//   <SeatRocketFlame posRef={posRef} intensityRef={intensityRef} />
//
// IMPORTANTE: La llama apunta hacia -Y mundial (abajo) — el componente aplica
// rotation [-π/2, 0, 0] internamente. posRef debe ser la POSICIÓN BASE del cohete
// (de donde sale la llama hacia abajo).

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry, BufferAttribute, ShaderMaterial, Sphere, Vector3,
  AdditiveBlending,
} from "three";

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
  geo.setAttribute("position", new BufferAttribute(posArr,  3));
  geo.setAttribute("aData",    new BufferAttribute(dataArr, 4));
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
      float bellScale = 1.0 + t * 1.8;
      pos.x *= bellScale;
      pos.y *= bellScale;
      float turb = mix(0.08, 0.02, t);
      pos.x += sin(uTime * spd * 2.6 + phase)          * turb;
      pos.y += cos(uTime * spd * 2.1 + phase * 1.7)    * turb;
      pos.x += sin(uTime * 31.0 + phase * 3.1)         * 0.025 * (1.0 - t);
      pos.y += cos(uTime * 27.0 + phase * 2.3)         * 0.025 * (1.0 - t);
      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      float dist = max(-mvPos.z, 0.1);
      float sz = mix(5.5, 0.2, t * t) * (1.0 - nr * 0.50) * uIntensity;
      gl_PointSize = clamp(sz * projectionMatrix[1][1] * 300.0 / dist, 0.5, 90.0);
      vAlpha = (1.0 - nr * 0.62) * pow(max(0.0, 1.0 - t), 1.4);
      vNr    = nr;
      vEffT  = t;
      vPhase = phase;
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
    float h11(float p) { return fract(sin(p * 127.3 + 1.7) * 43758.5); }
    void main() {
      vec2  uv   = gl_PointCoord - 0.5;
      float r    = length(uv) * 2.0;
      float disc = pow(max(0.0, 1.0 - r), 1.3);
      vec3 coreCol  = vec3(1.00, 0.98, 1.00);
      vec3 hotCol   = vec3(1.00, 0.90, 0.35);
      vec3 midCol   = vec3(1.00, 0.45, 0.06);
      vec3 coolCol  = vec3(0.80, 0.10, 0.01);
      vec3 smokeCol = vec3(0.18, 0.10, 0.08);
      vec3 col = mix(coreCol,  hotCol,   smoothstep(0.00, 0.15, vNr));
           col = mix(col,      midCol,   smoothstep(0.15, 0.48, vNr));
           col = mix(col,      coolCol,  smoothstep(0.48, 0.80, vNr));
           col = mix(col,      smokeCol, smoothstep(0.80, 1.00, vNr));
      vec3 tipCol = mix(vec3(0.60, 0.08, 0.01), vec3(0.12, 0.07, 0.06), smoothstep(0.5, 1.0, vEffT));
      col = mix(col, tipCol, smoothstep(0.30, 0.90, vEffT) * (0.5 + vNr * 0.5));
      float fl1  = 0.82 + 0.18 * sin(uTime * 38.0 + vPhase * 5.0);
      float fl2  = 0.90 + 0.10 * sin(uTime * 61.0 + vPhase * 8.3);
      float fl   = fl1 * fl2;
      float hash  = h11(vPhase);
      float hash2 = h11(vPhase * 7.3 + 2.1);
      float earlyFade = mix(1.0, hash * hash2, smoothstep(0.18, 0.60, vEffT));
      float alpha = vAlpha * disc * fl * earlyFade;
      float coreBright = (1.0 - smoothstep(0.0, 0.12, vNr)) * (1.0 - vEffT) * 0.4;
      gl_FragColor = vec4(col + coreBright, clamp(alpha * 0.75 * uIntensity, 0.0, 1.0));
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
});

export function SeatRocketFlame({ posRef, intensityRef }) {
  const grpRef   = useRef();
  const lightRef = useRef();

  useFrame(({ clock }) => {
    if (!grpRef.current) return;
    const intensity = intensityRef.current;
    if (posRef.current) grpRef.current.position.copy(posRef.current);
    const t = clock.elapsedTime;
    _rocketMat.uniforms.uTime.value      = t;
    _rocketMat.uniforms.uIntensity.value = intensity;
    if (lightRef.current) {
      lightRef.current.intensity = intensity > 0.01
        ? intensity * 12.0 * (0.72 + 0.28 * Math.sin(t * 48))
        : 0;
    }
  });

  // -90°X: local -Z (direccion de las particulas) apunta hacia -Y mundial (abajo)
  return (
    <group ref={grpRef} rotation={[-Math.PI / 2, 0, 0]}>
      <points geometry={_rocketGeo} material={_rocketMat} />
      <pointLight ref={lightRef} color={0xffaa44} intensity={0} distance={5} decay={2} />
    </group>
  );
}
