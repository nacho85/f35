"use client";

// Debug helper para los HStabs (stabilator). Pitch ±20°.

import { useState, useMemo } from "react";
import { HSTAB_DEFS } from "./utils";

const deg = d => d * Math.PI / 180;

const HSTAB_DEFAULTS = () => HSTAB_DEFS.map(() => ({ x: 0, y: 0, z: 0, angle: deg(20) }));

export function useHStabsController(hstabDeploy = 0) {
  const [hstabsTarget, setHStabsTarget] = useState(HSTAB_DEFAULTS);
  const [pickHStab, setPickHStab] = useState(null);
  const [lastPick, setLastPick] = useState(null);

  const hstabs = useMemo(() => hstabsTarget.map((s, i) => {
    const t = HSTAB_DEFS[i]?.invertDeploy ? (1 - hstabDeploy) : hstabDeploy;
    return { x: s.x * t, y: s.y * t, z: s.z * t, angle: s.angle * t };
  }), [hstabsTarget, hstabDeploy]);

  const updateHStab = (idx, key, val) => {
    setHStabsTarget(s => s.map((h, i) => i === idx ? { ...h, [key]: val } : h));
  };
  const resetHStabs = () => setHStabsTarget(HSTAB_DEFAULTS());
  const handlePick = (info) => {
    if (info && info.point) {
      setLastPick(info.point);
      if (pickHStab != null) {
        console.log(`[pick] hstab ${HSTAB_DEFS[pickHStab].side} target point:`, info.point);
      }
    }
  };

  return {
    hstabs,
    hstabsTarget, pickHStab, lastPick,
    updateHStab, resetHStabs, setPickHStab, handlePick,
  };
}

export function HStabsDebugPanel({
  hstabsTarget, pickHStab, lastPick,
  updateHStab, resetHStabs, setPickHStab,
}) {
  return (
    <div style={{
      position: "absolute", zIndex: 10, bottom: 16, right: 16,
      padding: 14, borderRadius: 12, width: 320,
      background: "rgba(10,14,22,0.9)",
      border: "1px solid rgba(173,191,214,0.2)",
      fontFamily: "monospace", fontSize: 12,
      backdropFilter: "blur(10px)",
      maxHeight: "calc(100vh - 32px)", overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#ef4444" }}>HSTABS</span>
        <button onClick={resetHStabs} style={miniBtn}>reset</button>
      </div>

      <div style={{
        marginBottom: 10, padding: 8, borderRadius: 6,
        background: "rgba(30,40,55,0.6)",
        border: `1px solid ${pickHStab != null ? "#ef4444" : "rgba(173,191,214,0.15)"}`,
      }}>
        <div style={{ fontSize: 11, color: "#8fa4c0", marginBottom: 6 }}>
          PICK MODE — click en el modelo para capturar coord world
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {HSTAB_DEFS.map((def, i) => (
            <button key={def.side}
              onClick={() => setPickHStab(pickHStab === i ? null : i)}
              style={{
                padding: "3px 8px", borderRadius: 4,
                border: "1px solid rgba(173,191,214,0.25)",
                background: pickHStab === i ? "#ef4444" : "rgba(30,40,55,0.8)",
                color: pickHStab === i ? "#000" : "#bdd0ea",
                fontFamily: "monospace", fontSize: 11,
                fontWeight: pickHStab === i ? 700 : 400, cursor: "pointer",
              }}
            >H{def.side}</button>
          ))}
          <button onClick={() => setPickHStab(null)} style={miniBtn}>off</button>
        </div>
        {lastPick && (
          <div style={{ fontSize: 10, color: "#ef4444", wordBreak: "break-all" }}>
            [{lastPick.map(v => v.toFixed(5)).join(", ")}]
          </div>
        )}
      </div>

      {HSTAB_DEFS.map((def, i) => (
        <div key={def.side} style={{
          marginBottom: 10, padding: 8, borderRadius: 6,
          background: "rgba(30,40,55,0.6)",
          border: "1px solid rgba(173,191,214,0.15)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>
            HStab {def.side}
          </div>
          {["x", "y", "z"].map(axis => (
            <div key={axis} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
              <span style={{ color: "#8fa4c0", width: 12 }}>{axis}</span>
              <input
                type="range" min={-1} max={1} step={0.01}
                value={hstabsTarget[i][axis]}
                onChange={e => updateHStab(i, axis, parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "#ef4444" }}
              />
              <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
                {hstabsTarget[i][axis].toFixed(2)}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, marginTop: 2 }}>
            <span style={{ color: "#f87171", width: 12 }}>°</span>
            <input
              type="range" min={-180} max={180} step={1}
              value={hstabsTarget[i].angle * 180 / Math.PI}
              onChange={e => updateHStab(i, "angle", parseFloat(e.target.value) * Math.PI / 180)}
              style={{ flex: 1, accentColor: "#f87171" }}
            />
            <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
              {Math.round(hstabsTarget[i].angle * 180 / Math.PI)}°
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
