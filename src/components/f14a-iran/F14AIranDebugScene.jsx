"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import F14AIran from "./F14AIran";
import F14Raw from "./F14Raw";
import { useHingesController, HingesDebugPanel } from "./F14AIranDebugHinges";
import { useSpoilersController, SpoilersDebugPanel } from "./F14AIranDebugSpoilers";
import { useFlapsController,    FlapsDebugPanel    } from "./F14AIranDebugFlaps";
import { useSlatsController,    SlatsDebugPanel    } from "./F14AIranDebugSlats";
import { useRuddersController,  RuddersDebugPanel  } from "./F14AIranDebugRudders";
import { useHStabsController,   HStabsDebugPanel   } from "./F14AIranDebugHStabs";

// W acelera, S frena, sin tecla → desacelera. Mismo patron que F35CTestScene.
function TaxiSimulator({ keysRef, taxiSpeedRef }) {
  useFrame((_s, delta) => {
    const keys = keysRef.current;
    const accel = keys.has("KeyW") || keys.has("ArrowUp")   ? 1 : 0;
    const brake = keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0;
    const cur    = taxiSpeedRef.current;
    const target = accel ? 25 : brake ? 0 : 0;
    const k      = accel ? 0.8 : brake ? 4.0 : 0.5;
    taxiSpeedRef.current = cur + (target - cur) * (1 - Math.exp(-k * delta));
    if (taxiSpeedRef.current < 0.05) taxiSpeedRef.current = 0;
  });
  return null;
}

const V6_GROUPS = [
  "NoseCone", "CockpitFrame", "CockpitInterior",
  "Fuselage_Fwd", "Fuselage_Center", "Fuselage_Aft",
  "Glove_L", "Glove_R",
  "Nacelle_L", "Nacelle_R",
  "Wing_L", "Wing_R",
  "VStab_L", "VStab_R", "Rudder_L", "Rudder_R",
  "HStab_L", "HStab_R",
  "Flap_L", "Flap_R", "Slat_L", "Slat_R", "Spoiler_L", "Spoiler_R",
  "Canopy",
  "NoseGearStrut", "NoseGearWheel", "NoseGearBayDoor_L", "NoseGearBayDoor_R",
  "MainGearStrut_L", "MainGearStrut_R", "MainGearWheel_L", "MainGearWheel_R",
  "MainGearBayDoor_L", "MainGearBayDoor_R",
  "TailHook", "RefuelProbe", "Nozzle_L", "Nozzle_R",
  "AirbrakeUpper", "AirbrakeLower",
  "Pylon_L", "Pylon_R", "FuelTank_L", "FuelTank_R", "Missile_L", "Missile_R",
  "Unlabeled",
];

const GROUP_COLORS = {
  NoseCone: "#3b82f6", CockpitFrame: "#60a5fa", CockpitInterior: "#14b8a6",
  Fuselage_Fwd: "#a8b0bc", Fuselage_Center: "#94a3b8", Fuselage_Aft: "#6b7280",
  Glove_L: "#8b5cf6", Glove_R: "#a855f7",
  Nacelle_L: "#eab308", Nacelle_R: "#f59e0b",
  Wing_L: "#22c55e", Wing_R: "#84cc16",
  VStab_L: "#a855f7", VStab_R: "#d946ef", Rudder_L: "#c084fc", Rudder_R: "#e879f9",
  HStab_L: "#ec4899", HStab_R: "#f43f5e",
  Flap_L: "#4ade80", Flap_R: "#65a30d",
  Slat_L: "#86efac", Slat_R: "#bef264",
  Spoiler_L: "#16a34a", Spoiler_R: "#a3e635",
  Canopy: "#06b6d4",
  NoseGearStrut: "#ef4444", NoseGearWheel: "#f87171",
  NoseGearBayDoor_L: "#dc2626", NoseGearBayDoor_R: "#b91c1c",
  MainGearStrut_L: "#dc2626", MainGearStrut_R: "#b91c1c",
  MainGearWheel_L: "#fca5a5", MainGearWheel_R: "#fb7185",
  MainGearBayDoor_L: "#991b1b", MainGearBayDoor_R: "#7f1d1d",
  TailHook: "#fb923c", RefuelProbe: "#fbbf24",
  Nozzle_L: "#fed7aa", Nozzle_R: "#fdba74",
  AirbrakeUpper: "#f97316", AirbrakeLower: "#ea580c",
  Pylon_L: "#78716c", Pylon_R: "#57534e",
  FuelTank_L: "#a8a29e", FuelTank_R: "#d6d3d1",
  Missile_L: "#f43f5e", Missile_R: "#e11d48",
  Unlabeled: "#6b7280",
};

