"use client";

// Debug helper para los rudders. F-14 real: deflexion ~30°.

import { useState, useMemo } from "react";
import { RUDDER_DEFS } from "./utils";

const deg = d => d * Math.PI / 180;

const RUDDER_DEFAULTS = () => RUDDER_DEFS.map(() => ({ x: 0, y: 0, z: 0, angle: deg(30) }));

export function useRuddersController(rudderDeploy = 0) {
  const [ruddersTarget, setRuddersTarget] = useState(RUDDER_DEFAULTS);
  const [pickRudder, setPickRudder] = useState(null);
  const [lastPick, setLastPick] = useState(null);

  const rudders = useMemo(() => ruddersTarget.map((s, i) => {
    const t = RUDDER_DEFS[i]?.invertDeploy ? (1 - rudderDeploy) : rudderDeploy;
    return { x: s.x * t, y: s.y * t, z: s.z * t, angle: s.angle * t };
  }), [ruddersTarget, rudderDeploy]);

  const updateRudder = (idx, key, val) => {
    setRuddersTarget(s => s.map((h, i) => i === idx ? { ...h, [key]: val } : h));
  };
  const resetRudders = () => setRuddersTarget(RUDDER_DEFAULTS());
  const handlePick = (info) => {
    if (info && info.point) {
      setLastPick(info.point);
      if (pickRudder != null) {
        console.log(`[pick] rudder ${RUDDER_DEFS[pickRudder].side} target point:`, info.point);
      }
    }
  };

  return {
    rudders,
    ruddersTarget, pickRudder, lastPick,
    updateRudder, resetRudders, setPickRudder, handlePick,
  };
}

export function RuddersDebugPanel({
  ruddersTarget, pickRudder, lastPick,
  updateRudder, resetRudders, setPickRudder,
}) {
  return (
    <div style={{
      position: "absolute", zIndex: 10, bottom: 16, right: 360,
      padding: 14, borderRadius: 12, width: 320,
      background: "rgba(10,14,22,0.9)",
      border: "1px solid rgba(173,191,214,0.2)",
      fontFamily: "monospace", fontSize: 12,
      backdropFilter: "blur(10px)",
      maxHeight: "calc(100vh - 32px)", overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#e879f9" }}>RUDDERS</span>
        <button onClick={resetRudders} style={miniBtn}>reset</button>
      </div>

      <div style={{
        marginBottom: 10, padding: 8, borderRadius: 6,
        background: "rgba(30,40,55,0.6)",
        border: `1px solid ${pickRudder != null ? "#e879f9" : "rgba(173,191,214,0.15)"}`,
      }}>
        <div style={{ fontSize: 11, color: "#8fa4c0", marginBottom: 6 }}>
          PICK MODE — click en el modelo para capturar coord world
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {RUDDER_DEFS.map((def, i) => (
            <button key={def.side}
              onClick={() => setPickRudder(pickRudder === i ? null : i)}
              style={{
                padding: "3px 8px", borderRadius: 4,
                border: "1px solid rgba(173,191,214,0.25)",
                background: pickRudder === i ? "#e879f9" : "rgba(30,40,55,0.8)",
                color: pickRudder === i ? "#000" : "#bdd0ea",
                fontFamily: "monospace", fontSize: 11,
                fontWeight: pickRudder === i ? 700 : 400, cursor: "pointer",
              }}
            >R{def.side}</button>
          ))}
          <button onClick={() => setPickRudder(null)} style={miniBtn}>off</button>
        </div>
        {lastPick && (
          <div style={{ fontSize: 10, color: "#e879f9", wordBreak: "break-all" }}>
            [{lastPick.map(v => v.toFixed(5)).join(", ")}]
          </div>
        )}
      </div>

      {RUDDER_DEFS.map((def, i) => (
        <div key={def.side} style={{
          marginBottom: 10, padding: 8, borderRadius: 6,
          background: "rgba(30,40,55,0.6)",
          border: "1px solid rgba(173,191,214,0.15)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#e879f9", marginBottom: 4 }}>
            Rudder {def.side}
          </div>
          {["x", "y", "z"].map(axis => (
            <div key={axis} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
              <span style={{ color: "#8fa4c0", width: 12 }}>{axis}</span>
              <input
                type="range" min={-1} max={1} step={0.01}
                value={ruddersTarget[i][axis]}
                onChange={e => updateRudder(i, axis, parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "#e879f9" }}
              />
              <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
                {ruddersTarget[i][axis].toFixed(2)}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, marginTop: 2 }}>
            <span style={{ color: "#f87171", width: 12 }}>°</span>
            <input
              type="range" min={-180} max={180} step={1}
              value={ruddersTarget[i].angle * 180 / Math.PI}
              onChange={e => updateRudder(i, "angle", parseFloat(e.target.value) * Math.PI / 180)}
              style={{ flex: 1, accentColor: "#f87171" }}
            />
            <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
              {Math.round(ruddersTarget[i].angle * 180 / Math.PI)}°
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
