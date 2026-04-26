"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import F35 from "./F35";

export default function F35MountedScene() {
  return (
    <main style={{ width: "100vw", height: "100vh", background: "#0b1016" }}>
      <Canvas
        camera={{ position: [0, 2.5, 9], fov: 42 }}
        shadows={{ type: THREE.PCFShadowMap }}
      >
        <color attach="background" args={["#091019"]} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[8, 10, 6]} intensity={2.2} castShadow />
        <Environment preset="city" />

        <Suspense fallback={null}>
          <F35
            scale={1}
            position={[0, -1, 0]}
            rotation={[0, 0, 0]}
            flap={0}
            rudder={0}
            roll={0}
            pitch={0}
            debug={false}
            playEmbeddedAnimation={true}
          />
        </Suspense>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial roughness={1} metalness={0} />
        </mesh>

        <OrbitControls />
      </Canvas>
    </main>
  );
}