const GEAR_ANIM_MS = 8000;  // 8s reales del F-14

export default function F14AIranDebugScene() {
  const [highlightGroup, setHighlightGroup] = useState(null);
  const [highlightName,  setHighlightName]  = useState(null);
  const [lastClicked,    setLastClicked]    = useState(null);
  const [mode,           setMode]           = useState("raw");  // "painted" | "raw" | "source"
  const [wingSwept,      setWingSwept]      = useState(0);
  const [hookDown,       setHookDown]       = useState(false);
  const [canopyOpen,     setCanopyOpen]     = useState(false);
  const [gearDown,       setGearDown]       = useState(1);
  const [gearTarget,     setGearTarget]     = useState(1);
  const [spoilerDeploy,  setSpoilerDeploy]  = useState(0);
  const [flapDeploy,     setFlapDeploy]     = useState(0);
  const [slatDeploy,     setSlatDeploy]     = useState(0);
  const [rudderDeploy,   setRudderDeploy]   = useState(0);
  const [hstabDeploy,    setHStabDeploy]    = useState(0);
  const [nozzleDeploy,   setNozzleDeploy]   = useState(0);
  const [nozzleClosedOffset, setNozzleClosedOffset] = useState({ x: 0, y: 0.25, z: 0 });
  const [pilotOffset,    setPilotOffset]    = useState({ x: 0, y: -0.88, z: 0.33 });
  const [pilotTilt,      setPilotTilt]      = useState(-19);
  const [pilotScale,     setPilotScale]     = useState(1.37);
  const [eject,          setEject]          = useState(false);
  const [chuteParams, setChuteParams] = useState({
    shoulderOffset: 0.40, offsetX: 0.01, offsetY: 0.85, offsetZ: -0.02,
    riserX: 0.06, riserSep: 0.045, riserWidth: 0.020, riserDepth: 0.006,
    lineWidth: 0.003, confY: -2.61,
  });
  const [rArm, setRArm] = useState({
    elbow: 27, shoulderIn: -22, shoulderFwd: 40,
    forearmOut: 3, forearmDown: -27, forearmZ: -31, forearmRoll: 0,
  });
  const [showHingesPanel, setShowHingesPanel] = useState(false);
  const [showSpoilersPanel, setShowSpoilersPanel] = useState(false);
  const [showFlapsPanel, setShowFlapsPanel] = useState(false);
  const [showSlatsPanel, setShowSlatsPanel] = useState(false);
  const [showRuddersPanel, setShowRuddersPanel] = useState(false);
  const [showHStabsPanel, setShowHStabsPanel] = useState(false);

  // Anima gearDown hacia gearTarget en GEAR_ANIM_MS (lerp lineal con RAF).
  const gearAnimRef = useRef(null);
  useEffect(() => {
    if (gearAnimRef.current) cancelAnimationFrame(gearAnimRef.current);
    const from = gearDown;
    const to = gearTarget;
    if (from === to) return;
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / GEAR_ANIM_MS);
      setGearDown(from + (to - from) * t);
      if (t < 1) gearAnimRef.current = requestAnimationFrame(tick);
    };
    gearAnimRef.current = requestAnimationFrame(tick);
    return () => { if (gearAnimRef.current) cancelAnimationFrame(gearAnimRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gearTarget]);

  // Debug de bisagras (state + panel) encapsulado en helper.
  const hingesCtl   = useHingesController(gearDown);
  const spoilersCtl = useSpoilersController(spoilerDeploy);
  const flapsCtl    = useFlapsController(flapDeploy);
  const slatsCtl    = useSlatsController(slatDeploy);
  const ruddersCtl  = useRuddersController(rudderDeploy);
  const hstabsCtl   = useHStabsController(hstabDeploy);

  // Taxi: W/S → speed smoothed → wheel spin
  const keysRef      = useRef(new Set());
  const taxiSpeedRef = useRef(0);
  useEffect(() => {
    const onDown = e => keysRef.current.add(e.code);
    const onUp   = e => keysRef.current.delete(e.code);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup",   onUp);
    };
  }, []);

  const useSource = mode === "source";
  const showRaw   = mode === "raw";

  const resetFilter = (next) => {
    setMode(next);
    setHighlightGroup(null);
    setHighlightName(null);
    setLastClicked(null);
  };

  return (
    <main style={{ width: "100vw", height: "100vh", background: "#0a0d12", color: "#e6eef8" }}>
      <div style={{
        position: "absolute", zIndex: 10, top: 16, left: 16,
        padding: 14, borderRadius: 12, width: 280,
        background: "rgba(10,14,22,0.9)",
        border: "1px solid rgba(173,191,214,0.2)",
        fontFamily: "monospace", fontSize: 13,
        backdropFilter: "blur(10px)",
        maxHeight: "calc(100vh - 32px)", overflowY: "auto",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>F-14 V6 · Debug</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          <button onClick={() => resetFilter("painted")} style={modeBtn(mode === "painted")}>Pintado por grupo</button>
          <button onClick={() => resetFilter("raw")}     style={modeBtn(mode === "raw")}>Materiales originales</button>
          <button onClick={() => resetFilter("source")}  style={modeBtn(mode === "source")}>Fuente (sin rigging)</button>
        </div>

        {!useSource && (
          <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 6,
                        background: "rgba(30,40,55,0.6)",
                        border: "1px solid rgba(173,191,214,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8fa4c0", marginBottom: 4 }}>
              <span>WING SWEEP</span>
              <span>{Math.round(20 + wingSwept * 48)}°</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01}
              value={wingSwept}
              onChange={e => setWingSwept(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#4ade80" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#556" }}>
              <span>20° ext</span><span>68° barridas</span>
            </div>

            <button onClick={() => setHookDown(v => !v)} style={toggleBtn(hookDown, "orange")}>
              Tail hook: {hookDown ? "EXTENDIDO ▼" : "retraído ▲"}
            </button>
            <button onClick={() => setCanopyOpen(v => !v)} style={toggleBtn(canopyOpen, "blue")}>
              Canopy: {canopyOpen ? "ABIERTO ◢" : "cerrado ▬"}
            </button>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <button
                onClick={() => setEject(true)}
                style={{ ...toggleBtn(eject, "red"), flex: 1, marginTop: 0 }}
              >
                EJECT! 🚀
              </button>
              <button
                onClick={() => setEject(false)}
                style={{ ...toggleBtn(false, "blue"), flex: 1, marginTop: 0 }}
              >
                RESET
              </button>
            </div>
            <button
              onClick={() => setGearTarget(t => (t >= 0.5 ? 0 : 1))}
              style={toggleBtn(gearTarget >= 0.5, "red")}
            >
              Tren: {gearDown >= 0.99 ? "ABAJO ▼" : gearDown <= 0.01 ? "arriba ▲"
                : `${Math.round(gearDown * 100)}% ${gearTarget >= 0.5 ? "▼" : "▲"}`}
            </button>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8fa4c0", marginBottom: 4 }}>
              <span>SPOILERS</span>
              <span>{Math.round(spoilerDeploy * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01}
              value={spoilerDeploy}
              onChange={e => setSpoilerDeploy(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#a3e635" }}
            />
            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8fa4c0", marginBottom: 4 }}>
              <span>FLAPS</span>
              <span>{Math.round(flapDeploy * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01}
              value={flapDeploy}
              onChange={e => setFlapDeploy(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#22d3ee" }}
            />
            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8fa4c0", marginBottom: 4 }}>
              <span>SLATS</span>
              <span>{Math.round(slatDeploy * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01}
              value={slatDeploy}
              onChange={e => setSlatDeploy(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#fb923c" }}
            />
            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8fa4c0", marginBottom: 4 }}>
              <span>RUDDERS</span>
              <span>{Math.round(rudderDeploy * 30)}°</span>
            </div>
            <input
              type="range" min={-1} max={1} step={0.01}
              value={rudderDeploy}
              onChange={e => setRudderDeploy(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#e879f9" }}
            />
            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8fa4c0", marginBottom: 4 }}>
              <span>HSTABS</span>
              <span>{Math.round(hstabDeploy * 20)}°</span>
            </div>
            <input
              type="range" min={-1} max={1} step={0.01}
              value={hstabDeploy}
              onChange={e => setHStabDeploy(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#ef4444" }}
            />
            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8fa4c0", marginBottom: 4 }}>
              <span>NOZZLES (AB)</span>
              <span>{Math.round(nozzleDeploy * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01}
              value={nozzleDeploy}
              onChange={e => setNozzleDeploy(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#fb7185" }}
            />
            <div style={{ marginTop: 6, fontSize: 10, color: "#8fa4c0" }}>
              Nozzle CLOSED offset (xyz world)
            </div>
            {["x", "y", "z"].map(axis => (
              <div key={axis} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                <span style={{ color: "#8fa4c0", width: 12 }}>{axis}</span>
                <input
                  type="range" min={-0.5} max={0.5} step={0.01}
                  value={nozzleClosedOffset[axis]}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setNozzleClosedOffset(s => ({ ...s, [axis]: v }));
                  }}
                  style={{ flex: 1, accentColor: "#fb7185" }}
                />
                <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
                  {nozzleClosedOffset[axis].toFixed(2)}
                </span>
              </div>
            ))}

            <div style={{ marginTop: 8, fontSize: 11, color: "#8fa4c0" }}>
              PILOTO offset / tilt / scale
            </div>
            {["x", "y", "z"].map(axis => (
              <div key={`pl_${axis}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                <span style={{ color: "#8fa4c0", width: 12 }}>{axis}</span>
                <input
                  type="range" min={-2} max={2} step={0.01}
                  value={pilotOffset[axis]}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setPilotOffset(s => ({ ...s, [axis]: v }));
                  }}
                  style={{ flex: 1, accentColor: "#22d3ee" }}
                />
                <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
                  {pilotOffset[axis].toFixed(2)}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
              <span style={{ color: "#8fa4c0", width: 12 }}>°</span>
              <input
                type="range" min={-90} max={90} step={1}
                value={pilotTilt}
                onChange={e => setPilotTilt(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "#22d3ee" }}
              />
              <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
                {pilotTilt}°
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
              <span style={{ color: "#8fa4c0", width: 12 }}>sc</span>
              <input
                type="range" min={0.1} max={3} step={0.01}
                value={pilotScale}
                onChange={e => setPilotScale(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "#22d3ee" }}
              />
              <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
                {pilotScale.toFixed(2)}
              </span>
            </div>

            <div style={{ marginTop: 8, fontSize: 11, color: "#8fa4c0" }}>
              PARACAÍDAS
            </div>
            {[
              { k: "shoulderOffset", min: 0,    max: 1,    step: 0.01 },
              { k: "offsetX",        min: -0.5, max: 0.5,  step: 0.01 },
              { k: "offsetY",        min: -0.5, max: 1,    step: 0.01 },
              { k: "offsetZ",        min: -0.5, max: 0.5,  step: 0.01 },
              { k: "riserX",         min: 0,    max: 0.3,  step: 0.005 },
              { k: "riserSep",       min: 0,    max: 0.2,  step: 0.005 },
              { k: "riserWidth",     min: 0.005, max: 0.05, step: 0.001 },
              { k: "riserDepth",     min: 0.001, max: 0.02, step: 0.001 },
              { k: "lineWidth",      min: 0.001, max: 0.02, step: 0.0005 },
              { k: "confY",          min: -4,   max: -1,   step: 0.05 },
            ].map(({ k, min, max, step }) => (
              <div key={`ch_${k}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                <span style={{ color: "#8fa4c0", width: 80, fontSize: 9 }}>{k}</span>
                <input
                  type="range" min={min} max={max} step={step}
                  value={chuteParams[k]}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setChuteParams(s => ({ ...s, [k]: v }));
                  }}
                  style={{ flex: 1, accentColor: "#84cc16" }}
                />
                <span style={{ color: "#e6eef8", width: 44, textAlign: "right" }}>
                  {chuteParams[k].toFixed(3)}
                </span>
              </div>
            ))}

            <div style={{ marginTop: 8, fontSize: 11, color: "#8fa4c0" }}>
              BRAZO DERECHO (deg)
            </div>
            {[
              { k: "elbow",        min: -90, max: 180 },
              { k: "shoulderIn",   min: -90, max: 90  },
              { k: "shoulderFwd",  min: -90, max: 90  },
              { k: "forearmOut",   min: -90, max: 90  },
              { k: "forearmDown",  min: -90, max: 90  },
              { k: "forearmZ",     min: -90, max: 90  },
              { k: "forearmRoll",  min: -180, max: 180 },
            ].map(({ k, min, max }) => (
              <div key={`rArm_${k}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                <span style={{ color: "#8fa4c0", width: 60, fontSize: 9 }}>{k}</span>
                <input
                  type="range" min={min} max={max} step={1}
                  value={rArm[k]}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setRArm(s => ({ ...s, [k]: v }));
                  }}
                  style={{ flex: 1, accentColor: "#f87171" }}
                />
                <span style={{ color: "#e6eef8", width: 36, textAlign: "right" }}>
                  {rArm[k]}°
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: "#8fa4c0", marginBottom: 10, lineHeight: 1.5 }}>
          {useSource
            ? "Modelo original de Sketchfab, sin split ni grupos."
            : showRaw
              ? "V6 con texturas originales."
              : "V6 con un color por grupo semántico."}
        </div>

        {!useSource && (
          <>
            <button onClick={() => { setHighlightGroup(null); setHighlightName(null); }}
                    style={btnStyle(!highlightGroup && !highlightName)}>
              Mostrar todo
            </button>
            <div style={{ marginTop: 10, fontSize: 11, color: "#8fa4c0", marginBottom: 6 }}>
              GRUPOS ({V6_GROUPS.length})
            </div>
            {V6_GROUPS.map(g => (
              <button
                key={g}
                onClick={() => { setHighlightGroup(g); setHighlightName(null); }}
                style={{
                  ...btnStyle(highlightGroup === g),
                  borderLeft: `4px solid ${GROUP_COLORS[g] || '#444'}`,
                  paddingLeft: 8,
                }}
              >
                {g}
              </button>
            ))}
          </>
        )}

        <button
          onClick={() => setShowHingesPanel(v => !v)}
          style={{
            marginTop: 10, width: "100%",
            padding: "4px 8px", borderRadius: 4,
            border: "1px solid rgba(173,191,214,0.15)",
            background: "rgba(30,40,55,0.5)", color: "#667",
            fontFamily: "monospace", fontSize: 10, cursor: "pointer",
          }}
        >
          {showHingesPanel ? "▲ ocultar bisagras debug" : "▼ mostrar bisagras debug"}
        </button>
        <button
          onClick={() => setShowSpoilersPanel(v => !v)}
          style={{
            marginTop: 4, width: "100%",
            padding: "4px 8px", borderRadius: 4,
            border: "1px solid rgba(173,191,214,0.15)",
            background: "rgba(30,40,55,0.5)", color: "#667",
            fontFamily: "monospace", fontSize: 10, cursor: "pointer",
          }}
        >
          {showSpoilersPanel ? "▲ ocultar spoilers debug" : "▼ mostrar spoilers debug"}
        </button>
        <button
          onClick={() => setShowFlapsPanel(v => !v)}
          style={{
            marginTop: 4, width: "100%",
            padding: "4px 8px", borderRadius: 4,
            border: "1px solid rgba(173,191,214,0.15)",
            background: "rgba(30,40,55,0.5)", color: "#667",
            fontFamily: "monospace", fontSize: 10, cursor: "pointer",
          }}
        >
          {showFlapsPanel ? "▲ ocultar flaps debug" : "▼ mostrar flaps debug"}
        </button>
        <button
          onClick={() => setShowSlatsPanel(v => !v)}
          style={{
            marginTop: 4, width: "100%",
            padding: "4px 8px", borderRadius: 4,
            border: "1px solid rgba(173,191,214,0.15)",
            background: "rgba(30,40,55,0.5)", color: "#667",
            fontFamily: "monospace", fontSize: 10, cursor: "pointer",
          }}
        >
          {showSlatsPanel ? "▲ ocultar slats debug" : "▼ mostrar slats debug"}
        </button>
        <button
          onClick={() => setShowRuddersPanel(v => !v)}
          style={{
            marginTop: 4, width: "100%",
            padding: "4px 8px", borderRadius: 4,
            border: "1px solid rgba(173,191,214,0.15)",
            background: "rgba(30,40,55,0.5)", color: "#667",
            fontFamily: "monospace", fontSize: 10, cursor: "pointer",
          }}
        >
          {showRuddersPanel ? "▲ ocultar rudders debug" : "▼ mostrar rudders debug"}
        </button>
        <button
          onClick={() => setShowHStabsPanel(v => !v)}
          style={{
            marginTop: 4, width: "100%",
            padding: "4px 8px", borderRadius: 4,
            border: "1px solid rgba(173,191,214,0.15)",
            background: "rgba(30,40,55,0.5)", color: "#667",
            fontFamily: "monospace", fontSize: 10, cursor: "pointer",
          }}
        >
          {showHStabsPanel ? "▲ ocultar hstabs debug" : "▼ mostrar hstabs debug"}
        </button>
      </div>

      {!useSource && showHingesPanel   && <HingesDebugPanel   {...hingesCtl} />}
      {!useSource && showSpoilersPanel && <SpoilersDebugPanel {...spoilersCtl} />}
      {!useSource && showFlapsPanel    && <FlapsDebugPanel    {...flapsCtl} />}
      {!useSource && showSlatsPanel    && <SlatsDebugPanel    {...slatsCtl} />}
      {!useSource && showRuddersPanel  && <RuddersDebugPanel  {...ruddersCtl} />}
      {!useSource && showHStabsPanel   && <HStabsDebugPanel   {...hstabsCtl} />}

      {lastClicked && !useSource && (
        <div style={{
          position: "absolute", zIndex: 10, top: 16, right: 16,
          padding: 14, borderRadius: 12, maxWidth: 420,
          background: "rgba(10,14,22,0.9)",
          border: "1px solid rgba(173,191,214,0.2)",
          fontFamily: "monospace", fontSize: 12,
          backdropFilter: "blur(10px)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8,
                        color: GROUP_COLORS[lastClicked.group] || "#eee" }}>
            Pieza clickeada
          </div>
          <div style={{ wordBreak: "break-all", marginBottom: 6 }}>{lastClicked.name}</div>
          <div style={{ color: "#8fa4c0", fontSize: 11, lineHeight: 1.6 }}>
            Grupo: <b>{lastClicked.group}</b>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => { setHighlightName(lastClicked.name); setHighlightGroup(null); }} style={smallBtn}>
              Aislar pieza
            </button>
            <button onClick={() => { setHighlightGroup(lastClicked.group); setHighlightName(null); }} style={smallBtn}>
              Aislar grupo
            </button>
            <button onClick={() => setLastClicked(null)} style={smallBtn}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      <Canvas
        camera={{ position: [8, 4, 10], fov: 45, near: 0.1, far: 500 }}
        dpr={[1, 2]}
        shadows="percentage"
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#0a0d12"]} />
        <ambientLight intensity={0.8} />
        <hemisphereLight args={["#bcd", "#432", 0.6]} />
        <directionalLight
          position={[10, 15, 8]}
          intensity={1.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0005}
          shadow-normalBias={0.05}
          shadow-camera-near={0.5}
          shadow-camera-far={60}
          shadow-camera-left={-15}
          shadow-camera-right={15}
          shadow-camera-top={15}
          shadow-camera-bottom={-15}
        />

        <TaxiSimulator keysRef={keysRef} taxiSpeedRef={taxiSpeedRef} />

        <Suspense fallback={null}>
          {useSource ? (
            <F14Raw scale={1} position={[0, 0, 0]} rotation={[0, 0, 0]} />
          ) : (
            <F14AIran
              glbPath="/F-14A-iran.glb"
              debug={true}
              highlightGroup={highlightGroup}
              highlightName={highlightName}
              showRaw={showRaw}
              wingSwept={wingSwept}
              hookDown={hookDown}
              canopyOpen={canopyOpen}
              hinges={hingesCtl.hinges}
              spoilers={spoilersCtl.spoilers}
              flaps={flapsCtl.flaps}
              slats={slatsCtl.slats}
              rudders={ruddersCtl.rudders}
              hstabs={hstabsCtl.hstabs}
              nozzleDeploy={nozzleDeploy}
              nozzleClosedOffset={nozzleClosedOffset}
              pilotOffset={pilotOffset}
              pilotTilt={pilotTilt}
              pilotScale={pilotScale}
              pilotPose={{ rArm }}
              pilotEject={eject}
              chuteParams={chuteParams}
              taxiSpeedRef={taxiSpeedRef}
              onClickPart={info => {
                setLastClicked(info);
                hingesCtl.handlePick(info);
                spoilersCtl.handlePick(info);
                flapsCtl.handlePick(info);
                slatsCtl.handlePick(info);
                ruddersCtl.handlePick(info);
                hstabsCtl.handlePick(info);
              }}
              scale={1}
              position={[0, 0, 0]}
              rotation={[0, 0, 0]}
            />
          )}
        </Suspense>

        <Grid args={[30, 30]} position={[0, -2.34, 0]}
              cellSize={1} cellColor="#223" sectionSize={5} sectionColor="#445"
              fadeDistance={40} infiniteGrid />
        <OrbitControls makeDefault target={[0, 0, 0]} />
      </Canvas>
    </main>
  );
}

function btnStyle(active) {
  return {
    display: "block", width: "100%", marginBottom: 4,
    padding: "6px 10px", borderRadius: 6,
    border: "1px solid rgba(173,191,214,0.2)",
    background: active ? "rgba(100,160,230,0.25)" : "rgba(30,40,55,0.8)",
    color: active ? "#fff" : "#bdd0ea",
    fontFamily: "monospace", fontSize: 12, cursor: "pointer",
    textAlign: "left",
  };
}

function modeBtn(active) {
  return {
    padding: "6px 10px", borderRadius: 6,
    border: "1px solid rgba(173,191,214,0.25)",
    background: active ? "rgba(100,200,140,0.25)" : "rgba(30,40,55,0.8)",
    color: active ? "#eaffef" : "#bdd0ea",
    fontFamily: "monospace", fontSize: 12, cursor: "pointer",
    fontWeight: active ? 600 : 400,
    textAlign: "left",
  };
}

function toggleBtn(active, color) {
  const palette = {
    orange: { bg: "rgba(220,140,60,0.25)",   fg: "#ffdab0" },
    blue:   { bg: "rgba(100,180,220,0.25)",  fg: "#c8e7f8" },
    red:    { bg: "rgba(220,60,60,0.25)",    fg: "#ffb0b0" },
  }[color] || { bg: "rgba(100,160,230,0.25)", fg: "#fff" };
  return {
    marginTop: 6, width: "100%",
    padding: "6px 10px", borderRadius: 6,
    border: "1px solid rgba(173,191,214,0.25)",
    background: active ? palette.bg : "rgba(30,40,55,0.8)",
    color: active ? palette.fg : "#bdd0ea",
    fontFamily: "monospace", fontSize: 12, cursor: "pointer",
    fontWeight: active ? 600 : 400,
  };
}

const smallBtn = {
  padding: "4px 8px", borderRadius: 4,
  border: "1px solid rgba(173,191,214,0.3)",
  background: "rgba(30,40,55,0.8)",
  color: "#bdd0ea",
  fontFamily: "monospace", fontSize: 11, cursor: "pointer",
};
