"use client";

import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import F35C from "./F35C";

const btnStyle = (active) => ({
  padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "monospace", fontSize: 12,
  border: "1px solid rgba(173,191,214,0.3)",
  background: active ? "rgba(100,160,230,0.25)" : "rgba(6,10,18,0.76)",
  color: active ? "#eef4ff" : "#7a9ec4",
});

export default function F35CTestScene() {
  const [gearDown, setGearDown] = useState(true);

  return (
    <main style={{ width: "100vw", height: "100vh", background: "#0b1016" }}>
      <div style={{
        position: "absolute", zIndex: 10, top: 16, left: 16,
        display: "flex", flexDirection: "column", gap: 8,
        padding: "10px 14px", borderRadius: 8,
        background: "rgba(6,10,18,0.76)", border: "1px solid rgba(173,191,214,0.16)",
        color: "#7a9ec4", fontFamily: "monospace", fontSize: 12,
        backdropFilter: "blur(12px)",
      }}>
        <div>F-35C · Test Scene · drag para orbitar · scroll para zoom</div>
        <div style={{ display: "flex", gap: 6 }}>
          <span>Tren:</span>
          <button style={btnStyle(gearDown)}  onClick={() => setGearDown(true)}>Abajo</button>
          <button style={btnStyle(!gearDown)} onClick={() => setGearDown(false)}>Arriba</button>
        </div>
      </div>

      <Canvas
        camera={{ position: [8, 4, 12], fov: 42 }}
        shadows={{ type: THREE.PCFShadowMap }}
      >
        <color attach="background" args={["#0b1016"]} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[8, 10, 6]} intensity={2.2} castShadow />
        <Environment preset="city" />

        <Suspense fallback={null}>
          <F35C scale={1} position={[0, 0, 0]} rotation={[0, 0, 0]} gearDown={gearDown} />
        </Suspense>

        <Grid
          position={[0, -2, 0]}
          args={[40, 40]}
          cellColor="#1a2a3a"
          sectionColor="#2a4a6a"
          fadeDistance={30}
        />

        <OrbitControls target={[0, 0, 0]} />
      </Canvas>
    </main>
  );
}
