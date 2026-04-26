"use client";

// Debug helper para tunear los flaps (mismo patron que spoilers).

import { useState, useMemo } from "react";
import { FLAP_DEFS } from "./utils";

const deg = d => d * Math.PI / 180;

// Defaults: pose FINAL (deploy=1). Cada slider multiplica por flapDeploy.
// Rango real F-14: 0° cruise → 35° full down landing.
const FLAP_DEFAULTS = () => FLAP_DEFS.map(() => ({ x: 0, y: 0, z: 0, angle: deg(35) }));

export function useFlapsController(flapDeploy = 0) {
  const [flapsTarget, setFlapsTarget] = useState(FLAP_DEFAULTS);
  const [pickFlap, setPickFlap] = useState(null);
  const [lastPick, setLastPick] = useState(null);

  const flaps = useMemo(() => flapsTarget.map((s, i) => {
    const t = FLAP_DEFS[i]?.invertDeploy ? (1 - flapDeploy) : flapDeploy;
    return { x: s.x * t, y: s.y * t, z: s.z * t, angle: s.angle * t };
  }), [flapsTarget, flapDeploy]);

  const updateFlap = (idx, key, val) => {
    setFlapsTarget(s => s.map((h, i) => i === idx ? { ...h, [key]: val } : h));
  };
  const resetFlaps = () => setFlapsTarget(FLAP_DEFAULTS());
  const handlePick = (info) => {
    if (info && info.point) {
      setLastPick(info.point);
      if (pickFlap != null) {
        console.log(`[pick] flap ${FLAP_DEFS[pickFlap].side} target point:`, info.point);
      }
    }
  };

  return {
    flaps,
    flapsTarget, pickFlap, lastPick,
    updateFlap, resetFlaps, setPickFlap, handlePick,
  };
}

export function FlapsDebugPanel({
  flapsTarget, pickFlap, lastPick,
  updateFlap, resetFlaps, setPickFlap,
}) {
  return (
    <div style={{
      position: "absolute", zIndex: 10, bottom: 16, left: 360,
      padding: 14, borderRadius: 12, width: 320,
      background: "rgba(10,14,22,0.9)",
      border: "1px solid rgba(173,191,214,0.2)",
      fontFamily: "monospace", fontSize: 12,
      backdropFilter: "blur(10px)",
      maxHeight: "calc(100vh - 32px)", overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#22d3ee" }}>FLAPS</span>
        <button onClick={resetFlaps} style={miniBtn}>reset</button>
      </div>

      <div style={{
        marginBottom: 10, padding: 8, borderRadius: 6,
        background: "rgba(30,40,55,0.6)",
        border: `1px solid ${pickFlap != null ? "#22d3ee" : "rgba(173,191,214,0.15)"}`,
      }}>
        <div style={{ fontSize: 11, color: "#8fa4c0", marginBottom: 6 }}>
          PICK MODE — click en el modelo para capturar coord world
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {FLAP_DEFS.map((def, i) => (
            <button key={def.side}
              onClick={() => setPickFlap(pickFlap === i ? null : i)}
              style={{
                padding: "3px 8px", borderRadius: 4,
                border: "1px solid rgba(173,191,214,0.25)",
                background: pickFlap === i ? "#22d3ee" : "rgba(30,40,55,0.8)",
                color: pickFlap === i ? "#000" : "#bdd0ea",
                fontFamily: "monospace", fontSize: 11,
                fontWeight: pickFlap === i ? 700 : 400, cursor: "pointer",
              }}
            >F{def.side}</button>
          ))}
          <button onClick={() => setPickFlap(null)} style={miniBtn}>off</button>
        </div>
        {lastPick && (
          <div style={{ fontSize: 10, color: "#22d3ee", wordBreak: "break-all" }}>
            [{lastPick.map(v => v.toFixed(5)).join(", ")}]
          </div>
        )}
      </div>

      {FLAP_DEFS.map((def, i) => (
        <div key={def.side} style={{
          marginBottom: 10, padding: 8, borderRadius: 6,
          background: "rgba(30,40,55,0.6)",
          border: "1px solid rgba(173,191,214,0.15)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#22d3ee", marginBottom: 4 }}>
            Flap {def.side}
          </div>
          {["x", "y", "z"].map(axis => (
            <div key={axis} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
              <span style={{ color: "#8fa4c0", width: 12 }}>{axis}</span>
              <input
                type="range" min={-1} max={1} step={0.01}
                value={flapsTarget[i][axis]}
                onChange={e => updateFlap(i, axis, parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "#22d3ee" }}
              />
              <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
                {flapsTarget[i][axis].toFixed(2)}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, marginTop: 2 }}>
            <span style={{ color: "#f87171", width: 12 }}>°</span>
            <input
              type="range" min={-180} max={180} step={1}
              value={flapsTarget[i].angle * 180 / Math.PI}
              onChange={e => updateFlap(i, "angle", parseFloat(e.target.value) * Math.PI / 180)}
              style={{ flex: 1, accentColor: "#f87171" }}
            />
            <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
              {Math.round(flapsTarget[i].angle * 180 / Math.PI)}°
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const miniBtn = {
  padding: "3px 8px", borderRadius: 4,
  border: "1px solid rgba(173,191,214,0.25)",
  background: "rgba(30,40,55,0.8)", color: "#bdd0ea",
  fontFamily: "monospace", fontSize: 11, cursor: "pointer",
};
