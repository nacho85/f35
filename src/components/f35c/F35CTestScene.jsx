"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import F35C, { WEAPON_ZONES, DEFAULT_CHUTE_PARAMS } from "./F35C";

// ── Piloto de prueba con pose reactiva ────────────────────────────────────────

const btnStyle = (active) => ({
  padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "monospace", fontSize: 12,
  border: "1px solid rgba(173,191,214,0.3)",
  background: active ? "rgba(100,160,230,0.25)" : "rgba(6,10,18,0.76)",
  color: active ? "#eef4ff" : "#7a9ec4",
});

// Simula carreteo: W acelera, S frena, sin tecla → desaceleración natural
function TaxiSimulator({ keysRef, taxiSpeedRef, baseSpeedRef }) {
  useFrame((_state, delta) => {
    const keys  = keysRef.current;
    const base  = baseSpeedRef?.current ?? 0;
    const accel = keys.has("KeyW") || keys.has("ArrowUp")   ? 1 : 0;
    const brake = keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0;
    const cur   = taxiSpeedRef.current;
    const target = accel ? 40 : brake ? 0 : base;
    const k      = accel ? 0.8 : brake ? 4.0 : 0.5;
    taxiSpeedRef.current = cur + (target - cur) * (1 - Math.exp(-k * delta));
    if (taxiSpeedRef.current < 0.05 && base < 0.05) taxiSpeedRef.current = 0;
  });
  return null;
}

const ANIM_NAMES = [
  "F-35C-BODY.015","F-35C-BODY.016","F-35C-Front-Gear-Hatch-left","F-35C-Front-Gear-Hatch-right",
  "F-35C-BODY.028","F-35C-BODY.029","F-35C-GEAR -Rig","Armature.019","Armature","Armature.001",
  "Armature.002","Armature.003","Armature.007","ontekeranimation2.001","ontekeranimation2.002",
  "Armature.009","Armature.013","Armature.011","Armature.004","Armature.014","Armature.022",
  "Armature.023","Armature.026","F-35C-BONES","solarakatekeranimasyon.001","Empty.006",
  "F-35C-BODY.053","F-35C-BODY.033","F-35C-BODY.034","F-35C-BODY.035","Armature.069",
  "F-35C-BODY.036","F-35C-BODY.037","Armature.070","F-35C-BODY.038","F-35C-BODY.039",
  "F-35C-BODY.040","F-35C-BODY.043","F-35C-BODY.044","F-35C-BODY.046","ontekeranimation2.009",
  "F-35C-BODY.047","F-35C-BODY.048","F-35C-BODY.049","F-35C-BODY.050","F-35C-BODY.051",
  "F-35C-BODY.052","F-35C-BODY.054","ontekeranimation2.008",
];

