"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sky, useGLTF } from "@react-three/drei";
import * as THREE from "three";

import F35 from "./F35";
import F35C from "./F35C";
import GulfReferenceTerrain from "./terrain/GulfReferenceTerrain";
import GulfFallbackTerrain from "./terrain/GulfFallbackTerrain";

useGLTF.preload("/f-35a.glb");

// ─── Registro de modelos ──────────────────────────────────────────────────────
// Para agregar un nuevo modelo: importarlo arriba y añadir una entrada aquí.

export const PLANE_MODELS = {
  F35A: {
    label:            "F-35A",
    Component:        F35,
    scale:            0.36,
    position:         [0, -1, 0],
    rotation:         [0,  0, 0],
    extraProps:       { highlightRearWheelHeuristic: true },
    supportsGear:     true,
    supportsNoseGear: true,
  },
  F35C: {
    label:            "F-35C",
    Component:        F35C,
    scale:            0.36,
    position:         [0, -1, 0],
    rotation:         [0,  0, 0],
    extraProps:       {},
    supportsGear:     true,
    supportsNoseGear: false,
  },
};

// ─── Constants ───────────────────────────────────────────────────────────────

const MAPBOX_TOKEN      = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const PLANE_BASE_Y      = 1.8;

// F-35A — especificaciones reales
const MASS            = 22470;   // kg  (peso operativo cargado)
const MAX_THRUST      = 191000;  // N   (F135 con postquemador completo)
const WING_AREA       = 42.7;    // m²
const CD_AERO         = 0.019;   // coef. de arrastre aerodinámico (terminal ≈ 612 m/s)
const CD_BRAKE        = 0.10;    // frenos aerodinámicos auto al cortar motor (feel de juego)
const STALL_SPEED     = 68;      // m/s — bajo esta velocidad comienza la pérdida de sustentación

const GROUND_MAX_SPEED  = 90;
const TAKEOFF_SPEED     = 77;
const FLIGHT_MAX_SPEED  = 625;
const MAX_ALTITUDE      = 18288;
const THROTTLE_RESPONSE = 0.3;
const RUDDER_RATE       = THREE.MathUtils.degToRad(60); // 60°/s máx guiñada por timón

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
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SURFACE_Y - 0.5, 0]}>
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
const CAM_ORBIT_R     = 13.2;
const CAM_YAW_LIMIT   = Math.PI;
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

