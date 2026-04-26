"use client";

// Debug helper para tunear las 19 bisagras del tren de aterrizaje del F-14 v2.
// Expone:
//   - useHingesController(gearDown): hook con estado + handlers + `hinges` aplicado
//   - HingesDebugPanel: panel con sliders por bisagra + pick mode + check wheels
//
// Uso en F14AIranDebugScene:
//   const h = useHingesController(gearDown);
//   ...
//   onClickPart={info => { ...; h.handlePick(info); }}
//   hinges={h.hinges}
//   ...
//   {showPanel && <HingesDebugPanel {...h} />}

import { useState, useMemo } from "react";

const deg = d => d * Math.PI / 180;

export const HINGE_LABELS = [
  "NoseBayDoor_L",
  "NoseBayDoor_R",
  "NoseBayDoor_RearL",
  "NoseBayDoor_RearR",
  "NoseStrut FRONT (joint main)",
  "NoseStrut POSTERIOR (fuselaje)",
  "MainStrut_L",
  "MainStrut_R",
  "MainBayDoor_FrontL",
  "MainBayDoor_FrontR",
  "MainBayDoor_RearL",
  "MainBayDoor_RearR",
  "NoseGearLaunchBar",
  "MainWheel_L twist",
  "MainWheel_R twist",
  "MainStrutRotTop2_L",
  "MainStrutRotTop1_L",
  "MainStrutRotTop2_R",
  "MainStrutRotTop1_R",
];

export const HINGE_DEFAULTS = () => [
  { x: 0, y: 0, z: 0, angle: deg(90)  },         // 1
  { x: 0, y: 0, z: 0, angle: deg(-90) },         // 2
  { x: 0, y: 0, z: 0, angle: deg(90)  },         // 3
  { x: 0, y: 0, z: 0, angle: deg(90)  },         // 4
  { x: 0, y: -0.11, z: 0.03, angle: deg(70) },   // 5
  { x: 0, y: 0, z: 0, angle: deg(19) },          // 6
  { x: 0, y: 0, z: 0, angle: deg(88)  },         // 7
  { x: 0, y: 0, z: 0, angle: deg(88)  },         // 8
  { x: 0, y: 0, z: 0, angle: deg(90)  },         // 9
  { x: 0, y: 0, z: 0, angle: deg(-90) },         // 10
  { x: 0, y: 0, z: 0, angle: deg(90)  },         // 11
  { x: 0, y: 0, z: 0, angle: deg(-90) },         // 12
  { x: 0, y: 0, z: 0, angle: deg(-105) },        // 13
  { x: -0.08, y: 0.02, z: -0.06, angle: deg(-115) }, // 14
  { x:  0.08, y: 0.02, z: -0.06, angle: deg( 115) }, // 15
  { x: 0, y: 0, z: 0, angle: deg(-60) },         // 16
  { x: 0, y: 0, z: 0, angle: deg(180) },         // 17
  { x: 0, y: 0, z: 0, angle: deg(60) },          // 18
  { x: 0, y: 0, z: 0, angle: deg(-180) },        // 19
];

// Rango de gearDown donde cada bisagra se aplica (phase).
const PHASE_RANGES = [
  [0.00, 0.20], [0.00, 0.20],   // 1-2: nose bay doors grandes
  [0.20, 0.40], [0.20, 0.40],   // 3-4: nose bay doors chicas
  [0.40, 1.00], [0.40, 1.00],   // 5-6: nose struts
  [0.40, 1.00], [0.40, 1.00],   // 7-8: main struts
  [0.00, 0.30], [0.00, 0.30],   // 9-10: main doors Front
  [0.00, 0.30], [0.00, 0.30],   // 11-12: main doors Rear
  [0.40, 1.00],                 // 13: launch bar
  [0.40, 0.50], [0.40, 0.50],   // 14-15: main wheel twist
  [0.40, 1.00],                 // 16
  [0.40, 1.00],                 // 17
  [0.40, 1.00],                 // 18
  [0.40, 1.00],                 // 19
];

