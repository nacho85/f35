"use client";

// Debug helper para tunear los spoilers (mismo patron que F14AIranDebugHinges).
// Expone:
//   - useSpoilersController(): hook con estado + handlers + `spoilers` array
//   - SpoilersDebugPanel: sliders xyz+angle por spoiler + pick mode

import { useState, useMemo } from "react";
import { SPOILER_DEFS } from "./utils";

const deg = d => d * Math.PI / 180;

// Defaults: pose FINAL (deploy=1). Cada slider multiplica por spoilerDeploy.
const SPOILER_DEFAULTS = () => [
  { x: 0.01, y: -0.09, z: 0.03, angle: deg(-56) },      // L
  { x: 0,    y:  0.06, z: 0.07, angle: deg(-56) },      // R
];

export function useSpoilersController(spoilerDeploy = 0) {
  const [spoilersTarget, setSpoilersTarget] = useState(SPOILER_DEFAULTS);
  const [pickSpoiler, setPickSpoiler] = useState(null);
  const [lastPick, setLastPick] = useState(null);

  const spoilers = useMemo(() => spoilersTarget.map((s, i) => {
    const t = SPOILER_DEFS[i]?.invertDeploy ? (1 - spoilerDeploy) : spoilerDeploy;
    return { x: s.x * t, y: s.y * t, z: s.z * t, angle: s.angle * t };
  }), [spoilersTarget, spoilerDeploy]);

  const updateSpoiler = (idx, key, val) => {
    setSpoilersTarget(s => s.map((h, i) => i === idx ? { ...h, [key]: val } : h));
  };
  const resetSpoilers = () => setSpoilersTarget(SPOILER_DEFAULTS());
  const handlePick = (info) => {
    if (info && info.point) {
      setLastPick(info.point);
      if (pickSpoiler != null) {
        console.log(`[pick] spoiler ${SPOILER_DEFS[pickSpoiler].side} target point:`, info.point);
      }
    }
  };

  return {
    spoilers,
    spoilersTarget, pickSpoiler, lastPick,
    updateSpoiler, resetSpoilers, setPickSpoiler, handlePick,
  };
}

export function SpoilersDebugPanel({
  spoilersTarget, pickSpoiler, lastPick,
  updateSpoiler, resetSpoilers, setPickSpoiler,
}) {
  return (
    <div style={{
      position: "absolute", zIndex: 10, bottom: 16, left: 16,
      padding: 14, borderRadius: 12, width: 320,
      background: "rgba(10,14,22,0.9)",
      border: "1px solid rgba(173,191,214,0.2)",
      fontFamily: "monospace", fontSize: 12,
      backdropFilter: "blur(10px)",
      maxHeight: "calc(100vh - 32px)", overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#a3e635" }}>SPOILERS</span>
        <button onClick={resetSpoilers} style={miniBtn}>reset</button>
      </div>

      <div style={{
        marginBottom: 10, padding: 8, borderRadius: 6,
        background: "rgba(30,40,55,0.6)",
        border: `1px solid ${pickSpoiler != null ? "#a3e635" : "rgba(173,191,214,0.15)"}`,
      }}>
        <div style={{ fontSize: 11, color: "#8fa4c0", marginBottom: 6 }}>
          PICK MODE — click en el modelo para capturar coord world
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {SPOILER_DEFS.map((def, i) => (
            <button key={def.side}
              onClick={() => setPickSpoiler(pickSpoiler === i ? null : i)}
              style={{
                padding: "3px 8px", borderRadius: 4,
                border: "1px solid rgba(173,191,214,0.25)",
                background: pickSpoiler === i ? "#a3e635" : "rgba(30,40,55,0.8)",
                color: pickSpoiler === i ? "#000" : "#bdd0ea",
                fontFamily: "monospace", fontSize: 11,
                fontWeight: pickSpoiler === i ? 700 : 400, cursor: "pointer",
              }}
            >S{def.side}</button>
          ))}
          <button onClick={() => setPickSpoiler(null)} style={miniBtn}>off</button>
        </div>
        {lastPick && (
          <div style={{ fontSize: 10, color: "#a3e635", wordBreak: "break-all" }}>
            [{lastPick.map(v => v.toFixed(5)).join(", ")}]
          </div>
        )}
      </div>

      {SPOILER_DEFS.map((def, i) => (
        <div key={def.side} style={{
          marginBottom: 10, padding: 8, borderRadius: 6,
          background: "rgba(30,40,55,0.6)",
          border: "1px solid rgba(173,191,214,0.15)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#a3e635", marginBottom: 4 }}>
            Spoiler {def.side}
          </div>
          {["x", "y", "z"].map(axis => (
            <div key={axis} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
              <span style={{ color: "#8fa4c0", width: 12 }}>{axis}</span>
              <input
                type="range" min={-1} max={1} step={0.01}
                value={spoilersTarget[i][axis]}
                onChange={e => updateSpoiler(i, axis, parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "#a3e635" }}
              />
              <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
                {spoilersTarget[i][axis].toFixed(2)}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, marginTop: 2 }}>
            <span style={{ color: "#f87171", width: 12 }}>°</span>
            <input
              type="range" min={-180} max={180} step={1}
              value={spoilersTarget[i].angle * 180 / Math.PI}
              onChange={e => updateSpoiler(i, "angle", parseFloat(e.target.value) * Math.PI / 180)}
              style={{ flex: 1, accentColor: "#f87171" }}
            />
            <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
              {Math.round(spoilersTarget[i].angle * 180 / Math.PI)}°
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