function FlightControllerBodyAxis({ inputRef, onHudChange, worldRef, onSceneReady, modelKey }) {
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

  const taxiSteerRef = useRef(0);
  const taxiSpeedRef = useRef(0);
  const prevAirborne = useRef(false);
  const [gearDown, setGearDown] = useState(true);
  const controlsRef  = useRef({ roll: 0, pitch: 0, rudder: 0, throttle: 0, speed: 0, airborne: false });

  const globalX = useRef(0);
  const globalZ = useRef(-INITIAL_SPAWN_Z);

  const sim = useRef({
    throttle: 0,
    speed: 0,
    yaw: 0,
    altitude: PLANE_BASE_Y,
    airborne: false,
    hudCooldown: 0,
    cameraYaw: 0,
    attitude: new THREE.Quaternion(), // identidad — nariz hacia +Z
  });

  useFrame((state, delta) => {
    if (!planeRef.current) return;

    const ctrl = readControls(inputRef);
    const s    = sim.current;
    const smooth = 1 - Math.exp(-4.5 * delta);

    s.throttle = clamp(s.throttle + (ctrl.accelerate - ctrl.brake) * THROTTLE_RESPONSE * delta, 0, 1);

    const pitchInput  = clamp(ctrl.pitch, -1, 1);
    const flightSteer = -clamp(ctrl.steer, -1, 1);
    const taxiSteer   = -clamp(ctrl.steer, -1, 1);

    taxiSteerRef.current = s.airborne ? 0 : taxiSteer;
    taxiSpeedRef.current = s.airborne ? 0 : s.speed;

    if (!s.airborne) {
      // Velocidad en tierra — lerp simple hacia objetivo de acelerador
      const targetSpeed = s.throttle * GROUND_MAX_SPEED;
      const speedTC = s.speed < targetSpeed
        ? 1 - Math.exp(-0.4 * delta)
        : 1 - Math.exp(-1.8 * delta);
      s.speed = damp(s.speed, targetSpeed, speedTC);

      const taxiAuthority = clamp(s.speed / 18, 0, 1);
      const rotAuthority  = clamp((s.speed - TAKEOFF_SPEED * 0.72) / (TAKEOFF_SPEED * 0.28), 0, 1);

      s.yaw += taxiSteer * (0.16 + s.speed / GROUND_MAX_SPEED) * 0.55 * taxiAuthority * delta;

      const groundPitch = damp(
        planeRef.current.rotation.x,
        -pitchInput * THREE.MathUtils.degToRad(28) * rotAuthority,
        smooth
      );
      _targetQ.current.setFromEuler(new THREE.Euler(groundPitch, s.yaw, 0, "YXZ"));
      s.attitude.slerp(_targetQ.current, 1 - Math.exp(-12 * delta)).normalize();
      s.altitude = PLANE_BASE_Y;

      if (s.speed > TAKEOFF_SPEED && pitchInput > 0.18) s.airborne = true;

    } else {
      // ── Controles del piloto ─────────────────────────────────────────────
      const pitchRate = clamp(14 * 9.81 / Math.max(s.speed, TAKEOFF_SPEED), 0.3, 1.8);
      const rollRate  = THREE.MathUtils.degToRad(180);

      _fwdVec.current.set(0, 0, 1).applyQuaternion(s.attitude).normalize();
      _rightVec.current.set(1, 0, 0).applyQuaternion(s.attitude).normalize();

      _pitchQ.current.setFromAxisAngle(_rightVec.current, -pitchInput * pitchRate * delta);
      s.attitude.premultiply(_pitchQ.current);

      _rollQ.current.setFromAxisAngle(_fwdVec.current, -flightSteer * rollRate * delta);
      s.attitude.premultiply(_rollQ.current);
      s.attitude.normalize();

      // ── Pérdida aerodinámica (stall) ─────────────────────────────────────
      // Ocurre cuando la velocidad cae bajo STALL_SPEED, o cuando el piloto
      // tira demasiado de la nariz a baja velocidad (ángulo de ataque excesivo).
      // Efecto: la nariz baja sola hacia la gravedad hasta que la velocidad se recupera.
      _rightVec.current.set(1, 0, 0).applyQuaternion(s.attitude).normalize();
      const aoaOverload   = Math.max(pitchInput, 0) *
        clamp(1 - s.speed / (TAKEOFF_SPEED * 1.4), 0, 1);
      const stallFraction = clamp(
        (1 - s.speed / STALL_SPEED) + aoaOverload * 1.5,
        0, 1
      );
      if (stallFraction > 0.05) {
        // Momento de cabeceo negativo — la nariz baja hacia la gravedad
        _pitchQ.current.setFromAxisAngle(_rightVec.current, stallFraction * 1.2 * delta);
        s.attitude.premultiply(_pitchQ.current);
      }

      // ── Timón de dirección (guiñada) ─────────────────────────────────────
      // L1 / KeyQ = guiñada izquierda · R1 / KeyE = guiñada derecha
      _yawQ.current.setFromAxisAngle(_worldUp.current, -ctrl.rudder * RUDDER_RATE * delta);
      s.attitude.premultiply(_yawQ.current);
      s.attitude.normalize();

      _fwdVec.current.set(0, 0, 1).applyQuaternion(s.attitude).normalize();

      // ── Física de velocidad: F = Empuje − Arrastre ± Gravedad sobre trayectoria ──
      // Densidad del aire (ISA simplificado: −1.2 % por cada 100 m de altitud)
      const rho         = 1.225 * Math.exp(-s.altitude / 8500);
      const q           = 0.5 * rho * s.speed * s.speed;
      // Frenos aerodinámicos se despliegan automáticamente al cortar el motor
      const cd          = CD_AERO + (s.throttle < 0.05 ? CD_BRAKE : 0);
      const dragAccel   = q * cd * WING_AREA / MASS;
      const thrustAccel = s.throttle * MAX_THRUST / MASS;
      // Componente de la gravedad sobre el eje de vuelo:
      //   nariz arriba  → frena  (fwdVec.y > 0)
      //   nariz abajo   → acelera (fwdVec.y < 0)
      const gravAlongFwd = -9.81 * _fwdVec.current.y;
      s.speed = clamp(s.speed + (thrustAccel - dragAccel + gravAlongFwd) * delta, 0, FLIGHT_MAX_SPEED);

      // ── Altitud: sustentación cancela la gravedad perpendicular al vuelo ──
      // La pérdida reduce la sustentación → el avión cae aunque no baje la nariz
      const liftFactor = clamp(s.speed / TAKEOFF_SPEED, 0, 1) * (1 - stallFraction * 0.85);
      const gravity    = 9.81 * (1 - liftFactor * liftFactor);

      s.altitude += _fwdVec.current.y * s.speed * delta - gravity * delta;
      s.altitude  = clamp(s.altitude, PLANE_BASE_Y, MAX_ALTITUDE);

      if (s.altitude <= PLANE_BASE_Y) {
        s.airborne = false;
        const e = new THREE.Euler().setFromQuaternion(s.attitude, "YXZ");
        s.yaw = wrapAngle(e.y);
        _targetQ.current.setFromEuler(new THREE.Euler(0, s.yaw, 0, "YXZ"));
        s.attitude.copy(_targetQ.current);
      }
    }

    _fwdVec.current.set(0, 0, 1).applyQuaternion(s.attitude).normalize();
    globalX.current += _fwdVec.current.x * s.speed * delta;
    globalZ.current += _fwdVec.current.z * s.speed * delta;

    planeRef.current.position.set(0, s.altitude, 0);
    planeRef.current.quaternion.copy(s.attitude);

    if (worldRef?.current) {
      worldRef.current.position.x = -globalX.current;
      worldRef.current.position.z = -globalZ.current;
    }

    s.cameraYaw = clamp(s.cameraYaw + ctrl.cameraX * CAM_SPEED_YAW * delta, -CAM_YAW_LIMIT, CAM_YAW_LIMIT);
    if (Math.abs(ctrl.cameraX) < 0.08) {
      s.cameraYaw = damp(s.cameraYaw, 0, 1 - Math.exp(-CAM_SPRING * delta));
    }

    planeRef.current.updateMatrixWorld(true);

    _camVec.current
      .set(Math.sin(s.cameraYaw) * CAM_ORBIT_R, 2.15, -Math.cos(s.cameraYaw) * CAM_ORBIT_R)
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
    controlsRef.current.throttle = s.throttle;
    controlsRef.current.speed    = s.speed;
    controlsRef.current.airborne = s.airborne;

    s.hudCooldown -= delta;
    if (s.hudCooldown <= 0) {
      onHudChange({ throttle: s.throttle, speed: s.speed, altitude: s.altitude, airborne: s.airborne, gamepadConnected: ctrl.gamepadConnected });
      s.hudCooldown = 0.06;
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
          taxiSpeedRef={supportsNoseGear ? taxiSpeedRef : undefined}
          controlsRef={controlsRef}
          debug={false}
          {...extraProps}
        />
        <SceneReady onReady={onSceneReady} />
      </Suspense>
    </group>
  );
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

function Hud({ throttle, speed, altitude, airborne, gamepadConnected, modelLabel }) {
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
        <div>Throttle : {(throttle * 100).toFixed(0)} %</div>
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
  const [hud, setHud] = useState({ throttle: 0, speed: 0, altitude: 0, airborne: false, gamepadConnected: false });
  const [visible, setVisible] = useState(false);
  const [modelKey, setModelKey] = useState("F35C");

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
        onCreated={({ camera }) => { camera.lookAt(...INITIAL_CAMERA_TARGET); }}
      >
        <color attach="background" args={["#87ceeb"]} />
        <fog   attach="fog"        args={["#b8d8ea", 3000, 120000]} />

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
            ? <GulfReferenceTerrain token={MAPBOX_TOKEN} groundY={SURFACE_Y} />
            : <GulfFallbackTerrain groundY={SURFACE_Y} />
          }
          <RunwayMesh />
        </group>

        <FlightControllerBodyAxis
          inputRef={inputRef}
          onHudChange={setHud}
          worldRef={worldRef}
          onSceneReady={() => setVisible(true)}
          modelKey={modelKey}
        />
      </Canvas>
    </main>
  );
}
