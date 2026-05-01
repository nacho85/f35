"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, extend } from "@react-three/fiber";
import * as THREE from "three";
import { Water } from "three-stdlib";

extend({ Water });

// ─── Componente ───────────────────────────────────────────────────────────────

const WATER_SIZE = 200000; // 200 km × 200 km — cubre todo el área visible
const NORMAL_REPEAT = 200;  // cuántas veces se tilea el normal map sobre el plano

// Water normal map oficial de three.js (1024×1024, hand-tweaked) — diseñado
// específicamente para el shader Water con tile invisible. Mucho mejor que
// el procedural FBM que mostraba grilla.
const WATER_NORMALS_URL = "/textures/water/waternormals.jpg";

export default function GulfInfiniteWater({ y = 0.05, sunDirection = [0.5, 0.7, -0.3] }) {
  const waterRef = useRef();
  const { scene } = useThree();

  const waterNormals = useMemo(() => {
    const tex = new THREE.TextureLoader().load(WATER_NORMALS_URL);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, []);

  const waterObject = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE);
    const water = new Water(geo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,
      sunDirection: new THREE.Vector3(...sunDirection).normalize(),
      sunColor: 0xfff5e0,
      // Turquesa saturado del Golfo Pérsico — más verde, más oscuro que el
      // default. Compensa el washout del Fresnel a ángulos rasantes.
      waterColor: 0x103e58,
      // Distortion alto rompe el reflejo en espejo perfecto que se ve "blanco"
      // a vista lejana, simula olas más visibles.
      distortionScale: 7.5,
      fog: !!scene.fog,
      alpha: 1.0,
    });
    water.rotation.x = -Math.PI / 2;
    water.material.uniforms.normalSampler.value.repeat.set(NORMAL_REPEAT, NORMAL_REPEAT);
    return water;
  }, [waterNormals, sunDirection, scene.fog]);

  useFrame((_state, delta) => {
    if (waterObject) waterObject.material.uniforms.time.value += delta;
  });

  return <primitive ref={waterRef} object={waterObject} position={[0, y, 0]} />;
}
