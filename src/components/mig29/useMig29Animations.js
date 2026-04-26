"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const CANOPY_NODE    = "Object_6";
const CANOPY_FRAME   = null;
const LANDING_OFF    = "Object_14";   // bay covers (gear stowed)
const LANDING_ON_OLD = "Object_16";   // static deployed mesh (mig-29.glb sin rig)
const LANDING_LIGHT  = "Object_18";

// Duración total deploy/retract en segundos
const GEAR_DURATION = 5.5;

// Timing offsets por tipo de clip (en fracción de gearProgress, 0-1)
// Doors abren antes (primeros 60% del recorrido)
// Nose strut sale más tarde (segunda mitad del recorrido)
// Main gear sigue progreso completo
const DOOR_SCALE  = 0.57;   // doors completan en 57% del progress   // doors completan en 57% del progress (tope visual)
const NOSE_OFFSET = 0.20;   // nose strut arranca al 20% del progress

/**
 * @param {object}   scene       - objeto THREE.Group raíz del GLB
 * @param {object}   nodes       - mapa plano de nodos { [name]: Object3D }
 * @param {Array}    animations  - array de THREE.AnimationClip del GLB
 * @param {object}   opts
 */
export default function useMig29Animations(scene, nodes, animations, { canopyOpen = false, gearDown = false, gearProgressOverride = null } = {}) {
  const pivot        = useRef(null);
  const landingOff   = useRef([]);     // todos los primitives de Object_14
  const landingOn    = useRef(null);   // solo mig-29.glb sin rig
  const landingLght  = useRef(null);
  const mixer        = useRef(null);
  // Acciones por tipo: { main: [], nose: [], door: [] }
  const gearActionsByType = useRef({ main: [], nose: [], door: [] });
  const gearProgress = useRef(0);
  const init         = useRef(false);

  useEffect(() => {
    if (init.current) return;

    // ── canopy ──────────────────────────────────────────────────────────────
    const canopyMesh = CANOPY_NODE ? (nodes[CANOPY_NODE] ?? null) : null;
    if (canopyMesh) {
      const box    = new THREE.Box3().setFromObject(canopyMesh);
      const hingeX = box.min.x;

      const p = new THREE.Object3D();
      p.position.set(hingeX, canopyMesh.position.y, canopyMesh.position.z);
      canopyMesh.parent.add(p);
      canopyMesh.position.x -= hingeX;
      p.add(canopyMesh);

      const frameMesh = CANOPY_FRAME ? (nodes[CANOPY_FRAME] ?? null) : null;
      if (frameMesh) {
        frameMesh.position.x -= hingeX;
        p.add(frameMesh);
      }

      pivot.current = p;
    }

    // ── landing gear ─────────────────────────────────────────────────────────
    landingLght.current = nodes[LANDING_LIGHT]  ?? null;

    // Object_14 tiene múltiples primitives con el mismo nombre → traverse para agarrar todos
    scene.traverse(o => { if (o.name === LANDING_OFF) landingOff.current.push(o); });


    // gear_nose: siempre visible — el fuselaje y las compuertas lo tapan cuando está recogido

    const allGearClips = (animations ?? []).filter(
      c => c.name.startsWith("GearDeploy") || c.name.startsWith("GearNose") || c.name.startsWith("GearDoor")
    );

    if (allGearClips.length > 0 && scene) {
      // ── MODO RIGGED (mig-29-iran.glb con pivots animados) ──────────────────
      const m = new THREE.AnimationMixer(scene);
      mixer.current = m;

      for (const clip of allGearClips) {
        const action = m.clipAction(clip);
        action.loop              = THREE.LoopOnce;
        action.clampWhenFinished = true;
        action.play();
        action.paused = true;
        action.time   = 0;

        if (clip.name.startsWith("GearNose")) {
          gearActionsByType.current.nose.push(action);
        } else if (clip.name.startsWith("GearDoor")) {
          gearActionsByType.current.door.push(action);
        } else {
          gearActionsByType.current.main.push(action);
        }
      }

      // En modo rigged Object_16 ya no existe; bay doors siguen en Object_14
    } else {
      // ── MODO LEGACY (mig-29.glb sin rig) ─────────────────────────────────
      landingOn.current = nodes[LANDING_ON_OLD] ?? null;
    }

    if (landingOn.current)   landingOn.current.visible   = false;
    if (landingLght.current) landingLght.current.visible = false;

    init.current = true;
  }, [scene, nodes, animations]);

  useFrame((_, delta) => {
    // ── canopy ──────────────────────────────────────────────────────────────
    if (pivot.current) {
      const target = canopyOpen ? 0.3 : 0;
      pivot.current.rotation.y += (target - pivot.current.rotation.y) * 0.10;
    }

    // ── gear progress (compartido ambos modos) ────────────────────────────
    if (gearProgressOverride !== null) {
      gearProgress.current = THREE.MathUtils.clamp(gearProgressOverride, 0, 1);
    } else {
      const targetProgress = gearDown ? 1 : 0;
      const step = delta / GEAR_DURATION;
      gearProgress.current = THREE.MathUtils.clamp(
        gearProgress.current + (targetProgress > gearProgress.current ? step : -step),
        0, 1
      );
    }
    const p = gearProgress.current;

    const { main, nose, door } = gearActionsByType.current;

    if (mixer.current && (main.length > 0 || nose.length > 0 || door.length > 0)) {
      // ── MODO RIGGED ───────────────────────────────────────────────────────

      // Main gear: progreso lineal completo
      // p=1 (desplegado) → time=0; p=0 (recogido) → time=duration
      if (main.length > 0) {
        const dur = main[0].getClip().duration;
        main.forEach(a => { a.time = (1 - p) * dur; });
      }

      // Nose doors: abren más rápido — completan en DOOR_SCALE fracción de p
      // p=0.60+ → completamente abierto (deplegar) / cerrado (recoger)
      if (door.length > 0) {
        const dur = door[0].getClip().duration;
        const pDoor = THREE.MathUtils.clamp(p / DOOR_SCALE, 0, 1);
        door.forEach(a => { a.time = pDoor * dur; });
      }

      // Nose strut: sale más tarde — arranca en NOSE_OFFSET fracción de p
      const pNose = THREE.MathUtils.clamp((p - NOSE_OFFSET) / (1 - NOSE_OFFSET), 0, 1);
      if (nose.length > 0) {
        const dur = nose[0].getClip().duration;
        nose.forEach(a => { a.time = (1 - pNose) * dur; });
      }

      mixer.current.update(0);   // fuerza pose sin avanzar tiempo

      if (landingLght.current) landingLght.current.visible = p > 0.95;

    } else {
      // ── MODO LEGACY ──────────────────────────────────────────────────────
      if (landingOn.current) landingOn.current.visible = gearDown;
      if (landingLght.current) landingLght.current.visible = gearDown;
    }

    // Object_14 = bay covers (posición plegada): visible solo cuando gear completamente recogido
    if (landingOff.current.length > 0) {
      const showClosed = p < 0.05;
      for (const o of landingOff.current) o.visible = showClosed;
    }
  });
}