export function useHingesController(gearDown) {
  const [hingesTarget, setHingesTarget] = useState(HINGE_DEFAULTS);
  const [pickHinge, setPickHinge] = useState(null);
  const [lastPick, setLastPick] = useState(null);

  // Valores aplicados al modelo: target * phase(gearDown) por bisagra.
  const hinges = useMemo(() => {
    const phase = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
    return hingesTarget.map((h, i) => {
      const p = phase(gearDown, PHASE_RANGES[i][0], PHASE_RANGES[i][1]);
      return { x: h.x * p, y: h.y * p, z: h.z * p, angle: h.angle * p };
    });
  }, [hingesTarget, gearDown]);

  const updateHinge = (idx, key, val) => {
    setHingesTarget(hs => hs.map((h, i) => i === idx ? { ...h, [key]: val } : h));
  };
  const resetHinges = () => setHingesTarget(HINGE_DEFAULTS());
  // Handler para onClickPart de F14AIran: si hay modo pick activo, captura la coord
  const handlePick = (info) => {
    if (info && info.point) {
      setLastPick(info.point);
      if (pickHinge != null) {
        console.log(`[pick] hinge ${pickHinge + 1} target point:`, info.point);
      }
    }
  };
  // Dispara el check de nivel de ruedas via custom event (F14AIran lo escucha)
  const checkWheels = () => window.dispatchEvent(new Event("f14airan-check-wheels"));

  return {
    hinges, hingesTarget, pickHinge, lastPick,
    updateHinge, resetHinges, setPickHinge, handlePick, checkWheels,
  };
}

export function HingesDebugPanel({
  hingesTarget, pickHinge, lastPick,
  updateHinge, resetHinges, setPickHinge, checkWheels,
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
        <span style={{ fontSize: 13, fontWeight: 600, color: "#ffff00" }}>BISAGRAS NOSE + MAIN GEAR</span>
        <button onClick={checkWheels} style={miniBtn}>check wheels</button>
        <button onClick={resetHinges} style={miniBtn}>reset</button>
      </div>

      {/* Panel de pick */}
      <div style={{
        marginBottom: 10, padding: 8, borderRadius: 6,
        background: "rgba(30,40,55,0.6)",
        border: `1px solid ${pickHinge != null ? "#ffff00" : "rgba(173,191,214,0.15)"}`,
      }}>
        <div style={{ fontSize: 11, color: "#8fa4c0", marginBottom: 6 }}>
          PICK MODE — click en el modelo para capturar coord world
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {hingesTarget.map((_, i) => (
            <button key={i}
              onClick={() => setPickHinge(pickHinge === i ? null : i)}
              style={{
                padding: "3px 8px", borderRadius: 4,
                border: "1px solid rgba(173,191,214,0.25)",
                background: pickHinge === i ? "#ffff00" : "rgba(30,40,55,0.8)",
                color: pickHinge === i ? "#000" : "#bdd0ea",
                fontFamily: "monospace", fontSize: 11,
                fontWeight: pickHinge === i ? 700 : 400, cursor: "pointer",
              }}
            >H{i + 1}</button>
          ))}
          <button onClick={() => setPickHinge(null)} style={miniBtn}>off</button>
        </div>
        {lastPick && (
          <div style={{ fontSize: 10, color: "#ffff00", wordBreak: "break-all" }}>
            [{lastPick.map(v => v.toFixed(3)).join(", ")}]
          </div>
        )}
      </div>

      {HINGE_LABELS.map((label, i) => (
        <div key={i} style={{
          marginBottom: 10, padding: 8, borderRadius: 6,
          background: "rgba(30,40,55,0.6)",
          border: "1px solid rgba(173,191,214,0.15)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#ffff00", marginBottom: 4 }}>
            {i + 1}. {label}
          </div>
          {["x", "y", "z"].map(axis => (
            <div key={axis} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
              <span style={{ color: "#8fa4c0", width: 12 }}>{axis}</span>
              <input
                type="range" min={-1} max={1} step={0.01}
                value={hingesTarget[i][axis]}
                onChange={e => updateHinge(i, axis, parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "#ffff00" }}
              />
              <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
                {hingesTarget[i][axis].toFixed(2)}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, marginTop: 2 }}>
            <span style={{ color: "#f87171", width: 12 }}>°</span>
            <input
              type="range" min={-180} max={180} step={1}
              value={hingesTarget[i].angle * 180 / Math.PI}
              onChange={e => updateHinge(i, "angle", parseFloat(e.target.value) * Math.PI / 180)}
              style={{ flex: 1, accentColor: "#f87171" }}
            />
            <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
              {Math.round(hingesTarget[i].angle * 180 / Math.PI)}°
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
