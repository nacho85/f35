"use client";

// Piloto sentado reutilizable. Carga PilotOriginal.glb, clona la escena con
// armature, captura bones de piernas/brazos/torso/shins y aplica una pose
// configurable. Sin lógica de eyección — solo render estático del piloto.
//
// Render via JSX <primitive>, así R3F maneja el parenting automatico.

import { useRef, useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  Quaternion, Vector3, AnimationMixer, LoopOnce,
} from "three";
import { clone as cloneSkinnedScene } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Parachute } from "./Parachute";
import { SmokeCloud } from "./SmokeCloud";
import { SeatRocketFlame } from "./SeatRocketFlame";

const _UPRIGHT_Q = new Quaternion();  // identidad — destino del slerp post-eyeccion

export const DEFAULT_PILOT_POSE = {
  elbow: 27, shoulderIn: -13, shoulderFwd: 20,
  forearmOut: 17, forearmDown: 4, forearmZ: -6, forearmRoll: 60,
  torso: 8, kneeExt: 30,
};

export function applyPilotPose(b, pose) {
  if (!b) return;
  const p = pose ? { ...DEFAULT_PILOT_POSE, ...pose } : DEFAULT_PILOT_POSE;
  // rArm = override del brazo derecho (sino usa los globales)
  const r = pose?.rArm ? { ...p, ...pose.rArm } : p;

  // L/R en bone names = perspectiva del piloto. El usuario ve el "derecho"
  // como L_ del bone (mirando al piloto desde adelante).
  const elbowQL = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI * r.elbow / 180);
  const elbowQR = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI * p.elbow / 180);
  const forearmOutQL  = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0),  Math.PI * r.forearmOut / 180);
  const forearmOutQR  = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0),  Math.PI * p.forearmOut / 180);
  const forearmDnQL   = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI * r.forearmDown / 180);
  const forearmDnQR   = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0),  Math.PI * p.forearmDown / 180);
  const forearmZQL    = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI * r.forearmZ / 180);
  const forearmZQR    = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1),  Math.PI * p.forearmZ / 180);
  const forearmRollQL = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0),  Math.PI * r.forearmRoll / 180);
  const forearmRollQR = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI * p.forearmRoll / 180);
  if (b.lForearm && b.lForearmOrig) b.lForearm.quaternion.copy(b.lForearmOrig.quaternion).premultiply(elbowQL).premultiply(forearmOutQL).premultiply(forearmDnQL).premultiply(forearmZQL).multiply(forearmRollQL);
  if (b.rForearm && b.rForearmOrig) b.rForearm.quaternion.copy(b.rForearmOrig.quaternion).premultiply(elbowQR).premultiply(forearmOutQR).premultiply(forearmDnQR).premultiply(forearmZQR).multiply(forearmRollQR);

  const shoulderInQL  = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI * r.shoulderIn / 180);
  const shoulderInQR  = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1),  Math.PI * p.shoulderIn / 180);
  const shoulderFwdQL = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0),  Math.PI * r.shoulderFwd / 180);
  const shoulderFwdQR = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI * p.shoulderFwd / 180);
  if (b.lUpperArm && b.lUpperArmOrig) b.lUpperArm.quaternion.copy(b.lUpperArmOrig.quaternion).premultiply(shoulderInQL).premultiply(shoulderFwdQL);
  if (b.rUpperArm && b.rUpperArmOrig) b.rUpperArm.quaternion.copy(b.rUpperArmOrig.quaternion).premultiply(shoulderInQR).premultiply(shoulderFwdQR);

  const torsoQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * p.torso / 180);
  if (b.spineClone && b.spineOrig) b.spineClone.quaternion.copy(b.spineOrig.quaternion).premultiply(torsoQ);

  const kneeExtQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI * p.kneeExt / 180);
  if (b.lShin) b.lShin.bone.quaternion.copy(b.lShin.seatedQ).premultiply(kneeExtQ);
  if (b.rShin) b.rShin.bone.quaternion.copy(b.rShin.seatedQ).premultiply(kneeExtQ);
}

