"use client";

import { Suspense, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import F18NoseRig from "./F18NoseRig";

const PI = Math.PI;

const btn = (active, color = "#6ab0ff") => ({
  padding: "4px 10px", borderRadius: 5, cursor: "pointer",
  fontFamily: "monospace", fontSize: 11,
  border: `1px solid ${active ? color : "rgba(173,191,214,0.3)"}`,
  background: active ? `${color}33` : "rgba(6,10,18,0.76)",
  color: active ? "#eef4ff" : "#7a9ec4",
});

const Slider = ({ label, value, min, max, step = 0.001, onChange }) => (
  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
    <span style={{ width: 64, flexShrink: 0, fontSize: 11 }}>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{ width: 110, accentColor: "#6ab0ff" }} />
    <span style={{ width: 48, textAlign: "right", fontSize: 11 }}>{value.toFixed(3)}</span>
  </div>
);

function fmtPt(p) {
  if (!p) return "—";
  return `(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`;
}

function computeBisagra(p1, p2) {
  if (!p1 || !p2) return null;
  const axis = new THREE.Vector3().subVectors(p2, p1).normalize();
  return { pivot: p1.clone(), axis };
}

// ── Estado por compuerta ──────────────────────────────────────────────────────
function useDoor(defaultPY, defaultPZ) {
  const [angle,  setAngle]  = useState(0);
  const [pivotY, setPivotY] = useState(defaultPY);
  const [pivotZ, setPivotZ] = useState(defaultPZ);
  const [axisY,  setAxisY]  = useState(0);
  const [axisZ,  setAxisZ]  = useState(0);
  const [p1, setP1] = useState(null);
  const [p2, setP2] = useState(null);

  const bisagra = computeBisagra(p1, p2);

  // Si bisagra definida, sobreescribe sliders
  const finalPivotX = bisagra ? bisagra.pivot.x : 0;
  const finalPivotY = bisagra ? bisagra.pivot.y : pivotY;
  const finalPivotZ = bisagra ? bisagra.pivot.z : pivotZ;
  const finalAxisX  = bisagra ? bisagra.axis.x  : 1;
  const finalAxisY  = bisagra ? bisagra.axis.y  : axisY;
  const finalAxisZ  = bisagra ? bisagra.axis.z  : axisZ;

  return {
    angle, setAngle,
    pivotY, setPivotY, pivotZ, setPivotZ,
    axisY, setAxisY, axisZ, setAxisZ,
    p1, setP1, p2, setP2,
    bisagra,
    finalPivotX, finalPivotY, finalPivotZ,
    finalAxisX,  finalAxisY,  finalAxisZ,
  };
}

// ── Panel de una compuerta ────────────────────────────────────────────────────
function DoorPanel({ label, color, door, marking, onMark, onClear }) {
  const isMarking = marking !== null;
  const step      = marking === 0 ? "Click P1 en la bisagra" : "Click P2 en la bisagra";

  return (
    <div style={{ borderTop: "1px solid rgba(173,191,214,0.1)", paddingTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color }}>{label}</span>
        <div style={{ display: "flex", gap: 4 }}>
          {!isMarking && (
            <button style={btn(false, color)} onClick={onMark}>
              Marcar bisagra
            </button>
          )}
          {(door.p1 || door.p2) && (
            <button style={btn(false, "#888")} onClick={onClear}>✕</button>
          )}
        </div>
      </div>

      {isMarking && (
        <div style={{ color: "#ffcc44", fontSize: 11, marginBottom: 4 }}>
          ▶ {step}
        </div>
      )}

      {(door.p1 || door.p2) && (
        <div style={{ fontSize: 10, color: "#4a7a9a", marginBottom: 4 }}>
          <div>P1: {fmtPt(door.p1)}</div>
          <div>P2: {fmtPt(door.p2)}</div>
          {door.bisagra && (
            <div style={{ color: "#6ab0ff" }}>
              eje: ({door.bisagra.axis.x.toFixed(3)}, {door.bisagra.axis.y.toFixed(3)}, {door.bisagra.axis.z.toFixed(3)})
            </div>
          )}
        </div>
      )}

      <Slider label="Ángulo" value={door.angle} min={-PI} max={PI} onChange={door.setAngle} />

      {!door.bisagra && (
        <>
          <Slider label="Pivot Y" value={door.pivotY} min={-1.5} max={0.5}  onChange={door.setPivotY} />
          <Slider label="Pivot Z" value={door.pivotZ} min={-0.8} max={0.8}  onChange={door.setPivotZ} />
          <Slider label="Eje X"   value={door.axisY}  min={-1}   max={1}    onChange={door.setAxisY} />
          <Slider label="Eje Y"   value={door.axisZ}  min={-1}   max={1}    onChange={door.setAxisZ} />
        </>
      )}
    </div>
  );
}

