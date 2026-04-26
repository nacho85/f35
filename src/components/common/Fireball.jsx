"use client";

// Fireball corto para flash de explosión. Quad billboard con shader hot core
// → outer flames → fade. Activar via stateRef.current = { active: true, t: 0, pos: Vector3 }.

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import {
  PlaneGeometry, ShaderMaterial, Mesh, Quaternion, Vector3,
  AdditiveBlending, DoubleSide,
} from "three";

export const FIREBALL_DUR = 0.85;

const _fbGeo = new PlaneGeometry(1, 1);
const _fbMat = new ShaderMaterial({
  uniforms: { uAge: { value: 0 }, uSeed: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uAge;   // 0..1
    uniform float uSeed;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vnoise(vec2 p) {
      vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                 mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
    }
    float fbm(vec2 p) {
      float v=0.0,a=0.5;
      for(int i=0;i<5;i++){v+=a*vnoise(p);p=p*2.1+vec2(1.7,9.2);a*=0.5;}
      return v;
    }
    void main() {
      vec2 uv = vUv - 0.5;
      float r = length(uv) * 2.0;
      // Forma irregular via noise
      vec2 nuv = uv * 3.5 + vec2(uSeed, uSeed*1.3) + uAge * 0.6;
      float n = fbm(nuv);
      float edge = 0.55 + n * 0.30;
      float mask = 1.0 - smoothstep(edge - 0.25, edge, r);
      if (mask < 0.005) discard;
      // Color: blanco caliente -> amarillo -> naranja -> rojo
      vec3 hot   = vec3(1.0, 0.95, 0.80);
      vec3 mid   = vec3(1.0, 0.65, 0.20);
      vec3 cool  = vec3(0.85, 0.20, 0.05);
      float coreAge = smoothstep(0.0, 0.45, uAge);
      vec3 col = mix(hot, mid, coreAge);
      col = mix(col, cool, smoothstep(0.35, 0.85, uAge));
      // Density con noise: hueco interior aparece con la edad
      float density = mask * (0.6 + n * 0.4);
      // Fade global: brilla fuerte al inicio, decae rapido
      float fade = (1.0 - uAge) * (1.0 - uAge);
      gl_FragColor = vec4(col * (1.5 + (1.0 - uAge) * 1.5), density * fade);
    }
  `,
  transparent: true,
  depthWrite: false,
  depthTest: false,            // siempre visible — no se oculta dentro del fuselaje
  blending: AdditiveBlending,
  side: DoubleSide,
});

const _fbMesh = new Mesh(_fbGeo, _fbMat);
_fbMesh.frustumCulled = false;
_fbMesh.renderOrder = 999;     // dibuja al final
_fbMesh.visible = false;

const _fb_cQ = new Quaternion();

export function Fireball({ stateRef, maxScale = 4.5 }) {
  const groupRef = useRef();

  useEffect(() => {
    groupRef.current?.add(_fbMesh);
    return () => _fbMesh.removeFromParent();
  }, []);

  useFrame(({ camera }, delta) => {
    const st = stateRef.current;
    if (!st.active) {
      if (_fbMesh.visible) _fbMesh.visible = false;
      return;
    }
    st.t += delta;
    if (st.t >= FIREBALL_DUR) {
      st.active = false;
      _fbMesh.visible = false;
      return;
    }
    const k = st.t / FIREBALL_DUR;
    if (groupRef.current) groupRef.current.position.copy(st.pos);
    camera.getWorldQuaternion(_fb_cQ);
    _fbMesh.quaternion.copy(_fb_cQ);
    // Expansion: arranca a 30% del max para verse de entrada, crece y asintota
    const sz = maxScale * (0.30 + 0.70 * (1 - Math.exp(-k * 5.5)));
    _fbMesh.scale.set(sz, sz, 1);
    _fbMat.uniforms.uAge.value  = k;
    _fbMat.uniforms.uSeed.value = st.seed ?? 0;
    _fbMesh.visible = true;
  });

  return <group ref={groupRef} />;
}