export default function F35CTestScene() {
  const [gearDown,      setGearDown]      = useState(true);
  const [weaponBayOpen, setWeaponBayOpen] = useState(false);
  const [canopyOpen,    setCanopyOpen]    = useState(false);
  const [hookDown,      setHookDown]      = useState(false);
  const [pitch,         setPitch]         = useState(0);
  const [roll,          setRoll]          = useState(0);
  const [flap,          setFlap]          = useState(0);
  const [aileron,       setAileron]       = useState(0);
  const [leadingFlap,   setLeadingFlap]   = useState(0);
  const [rudder,        setRudder]        = useState(0);
  const [wingFold,      setWingFold]      = useState(0);
  const [throttle,      setThrottle]      = useState(0);
  const [hiddenWeapons, setHiddenWeapons] = useState(new Set());
  const [debugIdx,      setDebugIdx]      = useState(null);
  const [debugProgress, setDebugProgress] = useState(1);
  const [eject,         setEject]         = useState(false);
  const ejectTriggerRef      = useRef(null);
  const resetEjectTriggerRef = useRef(null);
  const [chuteParams] = useState({ ...DEFAULT_CHUTE_PARAMS });
  const taxiSpeedRef    = useRef(0);
  const baseSpeedRef    = useRef(0);
  const [wheelSpeedSlider, setWheelSpeedSlider] = useState(0);
  const rearWheelWobbleRef = useRef(1);
  const [rearWheelWobble, setRearWheelWobble] = useState(1);
  const [rearWheelLiftAmount, setRearWheelLiftAmount] = useState(0.14);
  const keysRef         = useRef(new Set());
  const lastHighlighted = useRef(null);
  const highlightMat    = useRef(new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xffaa00, emissiveIntensity: 0.6 }));
  const sceneGroupRef   = useRef(null);
  const split056Refs    = useRef(null);

  const paintSplit = (meshName, yCut) => {
    if (!sceneGroupRef.current) return;
    const withDot = meshName.replace(/BODY(\d)/, 'BODY.$1');
    let target = null;
    sceneGroupRef.current.traverse(o => {
      if (!target && o.isMesh && (o.name === meshName || o.name === withDot)) target = o;
    });
    if (!target) { console.warn('[split] no encontrado:', meshName); return; }

    // Build non-indexed copy so we can iterate triangles freely
    const geo  = target.geometry.toNonIndexed();
    const pos  = geo.attributes.position;
    const norm = geo.attributes.normal;
    const uv   = geo.attributes.uv;

    const strut = { p: [], n: [], u: [] };
    const tire  = { p: [], n: [], u: [] };

    for (let i = 0; i < pos.count; i += 3) {
      const y0 = pos.getY(i), y1 = pos.getY(i+1), y2 = pos.getY(i+2);
      const sc = (y0 >= yCut ? 1 : 0) + (y1 >= yCut ? 1 : 0) + (y2 >= yCut ? 1 : 0);
      const dst = sc >= 2 ? strut : tire;
      for (let j = 0; j < 3; j++) {
        dst.p.push(pos.getX(i+j),  pos.getY(i+j),  pos.getZ(i+j));
        if (norm) dst.n.push(norm.getX(i+j), norm.getY(i+j), norm.getZ(i+j));
        if (uv)   dst.u.push(uv.getX(i+j),  uv.getY(i+j));
      }
    }
    geo.dispose();

    const buildGeo = ({ p, n, u }) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      if (n.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
      if (u.length) g.setAttribute('uv',     new THREE.Float32BufferAttribute(u, 2));
      return g;
    };

    const strutMesh = new THREE.Mesh(
      buildGeo(strut),
      new THREE.MeshStandardMaterial({ color: 0xff2a0d, roughness: 0.45, metalness: 0.6 })
    );
    const tireMesh = new THREE.Mesh(
      buildGeo(tire),
      new THREE.MeshStandardMaterial({ color: 0x1155ff, roughness: 0.85, metalness: 0.05 })
    );

    strutMesh.matrix.copy(target.matrix);
    strutMesh.matrixAutoUpdate = false;
    tireMesh.matrix.copy(target.matrix);
    tireMesh.matrixAutoUpdate = false;

    target.parent.add(strutMesh);
    target.parent.add(tireMesh);
    target.visible = false;

    split056Refs.current = { strutMesh, tireMesh, original: target };
    console.log(`[split] strut ${strut.p.length/3} verts | tire ${tire.p.length/3} verts`);
  };

  const unpaintSplit = () => {
    if (!split056Refs.current) return;
    const { strutMesh, tireMesh, original } = split056Refs.current;
    original.visible = true;
    strutMesh.geometry.dispose();
    tireMesh.geometry.dispose();
    original.parent?.remove(strutMesh);
    original.parent?.remove(tireMesh);
    split056Refs.current = null;
  };

  const [painted056, setPainted056] = useState(false);
  useEffect(() => {
    const onDown = e => keysRef.current.add(e.code);
    const onUp   = e => keysRef.current.delete(e.code);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);
  useEffect(() => { baseSpeedRef.current = wheelSpeedSlider; }, [wheelSpeedSlider]);

  const toggleWeapon = (id) => setHiddenWeapons(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const debugAnim = debugIdx !== null ? ANIM_NAMES[debugIdx] : null;

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
          <button style={{ ...btnStyle(eject), background: eject ? "rgba(200,40,40,0.4)" : "rgba(6,10,18,0.76)", color: "#ff6060", fontWeight: "bold" }}
            onClick={() => { ejectTriggerRef.current?.(); setEject(true); }}>⏏ EJECT</button>
          <button style={btnStyle(false)} onClick={() => { resetEjectTriggerRef.current?.(); setEject(false); }}>reset</button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span>Tren:</span>
          <button style={btnStyle(gearDown)}  onClick={() => setGearDown(true)}>Abajo</button>
          <button style={btnStyle(!gearDown)} onClick={() => setGearDown(false)}>Arriba</button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span>Cabina:</span>
          <button style={btnStyle(!canopyOpen)} onClick={() => setCanopyOpen(false)}>Cerrada</button>
          <button style={btnStyle(canopyOpen)}  onClick={() => setCanopyOpen(true)}>Abierta</button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span>Bay:</span>
          <button style={btnStyle(!weaponBayOpen)} onClick={() => setWeaponBayOpen(false)}>Cerrado</button>
          <button style={btnStyle(weaponBayOpen)}  onClick={() => setWeaponBayOpen(true)}>Abierto</button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span>Gancho:</span>
          <button style={btnStyle(!hookDown)} onClick={() => setHookDown(false)}>Recogido</button>
          <button style={btnStyle(hookDown)}  onClick={() => setHookDown(true)}>Desplegado</button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Pitch:</span>
          <input type="range" min={-1} max={1} step={0.01} value={pitch}
            onChange={e => setPitch(Number(e.target.value))} style={{ width: 120 }} />
          <span style={{ color: "#eef4ff", minWidth: 36 }}>{pitch.toFixed(2)}</span>
          <button style={btnStyle(false)} onClick={() => setPitch(0)}>reset</button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Roll:</span>
          <input type="range" min={-1} max={1} step={0.01} value={roll}
            onChange={e => setRoll(Number(e.target.value))} style={{ width: 120 }} />
          <span style={{ color: "#eef4ff", minWidth: 36 }}>{roll.toFixed(2)}</span>
          <button style={btnStyle(false)} onClick={() => setRoll(0)}>reset</button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Flap:</span>
          <input type="range" min={0} max={1} step={0.01} value={flap}
            onChange={e => setFlap(Number(e.target.value))} style={{ width: 120 }} />
          <span style={{ color: "#eef4ff", minWidth: 36 }}>{flap.toFixed(2)}</span>
          <button style={btnStyle(false)} onClick={() => setFlap(0)}>reset</button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Wing fold:</span>
          <input type="range" min={0} max={1} step={0.01} value={wingFold}
            onChange={e => setWingFold(Number(e.target.value))} style={{ width: 120 }} />
          <span style={{ color: "#eef4ff", minWidth: 36 }}>{wingFold.toFixed(2)}</span>
          <button style={btnStyle(false)} onClick={() => setWingFold(0)}>reset</button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Lead flap:</span>
          <input type="range" min={0} max={1} step={0.01} value={leadingFlap}
            onChange={e => setLeadingFlap(Number(e.target.value))} style={{ width: 120 }} />
          <span style={{ color: "#eef4ff", minWidth: 36 }}>{leadingFlap.toFixed(2)}</span>
          <button style={btnStyle(false)} onClick={() => setLeadingFlap(0)}>reset</button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Aileron:</span>
          <input type="range" min={-1} max={1} step={0.01} value={aileron}
            onChange={e => setAileron(Number(e.target.value))} style={{ width: 120 }} />
          <span style={{ color: "#eef4ff", minWidth: 36 }}>{aileron.toFixed(2)}</span>
          <button style={btnStyle(false)} onClick={() => setAileron(0)}>reset</button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Throttle:</span>
          <input type="range" min={0} max={1} step={0.01} value={throttle}
            onChange={e => setThrottle(Number(e.target.value))} style={{ width: 120 }} />
          <span style={{ color: "#eef4ff", minWidth: 36 }}>{throttle.toFixed(2)}</span>
          <button style={btnStyle(false)} onClick={() => setThrottle(0)}>off</button>
          <button style={btnStyle(throttle === 1)} onClick={() => setThrottle(1)}>AB</button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Rudder:</span>
          <input type="range" min={-1} max={1} step={0.01} value={rudder}
            onChange={e => setRudder(Number(e.target.value))} style={{ width: 120 }} />
          <span style={{ color: "#eef4ff", minWidth: 36 }}>{rudder.toFixed(2)}</span>
          <button style={btnStyle(false)} onClick={() => setRudder(0)}>reset</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span>Armas:</span>
          {WEAPON_ZONES.map(z => (
            <button key={z.id} style={{ ...btnStyle(!hiddenWeapons.has(z.id)), display: "flex", alignItems: "center", gap: 6, textAlign: "left" }}
              onClick={() => toggleWeapon(z.id)}>
              <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                background: `#${z.color.toString(16).padStart(6, "0")}` }} />
              {z.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Debug anim:</span>
          <button style={btnStyle(false)} onClick={() => setDebugIdx(i => i === null ? 0 : Math.max(0, i - 1))}>{"<"}</button>
          <span style={{ color: "#eef4ff", minWidth: 200 }}>{debugAnim ? `[${debugIdx}] ${debugAnim}` : "—"}</span>
          <button style={btnStyle(false)} onClick={() => setDebugIdx(i => i === null ? 0 : Math.min(ANIM_NAMES.length - 1, i + 1))}>{">"}</button>
          <button style={btnStyle(debugIdx === null)} onClick={() => setDebugIdx(null)}>off</button>
        </div>
        {debugAnim && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span>t:</span>
            <input type="range" min={0} max={1} step={0.01} value={debugProgress}
              onChange={e => setDebugProgress(Number(e.target.value))}
              style={{ width: 200 }} />
            <span style={{ color: "#eef4ff" }}>{debugProgress.toFixed(2)}</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, borderTop: "1px solid rgba(173,191,214,0.12)", paddingTop: 6 }}>
          <span>BODY056:</span>
          <button style={btnStyle(painted056)} onClick={() => {
            if (painted056) { unpaintSplit("F-35C-BODY056"); setPainted056(false); }
            else { paintSplit("F-35C-BODY056", 2.833); setPainted056(true); }
          }}>
            {painted056 ? "Quitar pintura" : "Pintar strut/llanta"}
          </button>
        </div>
      </div>

      {/* ── Panel velocidad ruedas — abajo derecha ──────────────────────── */}
      <div style={{
        position: "absolute", zIndex: 10, bottom: 16, right: 16,
        display: "flex", flexDirection: "column", gap: 6,
        padding: "10px 14px", borderRadius: 8, minWidth: 260,
        background: "rgba(6,10,18,0.82)", border: "1px solid rgba(173,191,214,0.16)",
        color: "#7a9ec4", fontFamily: "monospace", fontSize: 11,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ color: "#eef4ff", marginBottom: 2 }}>Velocidad ruedas</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={40} step={0.5} value={wheelSpeedSlider}
            onChange={e => setWheelSpeedSlider(Number(e.target.value))}
            style={{ flex: 1 }} />
          <span style={{ color: "#eef4ff", width: 52 }}>{wheelSpeedSlider.toFixed(1)} m/s</span>
        </div>
        <div style={{ color: "#eef4ff", marginTop: 4 }}>Rear wheel wobble</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={rearWheelWobble}
            onChange={e => {
              const next = Number(e.target.value);
              setRearWheelWobble(next);
              rearWheelWobbleRef.current = next;
            }}
            style={{ flex: 1 }}
          />
          <span style={{ color: "#eef4ff", width: 36 }}>{rearWheelWobble.toFixed(2)}</span>
          <button style={btnStyle(false)} onClick={() => {
            setRearWheelWobble(1);
            rearWheelWobbleRef.current = 1;
          }}>reset</button>
        </div>
        <div style={{ color: "#eef4ff", marginTop: 4 }}>Rear wheel lift</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range"
            min={-0.1}
            max={0.4}
            step={0.005}
            value={rearWheelLiftAmount}
            onChange={e => setRearWheelLiftAmount(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ color: "#eef4ff", width: 44 }}>{rearWheelLiftAmount.toFixed(3)}</span>
          <button style={btnStyle(false)} onClick={() => setRearWheelLiftAmount(0.14)}>reset</button>
        </div>
        <div style={{ color: "#4a6a8a", fontSize: 10 }}>W/S para acelerar/frenar</div>
      </div>

      <Canvas
        camera={{ position: [8, 4, 12], fov: 42 }}
        shadows={{ type: THREE.PCFShadowMap }}
      >
        <color attach="background" args={["#0b1016"]} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[8, 10, 6]} intensity={2.2} castShadow />
        <Environment preset="city" />

        <TaxiSimulator keysRef={keysRef} taxiSpeedRef={taxiSpeedRef} baseSpeedRef={baseSpeedRef} />

        <Suspense fallback={null}>
          <group ref={sceneGroupRef} onPointerDown={e => {
            e.stopPropagation();
            const hit = e.object;
            console.log("[RAYCAST]", hit.name || "(sin nombre)", hit.type, hit.uuid.slice(0,8));
            if (lastHighlighted.current) {
              lastHighlighted.current.material = lastHighlighted.current._origMat;
              lastHighlighted.current = null;
            }
            if (hit.isMesh) {
              hit._origMat = hit.material;
              hit.material = highlightMat.current;
              lastHighlighted.current = hit;
            }
          }}>
            <F35C scale={1} position={[0, 0, 0]} rotation={[0, 0, 0]} gearDown={gearDown} canopyOpen={canopyOpen} weaponBayOpen={weaponBayOpen} hookDown={hookDown} pitch={pitch} roll={roll} flap={flap} aileron={aileron} leadingFlap={leadingFlap} rudder={rudder} wingFold={wingFold} throttle={throttle} hiddenWeapons={hiddenWeapons} debugAnim={debugAnim} debugProgress={debugProgress} eject={eject} ejectTriggerRef={ejectTriggerRef} resetEjectTriggerRef={resetEjectTriggerRef} chuteParams={chuteParams} taxiSpeedRef={taxiSpeedRef} rearWheelWobbleRef={rearWheelWobbleRef} rearWheelLiftAmount={rearWheelLiftAmount} debugRearWheelAxes={false} />
          </group>
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
