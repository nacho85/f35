"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sky, useGLTF } from "@react-three/drei";
import { EffectComposer } from "@react-three/postprocessing";
import { HeatShimmerEffect } from "../common/HeatShimmerEffect";
import * as THREE from "three";

import F35 from "./F35";
import F35C from "../f35c/F35C";
import F14AIran from "../f14a-iran/F14AIran";
import { HINGE_DEFAULTS as F14_HINGE_DEFAULTS } from "../f14a-iran/F14AIranDebugHinges";
import GulfFallbackTerrain from "../terrain/GulfFallbackTerrain";
import OrmuzTerrain from "../terrain/OrmuzTerrain";

useGLTF.preload("/f-35a.glb");

// ─── Registro de modelos ──────────────────────────────────────────────────────
// Para agregar un nuevo modelo: importarlo arriba y añadir una entrada aquí.

export const PLANE_MODELS = {
  // Todos los modelos a scale=1 (tamaño nativo del GLB — los GLBs estan
  // pre-escalados al ~36% del tamano real del avion).
  F35A: {
    label:            "F-35A",
    Component:        F35,
    scale:            1,
    position:         [0, 0.2, 0],
    rotation:         [0,  0, 0],
    extraProps:       { highlightRearWheelHeuristic: true },
    supportsGear:     true,
    supportsNoseGear: true,
  },
  F35C: {
    label:            "F-35C",
    Component:        F35C,
    scale:            1,
    // Calibrado por bbox: el GLB nativo tiene su origen 1.48m a la derecha del
    // centro geométrico del avión y el fondo de los meshes a 0.6m sobre el origin.
    // X = -1.48 centra fuselage en eje pista. Y = -1.30 baja las ruedas a SURFACE_Y=0.
    position:         [-1.48, -2.2, 0],
    rotation:         [0,  0, 0],
    extraProps:       {},
    supportsGear:     true,
    supportsNoseGear: false,
  },
  F14A: {
    label:            "F-14A Iran",
    Component:        F14AIran,
    scale:            1,
    position:         [0, 1, 0],
    rotation:         [0,  0, 0],
    extraProps:       {
      hinges: F14_HINGE_DEFAULTS(),
      // Piloto sentado en cabina (mismos valores tuneados que el debug scene)
      pilotOffset: { x: 0, y: -0.88, z: 0.33 },
      pilotTilt:   -19,
      pilotScale:  1.37,
      // Nozzle cerrada se mete hacia atras (+Y local = rear) 0.25m, slidea
      // hacia adelante a medida que abre. Mismo valor que el debug scene.
      nozzleClosedOffset: { x: 0, y: 0.25, z: 0 },
      // Parametros del paracaidas (mismo tuneo que el debug scene)
      chuteParams: {
        shoulderOffset: 0.40, offsetX: 0.01, offsetY: 0.85, offsetZ: -0.02,
        riserX: 0.06, riserSep: 0.045, riserWidth: 0.020, riserDepth: 0.006,
        lineWidth: 0.003, confY: -2.61,
      },
    },
    supportsGear:     false,
    supportsNoseGear: true,   // tope ±35° aplicado dentro de F14AIran
  },
};

// ─── Constants ───────────────────────────────────────────────────────────────

const MAPBOX_TOKEN      = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const PLANE_BASE_Y      = 1.8;

// F-35C — especificaciones reales (F135-PW-400)
const MASS            = 22470;   // kg  (peso operativo cargado)
const MAX_THRUST      = 191000;  // N   (F135 postquemador completo)
const WING_AREA       = 62.1;    // m²  (F-35C tiene ala más grande que A/B)
const CD_AERO         = 0.0185;  // coef. de arrastre limpio
const CL_MAX          = 1.45;    // coef. de sustentación máxima (ala grande del C)
const STALL_SPEED     = 62;      // m/s (~120 kt) — stall del F-35C con ala grande

// Motor F135 — inercia de turbina real
const ENGINE_IDLE_N   = 0.08;    // fracción de empuje en idle (~15 kN)
const ENGINE_SPOOL_UP = 0.18;    // k spool-up  (τ ≈ 5.5s, idle→full)
const ENGINE_SPOOL_DN = 0.28;    // k spool-down (τ ≈ 3.5s, full→idle)

const GROUND_MAX_SPEED  = 90;
const TAKEOFF_SPEED     = 74;    // m/s (~144 kt) — rotación F-35C
const FLIGHT_MAX_SPEED  = 580;   // m/s (~1.13 Mach — limitado para el juego)
const MAX_ALTITUDE      = 18288;
const THROTTLE_RESPONSE = 0.55;  // respuesta del lever (más rápida que el motor)
const RUDDER_RATE       = THREE.MathUtils.degToRad(60);

