"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";
import OrmuzTerrain from "./OrmuzTerrain";
import OceanWater from "./OceanWater";
import FFTOcean from "./FFTOcean";
import PersianGulfWater from "./PersianGulfWater";
import WeatherSystem from "./WeatherSystem";
import OSMAirport from "./OSMAirport";
import { fetchSatelliteCanvas } from "./terrainTiles";
import {
  TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON,
  WT_OUTER_ZOOM, WT_OUTER_GRID_SIZE, WT_OUTER_WORLD_SIZE,
  WT_INNER_WORLD_SIZE,
  WT_MID_ZOOM, WT_MID_GRID_SIZE, WT_MID_WORLD_SIZE,
  WT_INNER14_TOTAL_SIZE,
  WT_INNER14_CENTER_X, WT_INNER14_CENTER_Z,
} from "./terrainScale";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Avatar = cubo magenta controlado por WASD/QE relativo a la cámara.
// W = adelante según hacia dónde mira la cámara · S = atrás · A/D = strafe.
// Q/E (o Ctrl/Space) = vertical absoluto (independiente de la cámara).
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _move = new THREE.Vector3();

function CubeAvatar({ avatarPosRef }) {
  const ref = useRef();
  const keys = useRef(new Set());
  const { camera } = useThree();

  useEffect(() => {
    const onDown = (e) => keys.current.add(e.code);
    const onUp = (e) => keys.current.delete(e.code);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const k = keys.current;
    const fast = k.has("ShiftLeft") || k.has("ShiftRight");
    const speed = fast ? 8000 : 1000;  // m/s

    // Forward horizontal de la cámara (Y=0 → solo plano XZ)
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1); // cámara mira recto abajo
    _fwd.normalize();
    // Right = fwd × up (ortogonal en plano XZ)
    _right.crossVectors(_fwd, _up).normalize();

    _move.set(0, 0, 0);
    if (k.has("KeyW")) _move.add(_fwd);
    if (k.has("KeyS")) _move.sub(_fwd);
    if (k.has("KeyD")) _move.add(_right);
    if (k.has("KeyA")) _move.sub(_right);
    if (_move.lengthSq() > 0) _move.normalize().multiplyScalar(speed * delta);

    // Vertical absoluto
    let vy = 0;
    if (k.has("KeyE") || k.has("Space"))       vy += speed * delta;
    if (k.has("KeyQ") || k.has("ControlLeft")) vy -= speed * delta;

    const v = ref.current.position;
    v.x += _move.x;
    v.z += _move.z;
    v.y += vy;
    avatarPosRef.current.copy(v);
  });

  return (
    <mesh ref={ref} position={[0, 200, 0]}>
      <boxGeometry args={[40, 40, 40]} />
      <meshBasicMaterial color={0xff00ff} />
    </mesh>
  );
}

// OrbitControls cuyo target sigue al avatar — el usuario puede orbitar/zoom
// con el mouse, y la cámara mantiene su offset relativo al cubo cuando
// el cubo se mueve.
function FollowOrbit({ avatarPosRef, controlsRef }) {
  const lastPos = useRef(new THREE.Vector3());
  const { scene, camera } = useThree();
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__scene = scene;
      window.__camera = camera;
    }
  }, [scene, camera]);

  useFrame(() => {
    const p = avatarPosRef.current;
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    // Δ del cubo desde el último frame → desplazar también la cámara para
    // mantener el offset de visión que el usuario eligió con el mouse.
    const dx = p.x - lastPos.current.x;
    const dy = p.y - lastPos.current.y;
    const dz = p.z - lastPos.current.z;
    if (dx || dy || dz) {
      ctrl.object.position.x += dx;
      ctrl.object.position.y += dy;
      ctrl.object.position.z += dz;
      ctrl.target.set(p.x, p.y, p.z);
      ctrl.update();
      lastPos.current.copy(p);
    }
  });
  return null;
}

