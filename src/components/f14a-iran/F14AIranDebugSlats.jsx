"use client";

// Debug helper para tunear los slats (mismo patron que flaps/spoilers).
// Rango real F-14: 0° → 17° down landing.

import { useState, useMemo } from "react";
import { SLAT_DEFS } from "./utils";

const deg = d => d * Math.PI / 180;

const SLAT_DEFAULTS = () => [
  { x: 0.05, y: -0.17, z: 0, angle: deg(-17) },   // L
  { x: -0.05,    y: -0.17,    z: 0, angle: deg(17) },   // R pendiente
];

export function useSlatsController(slatDeploy = 0) {
  const [slatsTarget, setSlatsTarget] = useState(SLAT_DEFAULTS);
  const [pickSlat, setPickSlat] = useState(null);
  const [lastPick, setLastPick] = useState(null);

  const slats = useMemo(() => slatsTarget.map((s, i) => {
    const t = SLAT_DEFS[i]?.invertDeploy ? (1 - slatDeploy) : slatDeploy;
    return { x: s.x * t, y: s.y * t, z: s.z * t, angle: s.angle * t };
  }), [slatsTarget, slatDeploy]);

  const updateSlat = (idx, key, val) => {
    setSlatsTarget(s => s.map((h, i) => i === idx ? { ...h, [key]: val } : h));
  };
  const resetSlats = () => setSlatsTarget(SLAT_DEFAULTS());
  const handlePick = (info) => {
    if (info && info.point) {
      setLastPick(info.point);
      if (pickSlat != null) {
        console.log(`[pick] slat ${SLAT_DEFS[pickSlat].side} target point:`, info.point);
      }
    }
  };

  return {
    slats,
    slatsTarget, pickSlat, lastPick,
    updateSlat, resetSlats, setPickSlat, handlePick,
  };
}

export function SlatsDebugPanel({
  slatsTarget, pickSlat, lastPick,
  updateSlat, resetSlats, setPickSlat,
}) {
  return (
    <div style={{
      position: "absolute", zIndex: 10, bottom: 16, left: 700,
      padding: 14, borderRadius: 12, width: 320,
      background: "rgba(10,14,22,0.9)",
      border: "1px solid rgba(173,191,214,0.2)",
      fontFamily: "monospace", fontSize: 12,
      backdropFilter: "blur(10px)",
      maxHeight: "calc(100vh - 32px)", overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#fb923c" }}>SLATS</span>
        <button onClick={resetSlats} style={miniBtn}>reset</button>
      </div>

      <div style={{
        marginBottom: 10, padding: 8, borderRadius: 6,
        background: "rgba(30,40,55,0.6)",
        border: `1px solid ${pickSlat != null ? "#fb923c" : "rgba(173,191,214,0.15)"}`,
      }}>
        <div style={{ fontSize: 11, color: "#8fa4c0", marginBottom: 6 }}>
          PICK MODE — click en el modelo para capturar coord world
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {SLAT_DEFS.map((def, i) => (
            <button key={def.side}
              onClick={() => setPickSlat(pickSlat === i ? null : i)}
              style={{
                padding: "3px 8px", borderRadius: 4,
                border: "1px solid rgba(173,191,214,0.25)",
                background: pickSlat === i ? "#fb923c" : "rgba(30,40,55,0.8)",
                color: pickSlat === i ? "#000" : "#bdd0ea",
                fontFamily: "monospace", fontSize: 11,
                fontWeight: pickSlat === i ? 700 : 400, cursor: "pointer",
              }}
            >L{def.side}</button>
          ))}
          <button onClick={() => setPickSlat(null)} style={miniBtn}>off</button>
        </div>
        {lastPick && (
          <div style={{ fontSize: 10, color: "#fb923c", wordBreak: "break-all" }}>
            [{lastPick.map(v => v.toFixed(5)).join(", ")}]
          </div>
        )}
      </div>

      {SLAT_DEFS.map((def, i) => (
        <div key={def.side} style={{
          marginBottom: 10, padding: 8, borderRadius: 6,
          background: "rgba(30,40,55,0.6)",
          border: "1px solid rgba(173,191,214,0.15)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#fb923c", marginBottom: 4 }}>
            Slat {def.side}
          </div>
          {["x", "y", "z"].map(axis => (
            <div key={axis} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
              <span style={{ color: "#8fa4c0", width: 12 }}>{axis}</span>
              <input
                type="range" min={-1} max={1} step={0.01}
                value={slatsTarget[i][axis]}
                onChange={e => updateSlat(i, axis, parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "#fb923c" }}
              />
              <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
                {slatsTarget[i][axis].toFixed(2)}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, marginTop: 2 }}>
            <span style={{ color: "#f87171", width: 12 }}>°</span>
            <input
              type="range" min={-180} max={180} step={1}
              value={slatsTarget[i].angle * 180 / Math.PI}
              onChange={e => updateSlat(i, "angle", parseFloat(e.target.value) * Math.PI / 180)}
              style={{ flex: 1, accentColor: "#f87171" }}
            />
            <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
              {Math.round(slatsTarget[i].angle * 180 / Math.PI)}°
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