// Aerodinámica F-35C — coeficientes derivados de geometría real
const CL_ALPHA       = 5.5;   // pendiente de CL respecto a AoA (1/rad), típica de caza
const STALL_AOA_RAD  = THREE.MathUtils.degToRad(16);   // AoA crítico
const STALL_AOA_BAND = THREE.MathUtils.degToRad(8);    // ancho del rolloff post-stall
const ASPECT_RATIO   = 2.74;  // span² / area = 13.05² / 62.1
const OSWALD_E       = 0.78;  // factor de eficiencia de Oswald

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function damp(cur, tgt, s) { return THREE.MathUtils.lerp(cur, tgt, s); }
function wrapAngle(a) {
  while (a >  Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function applyDeadzone(value, threshold = 0.12) {
  if (Math.abs(value) < threshold) return 0;
  return Math.sign(value) * (Math.abs(value) - threshold) / (1 - threshold);
}

// ─── Input ───────────────────────────────────────────────────────────────────

function useInputState() {
  const ref = useRef({ accelerate: 0, brake: 0, steer: 0, pitch: 0, rudder: 0, cameraX: 0, cameraY: 0, gamepadConnected: false });
  useEffect(() => {
    const keys = new Set();
    const mouse = { rightDown: false, cameraX: 0, cameraY: 0 };
    const sync = () => {
      ref.current.accelerate = keys.has("KeyW") || keys.has("ArrowUp")   ? 1 : 0;
      ref.current.brake      = keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0;
      const l = keys.has("KeyA") || keys.has("ArrowLeft")  ? 1 : 0;
      const r = keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0;
      ref.current.steer   = r - l;
      ref.current.pitch   = keys.has("Space") ? 1 : 0;
      const yl = keys.has("KeyQ") ? 1 : 0;
      const yr = keys.has("KeyE") ? 1 : 0;
      ref.current.rudder  = yr - yl;
      ref.current.cameraX = mouse.cameraX;
      ref.current.cameraY = mouse.cameraY;
    };
    const onDown = e => { keys.add(e.code);    sync(); };
    const onUp   = e => { keys.delete(e.code); sync(); };
    const onPad  = ()  => { ref.current.gamepadConnected = !!(navigator.getGamepads?.().find(Boolean)); };
    const onMouseDown = e => { if (e.button !== 2) return; e.preventDefault(); mouse.rightDown = true;  mouse.cameraX = 0; mouse.cameraY = 0; sync(); };
    const onMouseUp   = e => { if (e.button !== 2) return; mouse.rightDown = false; mouse.cameraX = 0; mouse.cameraY = 0; sync(); };
    const onMouseMove = e => { if (!mouse.rightDown) return; mouse.cameraX = clamp(e.movementX / 6, -1, 1); mouse.cameraY = clamp(e.movementY / 6, -1, 1); sync(); };
    const onCtx = e => e.preventDefault();
    window.addEventListener("keydown",             onDown);
    window.addEventListener("keyup",               onUp);
    window.addEventListener("gamepadconnected",    onPad);
    window.addEventListener("gamepaddisconnected", onPad);
    window.addEventListener("mousedown",   onMouseDown);
    window.addEventListener("mouseup",     onMouseUp);
    window.addEventListener("mousemove",   onMouseMove);
    window.addEventListener("contextmenu", onCtx);
    onPad();
    return () => {
      window.removeEventListener("keydown",             onDown);
      window.removeEventListener("keyup",               onUp);
      window.removeEventListener("gamepadconnected",    onPad);
      window.removeEventListener("gamepaddisconnected", onPad);
      window.removeEventListener("mousedown",   onMouseDown);
      window.removeEventListener("mouseup",     onMouseUp);
      window.removeEventListener("mousemove",   onMouseMove);
      window.removeEventListener("contextmenu", onCtx);
    };
  }, []);
  return ref;
}

function readControls(inputRef) {
  const pads    = navigator.getGamepads?.() || [];
  const gamepad = pads.find(Boolean);
  if (gamepad) {
    return {
      accelerate:       applyDeadzone(gamepad.buttons[7]?.value ?? 0, 0.03),
      brake:            applyDeadzone(gamepad.buttons[6]?.value ?? 0, 0.03),
      steer:            clamp(applyDeadzone(gamepad.axes[0] ?? 0, 0.16), -1, 1),
      pitch:            clamp(applyDeadzone(gamepad.axes[1] ?? 0, 0.16), -1, 1),
      rudder:           (gamepad.buttons[5]?.value ?? 0) - (gamepad.buttons[4]?.value ?? 0),
      cameraX:          clamp(applyDeadzone(gamepad.axes[2] ?? 0, 0.14), -1, 1),
      cameraY:          clamp(applyDeadzone(gamepad.axes[3] ?? 0, 0.14), -1, 1),
      gamepadConnected: true,
    };
  }
  return { ...inputRef.current, gamepadConnected: false };
}

// ─── Piso infinito — estático, no sigue la cámara ────────────────────────────

// Y de la superficie — coincide con PLANE_BASE_Y=0
const SURFACE_Y = 0;

function InfiniteGround() {
  // Bien por debajo del agua (y=-2) y del seabed del WT terrain (~-77).
  // Sirve solo como respaldo para evitar el "void" si el avión sale del
  // dominio cubierto por agua/terrain (raro). No debería ser visible nunca.
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SURFACE_Y - 100, 0]}>
      <planeGeometry args={[800000, 800000]} />
      <meshStandardMaterial color="#c8a46a" roughness={0.95} metalness={0} />
    </mesh>
  );
}