// HUD con coordenadas y altura
function HUD({ avatarPosRef }) {
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });
  useEffect(() => {
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = avatarPosRef.current;
      setData({ x: p.x, y: p.y, z: p.z });
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [avatarPosRef]);
  return (
    <div style={{
      position: "absolute", top: 16, left: 16, zIndex: 10,
      padding: "10px 14px", borderRadius: 8,
      background: "rgba(6,10,18,0.76)", color: "#bdd0ea",
      fontFamily: "monospace", fontSize: 13, lineHeight: 1.6,
    }}>
      <div style={{ color: "#eef4ff", fontWeight: 600, marginBottom: 4 }}>
        Bandar Abbas · Test Scene
      </div>
      <div>Altura : <span style={{ color: "#eef4ff" }}>{data.y.toFixed(0)} m</span></div>
      <div>Este   : <span style={{ color: "#eef4ff" }}>{data.x.toFixed(0)} m</span></div>
      <div>Norte  : <span style={{ color: "#eef4ff" }}>{(-data.z).toFixed(0)} m</span></div>
      <div style={{ marginTop: 6, fontSize: 11, color: "#7a9ec4" }}>
        WASD horizontal · Q/E vertical · Shift = 8x<br />
        Mouse drag = orbitar · scroll = zoom
      </div>
    </div>
  );
}

// Minimap centrado en el centro del inner14 (~70km sur de TFB.9), 200km de
// lado. Tighter que antes para no mostrar tanta tierra interna de Irán al
// norte. Range world: X∈[-100km,+100km], Z∈[-30km,+170km].
const MINIMAP_WORLD_SIZE = 200000; // 200 km
const MINIMAP_CENTER_X = 0;
const MINIMAP_CENTER_Z = 70000;    // 70 km al sur (centro del inner14)

