"use client";

import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import F18 from "./F18";

const btnStyle = (active) => ({
  padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "monospace", fontSize: 12,
  border: "1px solid rgba(173,191,214,0.3)",
  background: active ? "rgba(100,160,230,0.25)" : "rgba(6,10,18,0.76)",
  color: active ? "#eef4ff" : "#7a9ec4",
});

const Slider = ({ label, value, min, max, step = 0.01, onChange }) => (
  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
    <span style={{ width: 110 }}>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{ width: 130, accentColor: "#6ab0ff" }} />
    <span style={{ width: 44, textAlign: "right" }}>{value.toFixed(2)}</span>
  </div>
);

const PI = Math.PI;

export default function F18TestScene() {
  const [canopyOpen,      setCanopyOpen]      = useState(false);
  const [hookDown,        setHookDown]        = useState(false);
  const [gearT,           setGearT]           = useState(1);
  // Puerta nasal L (roja)
  const [noseDoorAngleL,     setNoseDoorAngleL]     = useState(PI / 2);
  const [noseHingeAxisLY,    setNoseHingeAxisLY]    = useState(0);
  const [noseHingeAxisLZ,    setNoseHingeAxisLZ]    = useState(0);
  const [nosePivotLY,        setNosePivotLY]        = useState(-0.61);
  const [nosePivotLZ,        setNosePivotLZ]        = useState(-0.365);

  // Puerta nasal R Fwd (naranja oscuro)
  const [noseDoorAngleRFwd,  setNoseDoorAngleRFwd]  = useState(PI / 2);
  const [nosePivotRFwdY,     setNosePivotRFwdY]     = useState(-0.61);
  const [nosePivotRFwdZ,     setNosePivotRFwdZ]     = useState(0.365);

  // Puerta nasal R Aft (naranja claro)
  const [noseDoorAngleRAft,  setNoseDoorAngleRAft]  = useState(PI / 2);
  const [noseHingeAxisRAftY, setNoseHingeAxisRAftY] = useState(0);
  const [noseHingeAxisRAftZ, setNoseHingeAxisRAftZ] = useState(0);
  const [nosePivotRAftY,     setNosePivotRAftY]     = useState(-0.79);
  const [nosePivotRAftZ,     setNosePivotRAftZ]     = useState(0.38);

  // Compuertas principales
  const [gearLDoorAngle,  setGearLDoorAngle]  = useState(PI / 2);
  const [gearRDoorAngle,  setGearRDoorAngle]  = useState(-PI / 2);

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
        <div>F/A-18 Hornet · Test Scene · drag para orbitar</div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Canopy:</span>
          <button style={btnStyle(!canopyOpen)} onClick={() => setCanopyOpen(false)}>Cerrado</button>
          <button style={btnStyle(canopyOpen)}  onClick={() => setCanopyOpen(true)}>Abierto</button>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Hook:</span>
          <button style={btnStyle(!hookDown)} onClick={() => setHookDown(false)}>Up</button>
          <button style={btnStyle(hookDown)}  onClick={() => setHookDown(true)}>Down</button>
        </div>

        <div style={{ borderTop: "1px solid rgba(173,191,214,0.1)", paddingTop: 6 }}>
          <Slider label="Gear" value={gearT} min={0} max={1} onChange={setGearT} />
        </div>

        {/* ── Puerta nasal L (roja) ── */}
        <div style={{ borderTop: "1px solid rgba(173,191,214,0.1)", paddingTop: 6 }}>
          <div style={{ marginBottom: 4, color: "#ff4444" }}>Compuerta nasal L (roja)</div>
          <Slider label="Ángulo"    value={noseDoorAngleL}  min={-PI} max={PI}   onChange={setNoseDoorAngleL} />
          <Slider label="Eje Y"     value={noseHingeAxisLY} min={-1}  max={1}    onChange={setNoseHingeAxisLY} />
          <Slider label="Eje Z"     value={noseHingeAxisLZ} min={-1}  max={1}    onChange={setNoseHingeAxisLZ} />
          <Slider label="Pivot Y"   value={nosePivotLY}     min={-1.5} max={0}   onChange={setNosePivotLY} />
          <Slider label="Pivot Z"   value={nosePivotLZ}     min={-0.8} max={0.6} onChange={setNosePivotLZ} />
        </div>

        {/* ── Puerta nasal R Fwd (naranja oscuro) ── */}
        <div style={{ borderTop: "1px solid rgba(173,191,214,0.1)", paddingTop: 6 }}>
          <div style={{ marginBottom: 4, color: "#ff6600" }}>Compuerta nasal R Fwd (naranja)</div>
          <Slider label="Ángulo"  value={noseDoorAngleRFwd} min={-PI} max={PI}   onChange={setNoseDoorAngleRFwd} />
          <Slider label="Pivot Y" value={nosePivotRFwdY}    min={-1.5} max={0}   onChange={setNosePivotRFwdY} />
          <Slider label="Pivot Z" value={nosePivotRFwdZ}    min={-0.6} max={0.8} onChange={setNosePivotRFwdZ} />
        </div>

        {/* ── Puerta nasal R Aft (naranja claro) ── */}
        <div style={{ borderTop: "1px solid rgba(173,191,214,0.1)", paddingTop: 6 }}>
          <div style={{ marginBottom: 4, color: "#ff9900" }}>Compuerta nasal R Aft (naranja claro)</div>
          <Slider label="Ángulo"    value={noseDoorAngleRAft}  min={-PI} max={PI}   onChange={setNoseDoorAngleRAft} />
          <Slider label="Eje Y"     value={noseHingeAxisRAftY} min={-1}  max={1}    onChange={setNoseHingeAxisRAftY} />
          <Slider label="Eje Z"     value={noseHingeAxisRAftZ} min={-1}  max={1}    onChange={setNoseHingeAxisRAftZ} />
          <Slider label="Pivot Y"   value={nosePivotRAftY}     min={-1.5} max={0}   onChange={setNosePivotRAftY} />
          <Slider label="Pivot Z"   value={nosePivotRAftZ}     min={-0.6} max={0.8} onChange={setNosePivotRAftZ} />
        </div>

        {/* ── Compuertas principales ── */}
        <div style={{ borderTop: "1px solid rgba(173,191,214,0.1)", paddingTop: 6 }}>
          <div style={{ marginBottom: 4, color: "#4a7aaa" }}>Compuertas principales</div>
          <Slider label="Main L (X)" value={gearLDoorAngle} min={-PI} max={PI} onChange={setGearLDoorAngle} />
          <Slider label="Main R (X)" value={gearRDoorAngle} min={-PI} max={PI} onChange={setGearRDoorAngle} />
        </div>
      </div>

      <Canvas
        camera={{ position: [0, 5, 22], fov: 42 }}
        shadows={{ type: THREE.PCFShadowMap }}
      >
        <color attach="background" args={["#0b1016"]} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[8, 10, 6]} intensity={2.2} castShadow />
        <Environment preset="city" />

        <Suspense fallback={null}>
          <F18
            canopyOpen={canopyOpen}
            gearDown={gearT > 0.5}
            gearManual={gearT}
            hookDown={hookDown}
            noseDoorAngleL={noseDoorAngleL}
            noseHingeAxisLY={noseHingeAxisLY}
            noseHingeAxisLZ={noseHingeAxisLZ}
            nosePivotLY={nosePivotLY}
            nosePivotLZ={nosePivotLZ}
            noseDoorAngleRFwd={noseDoorAngleRFwd}
            nosePivotRFwdY={nosePivotRFwdY}
            nosePivotRFwdZ={nosePivotRFwdZ}
            noseDoorAngleRAft={noseDoorAngleRAft}
            noseHingeAxisRAftY={noseHingeAxisRAftY}
            noseHingeAxisRAftZ={noseHingeAxisRAftZ}
            nosePivotRAftY={nosePivotRAftY}
            nosePivotRAftZ={nosePivotRAftZ}
            gearLDoorAngle={gearLDoorAngle}
            gearRDoorAngle={gearRDoorAngle}
            position={[0, 0, 0]}
          />
        </Suspense>

        <Grid
          position={[0, -0.5, 0]}
          args={[60, 60]}
          cellColor="#1a2a3a"
          sectionColor="#2a4a6a"
          fadeDistance={50}
        />

        <OrbitControls target={[2.5, 0.5, 0]} />
      </Canvas>
    </main>
  );
}