// ─── Pista ────────────────────────────────────────────────────────────────────

const RWY_LEN   = 3600;
const RWY_WIDTH = 46;
const RWY_Y     = SURFACE_Y + 0.01;

const CENTER_STRIPE_ZS = (() => {
  const zs = [];
  for (let z = -RWY_LEN / 2 + 60; z < RWY_LEN / 2 - 60; z += 60) zs.push(z);
  return zs;
})();

const PIANO_KEY_XS = (() => {
  const count = 12, spread = RWY_WIDTH - 6;
  return Array.from({ length: count }, (_, i) => -spread / 2 + i * (spread / (count - 1)));
})();

const TDZ_OFFSETS = [150, 200, 250, 300, 350, 400];

function RunwayMesh() {
  const matAsphalt  = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1b1f25", roughness: 0.94, metalness: 0.03 }), []);
  const matConcrete = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b8aa94", roughness: 0.98, metalness: 0.0  }), []);
  const matWhite    = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e6e6dc", roughness: 0.80, metalness: 0.0  }), []);

  const geoCenterStripe = useMemo(() => new THREE.PlaneGeometry(0.9, 30),              []);
  const geoEdgeLine     = useMemo(() => new THREE.PlaneGeometry(0.6, RWY_LEN),         []);
  const geoPianoKey     = useMemo(() => new THREE.PlaneGeometry(2.5, 50),              []);
  const geoTdzBar       = useMemo(() => new THREE.PlaneGeometry(RWY_WIDTH * 0.18, 20), []);
  const geoAimPoint     = useMemo(() => new THREE.PlaneGeometry(RWY_WIDTH * 0.22, 50), []);

  const rot = [-Math.PI / 2, 0, 0];
  const stripe = (geo, mat, x, y, z, key) => (
    <mesh key={key} geometry={geo} material={mat} rotation={rot} position={[x, y, z]} receiveShadow />
  );

  return (
    <group>
      <mesh material={matConcrete} rotation={rot} receiveShadow position={[0, SURFACE_Y + 0.006, -RWY_LEN / 2 - 120]}>
        <planeGeometry args={[RWY_WIDTH + 40, 240]} />
      </mesh>
      <mesh material={matConcrete} rotation={rot} receiveShadow position={[0, SURFACE_Y + 0.006,  RWY_LEN / 2 + 120]}>
        <planeGeometry args={[RWY_WIDTH + 40, 240]} />
      </mesh>
      <mesh material={matConcrete} rotation={rot} receiveShadow position={[0, SURFACE_Y + 0.007, -RWY_LEN / 2 - 360]}>
        <planeGeometry args={[300, 240]} />
      </mesh>
      <mesh material={matAsphalt} rotation={rot} receiveShadow position={[0, RWY_Y, 0]}>
        <planeGeometry args={[RWY_WIDTH, RWY_LEN]} />
      </mesh>
      {stripe(geoEdgeLine, matWhite,  RWY_WIDTH / 2 - 0.3, RWY_Y + 0.002, 0, "el-r")}
      {stripe(geoEdgeLine, matWhite, -RWY_WIDTH / 2 + 0.3, RWY_Y + 0.002, 0, "el-l")}
      {CENTER_STRIPE_ZS.map(z => stripe(geoCenterStripe, matWhite, 0, RWY_Y + 0.002, z, `cl-${z}`))}
      {PIANO_KEY_XS.map(x => stripe(geoPianoKey, matWhite, x, RWY_Y + 0.002, -RWY_LEN / 2 + 9, `pn-${x}`))}
      {PIANO_KEY_XS.map(x => stripe(geoPianoKey, matWhite, x, RWY_Y + 0.002,  RWY_LEN / 2 - 9, `pf-${x}`))}
      {[-1, 1].map(side => (
        <group key={`aim-${side}`}>
          {stripe(geoAimPoint, matWhite, -(RWY_WIDTH / 4) + 0.5, RWY_Y + 0.002, side * (RWY_LEN / 2 - 300), `aim-l-${side}`)}
          {stripe(geoAimPoint, matWhite,  (RWY_WIDTH / 4) - 0.5, RWY_Y + 0.002, side * (RWY_LEN / 2 - 300), `aim-r-${side}`)}
        </group>
      ))}
      {[-1, 1].map(side =>
        TDZ_OFFSETS.map(dz => (
          <group key={`tdz-${side}-${dz}`}>
            {stripe(geoTdzBar, matWhite, -(RWY_WIDTH / 4) + 0.3, RWY_Y + 0.002, side * (-RWY_LEN / 2 + dz + (side === 1 ? RWY_LEN - dz * 2 : 0)), `tdzl-${side}-${dz}`)}
            {stripe(geoTdzBar, matWhite,  (RWY_WIDTH / 4) - 0.3, RWY_Y + 0.002, side * (-RWY_LEN / 2 + dz + (side === 1 ? RWY_LEN - dz * 2 : 0)), `tdzr-${side}-${dz}`)}
          </group>
        ))
      )}
    </group>
  );
}

