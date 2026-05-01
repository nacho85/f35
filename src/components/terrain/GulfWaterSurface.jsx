"use client";

import { useEffect, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";

// GLB de Sketchfab (CC-BY-4.0, Krivolap Denis): plano XY ~35×30 con Z=0 base y
// 10 morph targets driven por una animación de 6s en loop. Z = eje de
// desplazamiento de las olas, así que aplicamos rotation -π/2 X para alinear
// Z→+Y (up en three) y escalamos solo X/Y (NO Z) para preservar la altura
// natural de las olas.

useGLTF.preload("/water_surface.glb");

export default function GulfWaterSurface({
  position = [0, 0.05, -6000],
  horizontalScale = 250,
}) {
  const groupRef = useRef();
  const { scene, animations } = useGLTF("/water_surface.glb");
  const { actions, names } = useAnimations(animations, scene);

  useEffect(() => {
    if (!names.length) return;
    const action = actions[names[0]];
    if (!action) return;
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    return () => { action.stop(); };
  }, [actions, names]);

  // Receive shadows desactivado: las olas son chicas vs. el sol y los morph
  // targets confunden al cálculo de sombras.
  useEffect(() => {
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        obj.frustumCulled = false; // morph targets pueden expandir la AABB
      }
    });
  }, [scene]);

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[horizontalScale, horizontalScale, 1]}
    >
      <primitive object={scene} />
    </group>
  );
}