export function SeatedPilot({
  glbPath = "/PilotOriginal.glb",
  position = [0, 0, 0],
  tilt = 0,           // grados, rotacion alrededor de X (lean del torso)
  scale = 1,
  pose = null,
  eject = false,             // disparo de eyeccion
  ejectTriggerRef = null,    // ref imperativa: ref.current = () => trigger()
  chuteParams = null,        // overrides de DEFAULT_CHUTE_PARAMS
}) {
  const { scene: pilotGLB, animations: pilotAnims } = useGLTF(glbPath);
  const cloned = useMemo(() => cloneSkinnedScene(pilotGLB), [pilotGLB]);
  const bonesRef = useRef(null);
  const legBonesRef = useRef(null); // { L_Thigh, L_Shin, R_Thigh, R_Shin } con seatedQ + straightQ
  const ejectionState = useRef({
    active: false, t: 0, seatSep: false,
    pos: new Vector3(), vel: new Vector3(),
    initPos: new Vector3(), initQ: new Quaternion(),
    joltLegAmp: 0,
    chuteT: 0, chuteJolted: false,
    standingApplied: false,
  });
  const poseRef = useRef(pose);
  useEffect(() => { poseRef.current = pose; }, [pose]);
  // Refs para el paracaidas
  const chuteTRef     = useRef(0);
  const anchorPosRef  = useRef(new Vector3());
  // Humo de eyección
  const smokeStateRef = useRef({ active: false, t: 0, pos: new Vector3() });
  // Llama del cohete del asiento (sigue al piloto, encendida durante T_IGN→T_ROCK)
  const rocketPosRef       = useRef(new Vector3());
  const rocketIntensityRef = useRef(0);

  useEffect(() => {
    let sm = null;
    cloned.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; });
    let smOrig = null;
    pilotGLB.traverse(o => { if (o.isSkinnedMesh && !smOrig) smOrig = o; });
    if (!sm || !smOrig || !pilotAnims?.length) return;

    const mixer = new AnimationMixer(pilotGLB);
    const clip = pilotAnims.find(a => a.name === "eject_legs") ?? pilotAnims[0];
    const action = mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    const LEG_BONES = ["L_Thigh", "L_Shin", "R_Thigh", "R_Shin"];
    mixer.setTime(0);
    const bones = {};
    LEG_BONES.forEach(n => {
      const bO = smOrig.skeleton.bones.find(b => b.name === n);
      const bC = sm.skeleton.bones.find(b => b.name === n);
      if (bO && bC) bones[n] = { bone: bC, seatedQ: bO.quaternion.clone() };
    });
    mixer.setTime(clip.duration);
    Object.keys(bones).forEach(n => {
      const bO = smOrig.skeleton.bones.find(b => b.name === n);
      if (bO) bones[n].straightQ = bO.quaternion.clone();
    });
    mixer.setTime(0);

    const spreadAngle = Math.PI * 32 / 180;
    const spreadL = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -spreadAngle);
    const spreadR = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0),  spreadAngle);
    if (bones["L_Thigh"]) { bones["L_Thigh"].seatedQ.premultiply(spreadL); bones["L_Thigh"].bone.quaternion.copy(bones["L_Thigh"].seatedQ); }
    if (bones["R_Thigh"]) { bones["R_Thigh"].seatedQ.premultiply(spreadR); bones["R_Thigh"].bone.quaternion.copy(bones["R_Thigh"].seatedQ); }

    const hipsO = smOrig.skeleton.bones.find(b => b.name === "Hips");
    const hipsC = sm.skeleton.bones.find(b => b.name === "Hips");
    if (hipsO && hipsC) hipsC.quaternion.copy(hipsO.quaternion);

    bonesRef.current = {
      lForearm:      sm.skeleton.bones.find(b => b.name === "L_Forearm"),
      rForearm:      sm.skeleton.bones.find(b => b.name === "R_Forearm"),
      lForearmOrig:  smOrig.skeleton.bones.find(b => b.name === "L_Forearm"),
      rForearmOrig:  smOrig.skeleton.bones.find(b => b.name === "R_Forearm"),
      lUpperArm:     sm.skeleton.bones.find(b => b.name === "L_UpperArm"),
      rUpperArm:     sm.skeleton.bones.find(b => b.name === "R_UpperArm"),
      lUpperArmOrig: smOrig.skeleton.bones.find(b => b.name === "L_UpperArm"),
      rUpperArmOrig: smOrig.skeleton.bones.find(b => b.name === "R_UpperArm"),
      spineClone:    sm.skeleton.bones.find(b => b.name === "Spine"),
      spineOrig:     smOrig.skeleton.bones.find(b => b.name === "Spine"),
      lShin:         bones["L_Shin"],
      rShin:         bones["R_Shin"],
    };
    legBonesRef.current = bones;  // {L_Thigh, L_Shin, R_Thigh, R_Shin} con seatedQ + straightQ
    applyPilotPose(bonesRef.current, pose);
  }, [cloned, pilotGLB, pilotAnims]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bonesRef.current) applyPilotPose(bonesRef.current, pose);
  }, [pose]);

  // Trigger: callback sincronico que dispara la eyeccion
  const trigger = () => {
    const es = ejectionState.current;
    if (es.active) return;
    es.active = true;
    es.t = 0;
    es.seatSep = false;
    es.joltLegAmp = 0;
    es.chuteT = 0;
    es.chuteJolted = false;
    es.standingApplied = false;
    es.pos.set(...position);
    es.vel.set(0, 0, 0);
    es.initPos.copy(es.pos);
    es.initQ.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * tilt / 180);
    chuteTRef.current = 0;
    smokeStateRef.current.active = false;
    smokeStateRef.current.t = 0;
    smokeStateRef.current.pos.copy(es.initPos);
    rocketIntensityRef.current = 0;
  };
  // Reset: vuelve al estado inicial (sentado en la cabina)
  const reset = () => {
    const es = ejectionState.current;
    es.active = false;
    es.t = 0;
    es.seatSep = false;
    es.joltLegAmp = 0;
    es.chuteT = 0;
    es.chuteJolted = false;
    es.standingApplied = false;
    chuteTRef.current = 0;
    smokeStateRef.current.active = false;
    smokeStateRef.current.t = 0;
    rocketIntensityRef.current = 0;
    if (bonesRef.current) applyPilotPose(bonesRef.current, poseRef.current);
    if (cloned) {
      cloned.position.set(...position);
      cloned.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * tilt / 180);
    }
    if (legBonesRef.current) {
      for (const n in legBonesRef.current) {
        const { bone, seatedQ } = legBonesRef.current[n];
        if (seatedQ) bone.quaternion.copy(seatedQ);
      }
    }
  };
  // Watch eject prop
  useEffect(() => {
    if (eject) trigger();
    else reset();
  }, [eject]);  // eslint-disable-line react-hooks/exhaustive-deps
  // Imperative ref
  if (ejectTriggerRef) ejectTriggerRef.current = trigger;

  // useFrame: integracion fisica + animacion de piernas/torso
  useFrame((_state, delta) => {
    const es = ejectionState.current;
    if (!es.active || !cloned) return;
    es.t += delta;
    const t = es.t;
    const gravity = -5.5;
    const T_IGN  = 0.05;
    const T_CAT  = 0.25;
    const T_ROCK = 0.62;
    const T_SEP  = 0.90;

    let rocketAccel = 0;
    if (t >= T_IGN && t < T_CAT)        rocketAccel = 55.0;
    else if (t >= T_CAT && t < T_ROCK)  rocketAccel = 16.0;

    // Disparar humo en T_IGN (en posicion inicial = donde estaba el asiento)
    if (t >= T_IGN && !smokeStateRef.current.active && smokeStateRef.current.t === 0) {
      smokeStateRef.current.active = true;
      smokeStateRef.current.pos.copy(es.initPos);
    }

    // Llama del cohete: sigue al piloto durante toda la fase de empuje
    let rocketIntensity = 0;
    if (t >= T_IGN && t < T_CAT)        rocketIntensity = 1.0;        // catapulta full
    else if (t >= T_CAT && t < T_ROCK)  rocketIntensity = 0.78;       // sustainer
    else if (t >= T_ROCK && t < T_SEP)  rocketIntensity = Math.max(0, 0.78 * (1 - (t - T_ROCK) / (T_SEP - T_ROCK)));
    rocketIntensityRef.current = rocketIntensity;
    // pos del cohete = base del piloto (un poco abajo de su posicion para que la llama salga de "abajo del asiento")
    rocketPosRef.current.set(es.pos.x, es.pos.y - 0.4, es.pos.z);

    if (!es.seatSep && t >= T_SEP) { es.seatSep = true; es.joltLegAmp = 1.0; }

    // Al separarse del asiento, reaplicar pose simétrica (sin override rArm) = pose standing F35C
    if (es.seatSep && !es.standingApplied && bonesRef.current) {
      es.standingApplied = true;
      const standingPose = poseRef.current ? { ...poseRef.current, rArm: undefined } : null;
      applyPilotPose(bonesRef.current, standingPose);
    }

    // Paracaidas: arranca a desplegarse al separar el asiento (1.1s para abrirse)
    if (t > T_SEP) es.chuteT = Math.min(1.0, (t - T_SEP) / 1.1);
    chuteTRef.current = es.chuteT;

    // Sacudón al cazar aire (~50% inflado): tirón vertical + caos lateral
    if (!es.chuteJolted && es.chuteT > 0.48) {
      es.chuteJolted = true;
      es.vel.y += 8.0;
      es.vel.x += (Math.random() - 0.5) * 3.0;
      es.vel.z += (Math.random() - 0.5) * 3.0;
      es.joltLegAmp = 1.0;
    }

    // Integracion (despues de ignicion)
    if (t >= T_IGN) {
      es.vel.y += (gravity + rocketAccel) * delta;
      // Drag del paracaidas: limita caida cuando está abierto
      if (es.seatSep) {
        const drag = Math.min(es.chuteT * 0.09, 0.07);
        es.vel.y  = Math.max(es.vel.y * (1 - drag), -1.2);
        es.vel.x *= 0.97;
        es.vel.z *= 0.97;
      }
      es.pos.addScaledVector(es.vel, delta);
    }

    // Aplicar posicion + actualizar anchor del paracaidas (= hombros)
    cloned.position.set(es.pos.x, es.pos.y, es.pos.z);
    anchorPosRef.current.copy(es.pos);

    // Orientacion: tilt inicial → vertical despues de separacion
    if (es.seatSep) {
      const uprightT = Math.min(1, (t - T_SEP) / 1.5);
      const ease = uprightT * uprightT * (3 - 2 * uprightT);
      cloned.quaternion.copy(es.initQ).slerp(_UPRIGHT_Q, ease);
    } else {
      cloned.quaternion.copy(es.initQ);
    }

    // Piernas: SLERP sentado → recto + jolt
    if (es.seatSep && legBonesRef.current) {
      const phaseA = Math.min(1, Math.max(0, (t - T_SEP) / 1.2));
      if (es.joltLegAmp > 0.001) es.joltLegAmp *= Math.exp(-delta * 3.8);
      else es.joltLegAmp = 0;
      for (const n in legBonesRef.current) {
        const { bone, seatedQ, straightQ } = legBonesRef.current[n];
        if (!seatedQ || !straightQ) continue;
        const swing = es.joltLegAmp > 0 ? Math.sin(t * 9.0) * es.joltLegAmp * 0.75 : 0;
        bone.quaternion.copy(seatedQ).slerp(straightQ, phaseA + swing);
      }
    }
  });

  // Tilt: rotacion alrededor de X local (lean torso)
  const rotation = useMemo(() => [Math.PI * tilt / 180, 0, 0], [tilt]);

  // Cuando NO esta ejectando, usar position/rotation prop. Cuando ejecta,
  // useFrame pisa cloned.position/quaternion directamente.
  const isEjecting = ejectionState.current.active;
  return (
    <>
      <primitive
        object={cloned}
        position={isEjecting ? undefined : position}
        rotation={isEjecting ? undefined : rotation}
        scale={scale}
      />
      <Parachute anchorPosRef={anchorPosRef} chuteTRef={chuteTRef} params={chuteParams} />
      <SmokeCloud stateRef={smokeStateRef} />
      <SeatRocketFlame posRef={rocketPosRef} intensityRef={rocketIntensityRef} />
    </>
  );
}

useGLTF.preload("/PilotOriginal.glb");