// ─── Cámara ───────────────────────────────────────────────────────────────────

const COCKPIT_PIVOT   = new THREE.Vector3(0, 0.12, 1.35);
const CAM_ORBIT_R     = 36;
const CAM_YAW_LIMIT   = Math.PI * 2;
const CAM_SPEED_YAW   = 2.4;
const CAM_SPRING      = 3.5;
const CAM_ROLL_FOLLOW = 1 - Math.exp(-6 / 60);

const INITIAL_SPAWN_Z       = RWY_LEN / 2 + 60;
const INITIAL_CAMERA_POS    = [0, 2.27, -11.85];
const INITIAL_CAMERA_TARGET = [0, 0.12,  1.35];

// ─── SceneReady ───────────────────────────────────────────────────────────────

function SceneReady({ onReady }) {
  useEffect(() => { onReady(); }, [onReady]);
  return null;
}

// ─── Controlador de vuelo ─────────────────────────────────────────────────────

function FlightControllerBodyAxis({ inputRef, onHudChange, worldRef, onSceneReady, modelKey, pilotEject }) {
  const { Component, scale, position, rotation, extraProps, supportsGear, supportsNoseGear } =
    PLANE_MODELS[modelKey] ?? PLANE_MODELS.F35A;
  const planeRef    = useRef(null);
  const _camVec     = useRef(new THREE.Vector3());
  const _cockpitVec = useRef(new THREE.Vector3());
  const _upVec      = useRef(new THREE.Vector3());
  const _fwdVec     = useRef(new THREE.Vector3());
  const _rightVec   = useRef(new THREE.Vector3());
  const _pitchQ     = useRef(new THREE.Quaternion());
  const _rollQ      = useRef(new THREE.Quaternion());
  const _yawQ       = useRef(new THREE.Quaternion());
  const _targetQ    = useRef(new THREE.Quaternion());
  const _worldUp    = useRef(new THREE.Vector3(0, 1, 0));
  const _accelVec   = useRef(new THREE.Vector3());
  const _vDirVec    = useRef(new THREE.Vector3());
  const _liftDirVec = useRef(new THREE.Vector3());
  // Velocidad mundo del avión, expuesta al modelo para que el eject del piloto
  // herede el momento (sin esto, en climb el piloto parece eyectarse "para abajo"
  // porque el avión sigue subiendo y el piloto arranca con vel=0 en mundo).
  const planeVelRef = useRef(new THREE.Vector3());

  const taxiSteerRef = useRef(0);
  const taxiSpeedRef = useRef(0);
  const prevAirborne = useRef(false);
  const [gearDown, setGearDown] = useState(true);
  const controlsRef  = useRef({ roll: 0, pitch: 0, rudder: 0, throttle: 0, speed: 0, airborne: false });

  const globalX = useRef(0);
  const globalZ = useRef(-INITIAL_SPAWN_Z);

  const sim = useRef({
    throttle:  0,              // posición del lever (0–1), responde rápido
    engineN:   ENGINE_IDLE_N,  // N1 real del motor (0–1), con inercia de turbina
    speed:     0,              // escalar (HUD + ground)
    velocity:  new THREE.Vector3(),  // 3-D world-frame en aire (m/s)
    yaw:       0,
    altitude:  PLANE_BASE_Y,
    airborne:  false,
    hudCooldown: 0,
    cameraYaw:   0,
    cameraPitch: 0,
    attitude:  new THREE.Quaternion(), // identidad — el ground branch slerpea hacia yaw=BND_RUNWAY_HEADING_RAD
  });

  useFrame((state, delta) => {
    if (!planeRef.current) return;

    const ctrl = readControls(inputRef);
    const s    = sim.current;
    const smooth = 1 - Math.exp(-4.5 * delta);

    // ── Lever del acelerador (respuesta rápida) ──────────────────────────────
    s.throttle = clamp(s.throttle + (ctrl.accelerate - ctrl.brake) * THROTTLE_RESPONSE * delta, 0, 1);

    // ── Inercia de turbina F135 (spool-up/down asimétrico) ────────────────────
    // El lever mueve el N1 con τ_up ≈ 5.5 s / τ_down ≈ 3.5 s.
    // El motor nunca baja de idle (ENGINE_IDLE_N) aunque el lever esté a 0.
    const targetN = Math.max(s.throttle, ENGINE_IDLE_N);
    const spoolK  = targetN > s.engineN ? ENGINE_SPOOL_UP : ENGINE_SPOOL_DN;
    s.engineN = clamp(s.engineN + (targetN - s.engineN) * spoolK * delta, ENGINE_IDLE_N, 1.0);

    const pitchInput  = clamp(ctrl.pitch, -1, 1);
    const flightSteer = -clamp(ctrl.steer, -1, 1);
    const taxiSteer   = -clamp(ctrl.steer, -1, 1);

    taxiSteerRef.current = s.airborne ? 0 : taxiSteer;
    taxiSpeedRef.current = s.airborne ? 0 : s.speed;

    if (!s.airborne) {
      // ── Velocidad en tierra — integración de fuerzas ─────────────────────
      // Empuje real del motor N1 − fricción rodadura − frenos
      const thrustGs   = s.engineN * MAX_THRUST / MASS;         // m/s²
      const rollingRes = 0.016 * 9.81;                           // ≈ 0.16 m/s² resistencia rodadura
      const brakeDecel = ctrl.brake * 7.5;                       // máx. ~7.5 m/s² frenos antideslizantes
      // Parking brake: si no hay input de aceleracion, el avion queda quieto
      // (idle thrust > rolling resistance haria creep indefinido sin esto).
      const parkingBrake = (ctrl.accelerate === 0 && s.speed < 1.0) ? 999 : 0;
      const groundAccel = thrustGs - rollingRes - (s.speed > 0.1 ? brakeDecel : 0) - parkingBrake;
      s.speed = clamp(s.speed + groundAccel * delta, 0, GROUND_MAX_SPEED);

      const taxiAuthority = clamp(s.speed / 18, 0, 1);
      const rotAuthority  = clamp((s.speed - TAKEOFF_SPEED * 0.72) / (TAKEOFF_SPEED * 0.28), 0, 1);

      s.yaw += taxiSteer * (0.16 + s.speed / GROUND_MAX_SPEED) * 0.55 * taxiAuthority * delta;

      // Rotación de despegue conservadora — máx ~12° de cabeceo en tierra,
      // típico de la maniobra de rotación real (más empuja al stall).
      const groundPitch = damp(
        planeRef.current.rotation.x,
        -pitchInput * THREE.MathUtils.degToRad(12) * rotAuthority,
        smooth
      );
      _targetQ.current.setFromEuler(new THREE.Euler(groundPitch, s.yaw, 0, "YXZ"));
      s.attitude.slerp(_targetQ.current, 1 - Math.exp(-12 * delta)).normalize();
      s.altitude = PLANE_BASE_Y;

      if (s.speed > TAKEOFF_SPEED && pitchInput > 0.18) {
        s.airborne = true;
        // Forzar actitud a 10° nose-up en transición — sin esto, el slerp en
        // ground branch nunca llega al pitch deseado antes del trigger y el
        // avión despega con AoA insuficiente, vuelve al piso y rebota.
        const e = new THREE.Euler().setFromQuaternion(s.attitude, "YXZ");
        e.x = -THREE.MathUtils.degToRad(10);
        s.attitude.setFromEuler(e).normalize();
        _fwdVec.current.set(0, 0, 1).applyQuaternion(s.attitude).normalize();
        s.velocity.copy(_fwdVec.current).multiplyScalar(s.speed);
        // Boost de altitud inicial para alejarnos del piso y dar tiempo a que
        // el AoA suba antes de que la condición de touchdown reaccione.
        s.altitude = PLANE_BASE_Y + 0.5;
      }

      // Translación tierra → mundo (escalar a lo largo de fwd)
      _fwdVec.current.set(0, 0, 1).applyQuaternion(s.attitude).normalize();
      globalX.current += _fwdVec.current.x * s.speed * delta;
      globalZ.current += _fwdVec.current.z * s.speed * delta;

    } else {
      // ── Controles del piloto: rotación de actitud ─────────────────────────
      // pitch rate limitada por g-load (9g op. F-35) — a baja velocidad alto rate,
      // a alta velocidad bajo rate (radio de giro mínimo). Clamp realista.
      const speedNow  = s.velocity.length();
      const pitchRate = clamp(9 * 9.81 / Math.max(speedNow, TAKEOFF_SPEED), 0.2, 1.0);
      const rollRate  = THREE.MathUtils.degToRad(180);

      _fwdVec.current.set(0, 0, 1).applyQuaternion(s.attitude).normalize();
      _rightVec.current.set(1, 0, 0).applyQuaternion(s.attitude).normalize();
      _upVec.current.set(0, 1, 0).applyQuaternion(s.attitude).normalize();

      // Alpha limiter (estilo FBW F-35): si el AoA actual se acerca al stall,
      // recorta el input de pitch hacia arriba a 0. Sin esto, mantener Space
      // pulsado hace over-rotate → AoA past stall → CL collapsa → no despega.
      let aoaNow = 0;
      if (speedNow > 1) {
        const vF = s.velocity.dot(_fwdVec.current);
        const vU = s.velocity.dot(_upVec.current);
        aoaNow = -Math.atan2(vU, vF);
      }
      const ALPHA_LIMIT = STALL_AOA_RAD - THREE.MathUtils.degToRad(2); // soft 14°
      let limitedPitch = pitchInput;
      if (pitchInput > 0) {
        const headroom = clamp((ALPHA_LIMIT - aoaNow) / THREE.MathUtils.degToRad(6), 0, 1);
        limitedPitch *= headroom;
      } else if (pitchInput < 0) {
        const headroom = clamp((ALPHA_LIMIT + aoaNow) / THREE.MathUtils.degToRad(6), 0, 1);
        limitedPitch *= headroom;
      }

      _pitchQ.current.setFromAxisAngle(_rightVec.current, -limitedPitch * pitchRate * delta);
      s.attitude.premultiply(_pitchQ.current);

      _rollQ.current.setFromAxisAngle(_fwdVec.current, -flightSteer * rollRate * delta);
      s.attitude.premultiply(_rollQ.current);

      _yawQ.current.setFromAxisAngle(_worldUp.current, -ctrl.rudder * RUDDER_RATE * delta);
      s.attitude.premultiply(_yawQ.current);
      s.attitude.normalize();

      // Re-derivar ejes del cuerpo después de las rotaciones
      _fwdVec.current.set(0, 0, 1).applyQuaternion(s.attitude).normalize();
      _rightVec.current.set(1, 0, 0).applyQuaternion(s.attitude).normalize();
      _upVec.current.set(0, 1, 0).applyQuaternion(s.attitude).normalize();

      // ── Aerodinámica 3-D real ─────────────────────────────────────────────
      // F = empuje (fwd) + drag (-vDir) + lift (perp. a vel) + gravedad (-y)
      // Lift y drag dependen de presión dinámica q = ½ρv² · CL depende del AoA real
      // (ángulo entre fwd y vector velocidad), no de la velocidad — ese era el bug.
      const speed = s.velocity.length();
      const rho   = 1.225 * Math.exp(-s.altitude / 8500);
      const q     = 0.5 * rho * speed * speed;

      // AoA: ángulo entre nariz del avión (fwd) y vector velocidad real, medido
      // en plano de cabeceo. >0 cuando la nariz apunta arriba del vector de vuelo.
      let aoa = 0;
      if (speed > 1) {
        const vFwd = s.velocity.dot(_fwdVec.current);
        const vUp  = s.velocity.dot(_upVec.current);
        aoa = -Math.atan2(vUp, vFwd);
      }

      // Coef. sustentación: lineal con AoA · stall por encima del crítico
      let CL = CL_ALPHA * aoa;
      let stallFraction = 0;
      if (Math.abs(aoa) > STALL_AOA_RAD) {
        stallFraction = clamp((Math.abs(aoa) - STALL_AOA_RAD) / STALL_AOA_BAND, 0, 1);
        CL *= (1 - stallFraction * 0.85);
      }
      CL = clamp(CL, -CL_MAX, CL_MAX);

      // Coef. drag total = parásito + inducido (CL² / (π·AR·e))
      const CD_INDUCED = (CL * CL) / (Math.PI * ASPECT_RATIO * OSWALD_E);
      const CD_TOTAL   = CD_AERO + CD_INDUCED;

      const thrustN = s.engineN * MAX_THRUST;
      const dragN   = q * CD_TOTAL * WING_AREA;
      const liftN   = q * CL       * WING_AREA;

      // Acumular fuerzas en aceleración (en m/s²)
      _accelVec.current.set(0, -9.81, 0);                                   // gravedad
      _accelVec.current.addScaledVector(_fwdVec.current, thrustN / MASS);    // empuje

      if (speed > 0.1) {
        _vDirVec.current.copy(s.velocity).divideScalar(speed);
        _accelVec.current.addScaledVector(_vDirVec.current, -dragN / MASS); // drag
        // Lift: perpendicular al vector velocidad, en el plano (vel, planeUp).
        // vDir × right (regla mano derecha) → +Y mundo cuando avión nivelado.
        // Si era right × vDir, lift apuntaba hacia abajo (bug que hacía que
        // el avión nunca despegara aunque CL fuera correcto).
        _liftDirVec.current.crossVectors(_vDirVec.current, _rightVec.current).normalize();
        _accelVec.current.addScaledVector(_liftDirVec.current, liftN / MASS);
      }

      // Integrar velocidad
      s.velocity.addScaledVector(_accelVec.current, delta);
      const newSpeed = s.velocity.length();
      if (newSpeed > FLIGHT_MAX_SPEED) {
        s.velocity.multiplyScalar(FLIGHT_MAX_SPEED / newSpeed);
      }

      // Integrar posición (mundo via floating origin + altitud)
      globalX.current += s.velocity.x * delta;
      s.altitude     += s.velocity.y * delta;
      globalZ.current += s.velocity.z * delta;
      s.altitude      = clamp(s.altitude, PLANE_BASE_Y, MAX_ALTITUDE);

      // Velocidad escalar para HUD / superficies de control
      s.speed = newSpeed > FLIGHT_MAX_SPEED ? FLIGHT_MAX_SPEED : newSpeed;

      // Touchdown: requiere descenso real (no rozar). Sin esto el clamp de
      // altitud a PLANE_BASE_Y dispara touchdown frame-a-frame y rebotamos.
      if (s.altitude <= PLANE_BASE_Y && s.velocity.y < -1.0) {
        s.airborne = false;
        s.speed    = Math.hypot(s.velocity.x, s.velocity.z);
        s.velocity.set(0, 0, 0);
        const e = new THREE.Euler().setFromQuaternion(s.attitude, "YXZ");
        s.yaw = wrapAngle(e.y);
        _targetQ.current.setFromEuler(new THREE.Euler(0, s.yaw, 0, "YXZ"));
        s.attitude.copy(_targetQ.current);
      }
    }

    _fwdVec.current.set(0, 0, 1).applyQuaternion(s.attitude).normalize();

    planeRef.current.position.set(0, s.altitude, 0);
    planeRef.current.quaternion.copy(s.attitude);

    if (worldRef?.current) {
      worldRef.current.position.x = -globalX.current;
      worldRef.current.position.z = -globalZ.current;
    }

    // Exportar velocidad mundo del avión al modelo (para que el eject herede el momento)
    if (s.airborne) planeVelRef.current.copy(s.velocity);
    else            planeVelRef.current.set(0, 0, 0);

    s.cameraYaw = clamp(s.cameraYaw + ctrl.cameraX * CAM_SPEED_YAW * delta, -CAM_YAW_LIMIT, CAM_YAW_LIMIT);
    if (Math.abs(ctrl.cameraX) < 0.08) {
      s.cameraYaw = damp(s.cameraYaw, 0, 1 - Math.exp(-CAM_SPRING * delta));
    }

    const CAM_PITCH_MIN = -0.25;  // ~-14° (no ir bajo el avión)
    const CAM_PITCH_MAX =  1.2;   // ~+69° (casi cenital)
    s.cameraPitch = clamp(s.cameraPitch - ctrl.cameraY * CAM_SPEED_YAW * delta, CAM_PITCH_MIN, CAM_PITCH_MAX);
    if (Math.abs(ctrl.cameraY) < 0.08) {
      s.cameraPitch = damp(s.cameraPitch, 0, 1 - Math.exp(-CAM_SPRING * delta));
    }

    planeRef.current.updateMatrixWorld(true);

    const camR = CAM_ORBIT_R * Math.cos(s.cameraPitch);
    const camY = CAM_ORBIT_R * Math.sin(s.cameraPitch) + 2.15;
    _camVec.current
      .set(Math.sin(s.cameraYaw) * camR, camY, -Math.cos(s.cameraYaw) * camR)
      .add(COCKPIT_PIVOT);
    planeRef.current.localToWorld(_camVec.current);

    _cockpitVec.current.copy(COCKPIT_PIVOT);
    planeRef.current.localToWorld(_cockpitVec.current);

    _upVec.current.set(0, 1, 0);
    planeRef.current.localToWorld(_upVec.current);
    _upVec.current.sub(planeRef.current.position).normalize();

    const upAlpha = 1 - Math.exp(Math.log(1 - CAM_ROLL_FOLLOW) * delta * 60);
    state.camera.position.copy(_camVec.current);
    state.camera.up.lerp(_upVec.current, upAlpha).normalize();
    state.camera.lookAt(_cockpitVec.current);

    if (s.airborne !== prevAirborne.current) {
      prevAirborne.current = s.airborne;
      setGearDown(!s.airborne);
    }

    controlsRef.current.roll     = flightSteer;
    controlsRef.current.pitch    = pitchInput;
    controlsRef.current.rudder   = ctrl.rudder ?? 0;
    controlsRef.current.throttle = s.engineN;   // N1 real → superficies de control
    controlsRef.current.speed    = s.speed;
    controlsRef.current.airborne = s.airborne;

    s.hudCooldown -= delta;
    if (s.hudCooldown <= 0) {
      onHudChange({ throttle: s.throttle, engineN: s.engineN, speed: s.speed, altitude: s.altitude, airborne: s.airborne, gamepadConnected: ctrl.gamepadConnected });
      s.hudCooldown = 0.06;
    }
  });

  // DEBUG: exponer planeRef para inspección de bbox
  useEffect(() => {
    if (typeof window !== "undefined" && planeRef.current) {
      window.__planeRef = planeRef.current;
    }
  });

  return (
    <group ref={planeRef} position={[0, PLANE_BASE_Y, 0]}>
      <Suspense fallback={null}>
        <Component
          scale={scale}
          position={position}
          rotation={rotation}
          gearDown={supportsGear ? gearDown : undefined}
          noseGearSteerRef={supportsNoseGear ? taxiSteerRef : undefined}
          taxiSpeedRef={taxiSpeedRef}
          controlsRef={controlsRef}
          pilotEject={pilotEject}
          planeVelRef={planeVelRef}
          debug={false}
          {...extraProps}
        />
        <SceneReady onReady={onSceneReady} />
      </Suspense>
    </group>
  );
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

function Hud({ throttle, engineN, speed, altitude, airborne, gamepadConnected, modelLabel }) {
  return (
    <div style={{
      position: "absolute", zIndex: 10, top: 16, left: 16,
      width: 340, padding: 14, borderRadius: 12,
      background: "rgba(6,10,18,0.76)",
      border: "1px solid rgba(173,191,214,0.16)",
      color: "#eef4ff", fontFamily: "monospace",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{modelLabel} · Golfo Pérsico</div>
      <div style={{ fontSize: 13, lineHeight: 1.65, color: "#bdd0ea", marginBottom: 8 }}>
        <div>Lever    : {(throttle * 100).toFixed(0)} %</div>
        <div>Motor N1 : {(engineN  * 100).toFixed(0)} %</div>
        <div>Velocidad: {(speed * 1.94384).toFixed(0)} kt</div>
        <div>Altitud  : {altitude.toFixed(0)} m</div>
        <div>Estado   : {airborne ? "✈ En vuelo" : "🛞 Rodando"}</div>
      </div>
      <div style={{ fontSize: 12, color: "#7a9ec4" }}>
        {gamepadConnected
          ? "R2 acelera · L2 frena · stick izq. vuela · stick der. cámara · L1/R1 timón"
          : "W/S acelera-frena · A/D alabeo · Space nariz arriba · Q/E timón"}
      </div>
    </div>
  );
}

// ─── Escena principal ─────────────────────────────────────────────────────────

export default function F35Scene() {
  const inputRef = useInputState();
  const worldRef = useRef();
  const [hud, setHud] = useState({ throttle: 0, engineN: ENGINE_IDLE_N, speed: 0, altitude: 0, airborne: false, gamepadConnected: false });
  const [visible, setVisible] = useState(false);
  const [modelKey, setModelKey] = useState("F14A");
  const [pilotEject, setPilotEject] = useState(false);
  const [prevModelKey, setPrevModelKey] = useState(modelKey);
  // Reset eject al cambiar de modelo — pattern de "reset state on prop change"
  // segun docs de React (durante render, no en effect).
  if (prevModelKey !== modelKey) {
    setPrevModelKey(modelKey);
    setPilotEject(false);
  }
  // Eyectar con KeyJ.
  useEffect(() => {
    const onDown = e => { if (e.code === "KeyJ") setPilotEject(true); };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);

  return (
    <main style={{ width: "100vw", height: "100vh", background: "#0b1016" }}>
      <Hud {...hud} modelLabel={PLANE_MODELS[modelKey].label} />

      <div style={{
        position: "absolute", zIndex: 10, top: 16, right: 16,
        display: "flex", gap: 8,
      }}>
        {Object.entries(PLANE_MODELS).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setModelKey(key)}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(173,191,214,0.3)",
              background: modelKey === key ? "rgba(100,160,230,0.25)" : "rgba(6,10,18,0.76)",
              color: modelKey === key ? "#eef4ff" : "#7a9ec4",
              fontFamily: "monospace", fontSize: 13, cursor: "pointer",
              backdropFilter: "blur(12px)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <Canvas
        style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s" }}
        camera={{ position: INITIAL_CAMERA_POS, fov: 52, near: 0.5, far: 200000 }}
        shadows={{ type: THREE.PCFShadowMap }}
        gl={{ logarithmicDepthBuffer: true, antialias: true }}
        onCreated={({ camera }) => { camera.lookAt(...INITIAL_CAMERA_TARGET); }}
      >
        <color attach="background" args={["#87ceeb"]} />
        {/* FogExp2 con densidad baja → perspectiva atmosférica DCS-like
            sin tapar el horizonte. ~50 % visibilidad a 14 km. */}
        <fogExp2 attach="fog" args={["#b8d8ea", 0.00005]} />

        <ambientLight intensity={1.0} />
        <hemisphereLight args={["#ddeeff", "#c8aa6a", 1.3]} />
        <directionalLight
          position={[80, 150, -60]} intensity={2.6} castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-near={1}     shadow-camera-far={8000}
          shadow-camera-left={-2000} shadow-camera-right={2000}
          shadow-camera-top={2000}   shadow-camera-bottom={-2000}
        />
        <Sky distance={450000} sunPosition={[80, 150, -60]} inclination={0.52} azimuth={0.22} />

        {/* Piso de arena infinito — estático, no sigue la cámara */}
        <InfiniteGround />

        {/* Mundo geográfico — se translada con el origen flotante */}
        <group ref={worldRef} position={[0, 0, INITIAL_SPAWN_Z]}>
          {MAPBOX_TOKEN
            ? <OrmuzTerrain token={MAPBOX_TOKEN} groundY={SURFACE_Y} />
            : <GulfFallbackTerrain groundY={SURFACE_Y} />
          }
          <RunwayMesh />
          {/* DEBUG: marcador rojo de la pista de Bandar Abbas (OIKB).
              Heading 030° (NNE), 4000m × 60m. */}
          <mesh
            rotation={[-Math.PI / 2, 0, -(25 * Math.PI) / 180]}
            position={[+150, SURFACE_Y + 1.0, +109]}
          >
            <planeGeometry args={[60, 4000]} />
            <meshBasicMaterial color={0xff0033} transparent opacity={0.55} />
          </mesh>
        </group>

        {/* Agua infinita del Golfo — plano 200×200 km con shader de Water
        <FlightControllerBodyAxis
          inputRef={inputRef}
          onHudChange={setHud}
          worldRef={worldRef}
          onSceneReady={() => setVisible(true)}
          modelKey={modelKey}
          pilotEject={pilotEject}
        />

        <EffectComposer multisampling={0}>
          <HeatShimmerEffect strength={1} />
        </EffectComposer>
      </Canvas>
    </main>
  );
}