// ── Escena principal ──────────────────────────────────────────────────────────
export default function F18NoseRigTestScene() {
  const [canopyOpen, setCanopyOpen] = useState(false);
  const [hookDown,   setHookDown]   = useState(false);

  const doorL    = useDoor(-0.52,  -0.33);
  const doorRFwd = useDoor(-0.522,  0.325);
  const doorRAft = useDoor(-0.52,   0.12);

  // marking: { door: 'L'|'RFwd'|'RAft', step: 0|1 } | null
  const [marking, setMarking] = useState(null);

  const startMark = (door) => setMarking({ door, step: 0 });

  const clearDoor = (door) => {
    const d = door === 'L' ? doorL : door === 'RFwd' ? doorRFwd : doorRAft;
    d.setP1(null); d.setP2(null);
  };

  const handleMeshClick = useCallback((point) => {
    if (!marking) return;
    const d = marking.door === 'L' ? doorL : marking.door === 'RFwd' ? doorRFwd : doorRAft;
    if (marking.step === 0) {
      d.setP1(point);
      setMarking({ door: marking.door, step: 1 });
    } else {
      d.setP2(point);
      setMarking(null);
    }
  }, [marking, doorL, doorRFwd, doorRAft]);

  return (
    <main style={{ width: "100vw", height: "100vh", background: "#0b1016" }}>
      <div style={{
        position: "absolute", zIndex: 10, top: 16, left: 16,
        display: "flex", flexDirection: "column", gap: 5,
        padding: "10px 14px", borderRadius: 8,
        background: "rgba(6,10,18,0.85)", border: "1px solid rgba(173,191,214,0.16)",
        color: "#7a9ec4", fontFamily: "monospace", fontSize: 12,
        backdropFilter: "blur(12px)", maxHeight: "96vh", overflowY: "auto",
      }}>
        <div>F/A-18 · Nose Doors Rig</div>

        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span>Canopy:</span>
          <button style={btn(!canopyOpen)} onClick={() => setCanopyOpen(false)}>Cerrado</button>
          <button style={btn(canopyOpen)}  onClick={() => setCanopyOpen(true)}>Abierto</button>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span>Hook:</span>
          <button style={btn(!hookDown)} onClick={() => setHookDown(false)}>Up</button>
          <button style={btn(hookDown)}  onClick={() => setHookDown(true)}>Down</button>
        </div>

        <DoorPanel label="Compuerta L (roja)"         color="#ff4444" door={doorL}
          marking={marking?.door === 'L'    ? marking.step : null}
          onMark={() => startMark('L')}    onClear={() => clearDoor('L')} />

        <DoorPanel label="Compuerta R Fwd (naranja)"  color="#ff6600" door={doorRFwd}
          marking={marking?.door === 'RFwd' ? marking.step : null}
          onMark={() => startMark('RFwd')} onClear={() => clearDoor('RFwd')} />

        <DoorPanel label="Compuerta R Aft (naranja claro)" color="#ff9900" door={doorRAft}
          marking={marking?.door === 'RAft' ? marking.step : null}
          onMark={() => startMark('RAft')} onClear={() => clearDoor('RAft')} />
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
          <F18NoseRig
            noseAngleL={doorL.angle}
            noseAngleRFwd={doorRFwd.angle}
            noseAngleRAft={doorRAft.angle}

            nosePivotLX={doorL.finalPivotX}    nosePivotLY={doorL.finalPivotY}    nosePivotLZ={doorL.finalPivotZ}
            noseAxisLX={doorL.finalAxisX}      noseAxisLY={doorL.finalAxisY}      noseAxisLZ={doorL.finalAxisZ}

            nosePivotRFwdX={doorRFwd.finalPivotX} nosePivotRFwdY={doorRFwd.finalPivotY} nosePivotRFwdZ={doorRFwd.finalPivotZ}
            noseAxisRFwdX={doorRFwd.finalAxisX}   noseAxisRFwdY={doorRFwd.finalAxisY}   noseAxisRFwdZ={doorRFwd.finalAxisZ}

            nosePivotRAftX={doorRAft.finalPivotX} nosePivotRAftY={doorRAft.finalPivotY} nosePivotRAftZ={doorRAft.finalPivotZ}
            noseAxisRAftX={doorRAft.finalAxisX}   noseAxisRAftY={doorRAft.finalAxisY}   noseAxisRAftZ={doorRAft.finalAxisZ}

            canopyOpen={canopyOpen}
            hookDown={hookDown}
            onMeshClick={marking ? handleMeshClick : null}
          />
        </Suspense>

        <Grid position={[0, -0.5, 0]} args={[60, 60]}
          cellColor="#1a2a3a" sectionColor="#2a4a6a" fadeDistance={50} />

        <OrbitControls target={[2.5, 0.5, 0]} makeDefault />
      </Canvas>
    </main>
  );
}