// tileSnapOffset duplicado (también está en OrmuzTerrain) — pequeño
// y solo necesario para corregir el crop del outer ring que está offset del
// TERRAIN_CENTER por el snap del tile z10 (~12 km).
const _EARTH_CIRC = 40075016.686;
function tileSnapOffsetMM(lat, lon, zoom) {
  const lonNorm = (lon + 180) / 360;
  const latRad = lat * Math.PI / 180;
  const yNorm = (1 - Math.log(Math.tan(Math.PI/4 + latRad/2)) / Math.PI) / 2;
  const exactX = lonNorm * 2 ** zoom;
  const exactY = yNorm * 2 ** zoom;
  const subX = exactX - Math.floor(exactX);
  const subY = exactY - Math.floor(exactY);
  const mpt = (_EARTH_CIRC * Math.cos(latRad)) / (2 ** zoom);
  return { x: subX * mpt, z: subY * mpt };
}
function Minimap({ avatarPosRef, bgUrl }) {
  const dotRef = useRef();

  useEffect(() => {
    let raf;
    const update = () => {
      raf = requestAnimationFrame(update);
      if (!dotRef.current) return;
      const p = avatarPosRef.current;
      const px = ((p.x - MINIMAP_CENTER_X) / MINIMAP_WORLD_SIZE + 0.5) * 100;
      const pz = ((p.z - MINIMAP_CENTER_Z) / MINIMAP_WORLD_SIZE + 0.5) * 100;
      dotRef.current.style.left = `${Math.max(0, Math.min(100, px))}%`;
      dotRef.current.style.top  = `${Math.max(0, Math.min(100, pz))}%`;
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, [avatarPosRef]);

  return (
    <div style={{
      position: "absolute", bottom: 16, right: 16, width: 280, height: 280,
      borderRadius: 8, overflow: "hidden",
      border: "2px solid rgba(173,191,214,0.4)",
      background: bgUrl ? `url(${bgUrl}) center/cover no-repeat` : "#222",
      zIndex: 10,
      boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
    }}>
      <div ref={dotRef} style={{
        position: "absolute",
        width: 12, height: 12, borderRadius: "50%",
        background: "#ff0033", border: "2px solid #fff",
        transform: "translate(-50%, -50%)",
        boxShadow: "0 0 8px #ff0033",
        pointerEvents: "none",
      }} />
      {/* Cuadrado verde: zona renderizada inner14 (z14) — relativa al centro
          del minimap. */}
      {(() => {
        const cx = ((WT_INNER14_CENTER_X - MINIMAP_CENTER_X) / MINIMAP_WORLD_SIZE + 0.5) * 100;
        const cz = ((WT_INNER14_CENTER_Z - MINIMAP_CENTER_Z) / MINIMAP_WORLD_SIZE + 0.5) * 100;
        const w  = (WT_INNER14_TOTAL_SIZE / MINIMAP_WORLD_SIZE) * 100;
        return (
          <div style={{
            position: "absolute", left: `${cx}%`, top: `${cz}%`,
            width:  `${w}%`, height: `${w}%`,
            background: "rgba(0, 255, 100, 0.15)",
            border: "2px solid rgba(0, 255, 100, 0.9)",
            boxShadow: "0 0 8px rgba(0, 255, 100, 0.6)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }} />
        );
      })()}
      {/* Marcador de Bandar Abbas TFB.9 (world 0,0) */}
      {(() => {
        const yx = ((0 - MINIMAP_CENTER_X) / MINIMAP_WORLD_SIZE + 0.5) * 100;
        const yz = ((0 - MINIMAP_CENTER_Z) / MINIMAP_WORLD_SIZE + 0.5) * 100;
        return (
          <div style={{
            position: "absolute", left: `${yx}%`, top: `${yz}%`,
            width: 8, height: 8, borderRadius: "50%",
            background: "transparent", border: "2px solid #ffdd00",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }} />
        );
      })()}
      <div style={{
        position: "absolute", bottom: 4, left: 4, color: "#fff",
        fontFamily: "monospace", fontSize: 10, opacity: 0.8,
        textShadow: "0 0 4px #000",
      }}>
        N ↑ · {(MINIMAP_WORLD_SIZE / 1000).toFixed(0)} km · □ {(WT_INNER14_TOTAL_SIZE / 1000).toFixed(0)} km
      </div>
    </div>
  );
}

function WeatherPanel({ hour, setHour, weather, setWeather }) {
  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60);
  const timeStr = `${hh.toString().padStart(2,"0")}:${mm.toString().padStart(2,"0")}`;
  return (
    <div style={{
      position: "absolute", top: 16, right: 16, zIndex: 10,
      padding: "10px 14px", borderRadius: 8,
      background: "rgba(6,10,18,0.76)", color: "#bdd0ea",
      fontFamily: "monospace", fontSize: 12, lineHeight: 1.5,
      minWidth: 220,
    }}>
      <div style={{ color: "#eef4ff", fontWeight: 600, marginBottom: 6 }}>
        Weather
      </div>
      <label style={{ display: "block", marginBottom: 6 }}>
        Hour: <span style={{ color: "#eef4ff" }}>{timeStr}</span>
        <input
          type="range"
          min="0" max="24" step="0.25"
          value={hour}
          onChange={(e) => setHour(parseFloat(e.target.value))}
          style={{ width: "100%", marginTop: 4 }}
        />
      </label>
      <label style={{ display: "block" }}>
        Conditions:
        <select
          value={weather}
          onChange={(e) => setWeather(e.target.value)}
          style={{
            width: "100%", marginTop: 4, padding: 4,
            background: "#0a1320", color: "#eef4ff",
            border: "1px solid rgba(173,191,214,0.3)",
            fontFamily: "monospace", fontSize: 12,
          }}
        >
          <option value="clear">Clear</option>
          <option value="scattered">Scattered clouds</option>
          <option value="overcast">Overcast</option>
          <option value="storm">Storm</option>
        </select>
      </label>
    </div>
  );
}

// ─── Runway overlays editable ────────────────────────────────────────────────
function RunwayMesh({ cfg, color, opacity = 0.55 }) {
  return (
    <group rotation={[0, (cfg.rotY * Math.PI) / 180, 0]} position={[cfg.x, cfg.y, cfg.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[cfg.width, cfg.length]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

const SLIDER_DEFS = [
  { key: "x", label: "X (este+)", min: -3000, max: 3000, step: 5 },
  { key: "z", label: "Z (sur+)",  min: -3000, max: 3000, step: 5 },
  { key: "y", label: "Y (alt)",   min: 0, max: 30, step: 0.1 },
  { key: "length", label: "Length", min: 100, max: 6000, step: 10 },
  { key: "width",  label: "Width",  min: 10,  max: 500,  step: 5 },
  { key: "rotY",   label: "Rot°",   min: -90, max: 90,   step: 0.5 },
];

function RunwaySection({ title, color, cfg, setCfg, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div style={{ marginTop: 8, borderTop: "1px solid rgba(173,191,214,0.18)", paddingTop: 6 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", textAlign: "left", padding: "2px 0",
          background: "transparent", color: "#eef4ff",
          border: "none", fontFamily: "monospace", fontSize: 12, cursor: "pointer",
        }}
      >
        <span style={{ color, marginRight: 6 }}>■</span>
        {open ? "▼" : "▶"} {title}
      </button>
      {open && SLIDER_DEFS.map((d) => (
        <label key={d.key} style={{ display: "block", marginTop: 4, fontSize: 11 }}>
          {d.label}: <span style={{ color: "#eef4ff" }}>{cfg[d.key].toFixed(d.step < 1 ? 1 : 0)}</span>
          <input
            type="range" min={d.min} max={d.max} step={d.step}
            value={cfg[d.key]}
            onChange={(e) => setCfg({ ...cfg, [d.key]: parseFloat(e.target.value) })}
            style={{ width: "100%", marginTop: 1 }}
          />
        </label>
      ))}
    </div>
  );
}

function RunwayPanel({ airport, setAirport, runway1, setRunway1, runway2, setRunway2 }) {
  return (
    <div style={{
      position: "absolute", top: 220, right: 16, zIndex: 10,
      padding: "10px 14px", borderRadius: 8,
      background: "rgba(6,10,18,0.76)", color: "#bdd0ea",
      fontFamily: "monospace", fontSize: 12,
      width: 240, maxHeight: "calc(100vh - 240px)", overflowY: "auto",
    }}>
      <div style={{ color: "#eef4ff", fontWeight: 600, marginBottom: 4 }}>Runway overlays</div>
      <RunwaySection title="Airport zone" color="#ffaa00" cfg={airport} setCfg={setAirport} defaultOpen />
      <RunwaySection title="Runway 1 (main 03L/21R)" color="#ff00ff" cfg={runway1} setCfg={setRunway1} />
      <RunwaySection title="Runway 2 (sec)" color="#00ffff" cfg={runway2} setCfg={setRunway2} />
    </div>
  );
}

function LoadingOverlay({ loaded, total }) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  const done = total > 0 && loaded >= total;
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(180deg, #0a1422 0%, #050912 100%)",
      color: "#bdd0ea", fontFamily: "monospace",
      opacity: done ? 0 : 1,
      transition: "opacity 0.6s ease-out",
      pointerEvents: done ? "none" : "auto",
    }}>
      <div style={{ width: "min(420px, 80vw)", textAlign: "center" }}>
        <div style={{ fontSize: 18, color: "#eef4ff", letterSpacing: 2, marginBottom: 4 }}>
          BANDAR ABBAS · TFB.9
        </div>
        <div style={{ fontSize: 12, color: "#7a9ec4", marginBottom: 24 }}>
          Loading Persian Gulf terrain · 175 × 175 km
        </div>
        <div style={{
          height: 6, background: "rgba(173,191,214,0.15)", borderRadius: 3,
          overflow: "hidden", marginBottom: 10,
        }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: "linear-gradient(90deg, #4a8ed4, #7ab8ff)",
            transition: "width 0.2s ease-out",
            boxShadow: "0 0 8px rgba(122,184,255,0.6)",
          }} />
        </div>
        <div style={{ fontSize: 12, color: "#7a9ec4" }}>
          {loaded} / {total} sub-meshes · {pct}%
        </div>
      </div>
    </div>
  );
}

export default function BandarAbbasTestScene() {
  const avatarPosRef = useRef(new THREE.Vector3(0, 200, 0));
  const controlsRef = useRef(null);
  const [minimapBg, setMinimapBg] = useState(null);
  const [progress, setProgress] = useState({ loaded: 0, total: 1 });
  const [hour, setHour] = useState(14);
  const [weather, setWeather] = useState("clear");
  // Defaults: airport zone matchea el carving (1500×2500), pistas centradas en
  // TFB.9 con orientación 03/21 (-30° del norte).
  const [airport, setAirport] = useState({ x: 0, y: 5.5, z: 0, length: 5000, width: 3000, rotY: -30 });
  const [runway1, setRunway1] = useState({ x: 0, y: 6, z: 0, length: 3700, width: 100, rotY: -30 });
  const [runway2, setRunway2] = useState({ x: 200, y: 6, z: 0, length: 3700, width: 50, rotY: -30 });

  // Cargar OUTER ring (zoom 10, 1114 km) y crop al central 200 km para
  // adaptarse a la zona renderizada (inner15 puede extenderse 87.5 km del
  // origen con shift sur).
  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    let cancelled = false;
    fetchSatelliteCanvas({
      token: MAPBOX_TOKEN,
      lat: TERRAIN_CENTER_LAT,
      lon: TERRAIN_CENTER_LON,
      zoom: WT_OUTER_ZOOM,
      gridSize: WT_OUTER_GRID_SIZE,
    }).then(canvas => {
      if (cancelled) return;
      // Outer canvas center NO está en TERRAIN_CENTER — está en el tile
      // boundary z10, desfasado por snap (~12km). Compensamos para que el
      // crop quede centrado donde queremos en world coords.
      const snap = tileSnapOffsetMM(TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON, WT_OUTER_ZOOM);
      const pxPerMeter = canvas.width / WT_OUTER_WORLD_SIZE;
      // World (mx, mz) → canvas pixel = canvas/2 + (m + snap) * pxPerMeter
      const cropCx = canvas.width / 2 + (MINIMAP_CENTER_X + snap.x) * pxPerMeter;
      const cropCz = canvas.height / 2 + (MINIMAP_CENTER_Z + snap.z) * pxPerMeter;
      const cropPx = MINIMAP_WORLD_SIZE * pxPerMeter;
      const small = document.createElement("canvas");
      small.width = small.height = 280;
      small.getContext("2d").drawImage(
        canvas,
        cropCx - cropPx / 2, cropCz - cropPx / 2, cropPx, cropPx,
        0, 0, 280, 280
      );
      setMinimapBg(small.toDataURL("image/jpeg", 0.85));
    }).catch(err => console.error("Minimap load:", err));
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={{ width: "100vw", height: "100vh", background: "#0b1016" }}>
      <LoadingOverlay loaded={progress.loaded} total={progress.total} />
      <HUD avatarPosRef={avatarPosRef} />
      <Minimap avatarPosRef={avatarPosRef} bgUrl={minimapBg} />
      <WeatherPanel hour={hour} setHour={setHour} weather={weather} setWeather={setWeather} />

      <Canvas
        camera={{ position: [200, 500, 800], fov: 50, near: 1, far: 500000 }}
        gl={{
          logarithmicDepthBuffer: true,
          antialias: true,
          toneMapping: THREE.NoToneMapping,
        }}
        shadows={{ type: THREE.PCFShadowMap }}
      >
        <WeatherSystem hour={hour} weather={weather} />

        <CubeAvatar avatarPosRef={avatarPosRef} />
        <FollowOrbit avatarPosRef={avatarPosRef} controlsRef={controlsRef} />
        <OrbitControls
          ref={controlsRef}
          target={[0, 200, 0]}
          enableDamping
          dampingFactor={0.1}
          minDistance={50}
          maxDistance={20000}
          maxPolarAngle={Math.PI * 0.49}
        />

        {MAPBOX_TOKEN && (
          <OrmuzTerrain
            token={MAPBOX_TOKEN}
            groundY={0}
            onProgress={(loaded, total) => setProgress({ loaded, total })}
          />
        )}

        {/* OSM Airport — runways, taxiways, aprons, terminales, hangares
            extraídos de OpenStreetMap (OIKB / Bandar Abbas Intl). */}
        <OSMAirport y={5.5} />

        {/* Water shader: Gerstner waves geométricas, Fresnel, HDRI reflection,
            sun specular, foam en crestas. Plano sigue cámara, fade a alpha=0
            en 35-45 km para evitar plane-edge halo contra HDRI. Water mask
            del outer z10 satellite — discard sobre tierra. */}
        {/* FFT ocean estático cubriendo todo el área (mismo size que el mask). */}
        <FFTOcean size={WT_OUTER_WORLD_SIZE} segments={512} patchSize={2000} resolution={256} y={-2} followCamera={false} />
      </Canvas>
    </main>
  );
}
