"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkinnedScene } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Quaternion, Vector3 } from "three";

const ALWAYS_HIDDEN = [
  "engine-part",
  "EuroTyphoon-Body016",
  "EuroTyphoon-Body015",
];

const GEAR_TRAVEL_SECONDS = 5.0;

const WHEEL_NAMES       = ["F-35C-BODY055", "F-35C-BODY056"];
const WHEEL_STOW_ANGLE  = 70 * Math.PI / 180; //70°
const WHEEL_STOW_LIFT   = 0.16;        // empuje extra en Y (arriba)
const WHEEL_STOW_INWARD = 0.08;        // empuje extra hacia el centro del fuselaje (tunea este valor)

export default function F35C({
  url      = "/F-35C.glb",
  scale    = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  gearDown = true,
}) {
  const groupRef   = useRef(null);
  const targetTime = useRef(0);
  const animTime   = useRef(0);
  const wheelBones = useRef([]); // parent bones of each rear wheel

  const { scene, animations } = useGLTF(url);
  const clonedScene = useMemo(() => cloneSkinnedScene(scene), [scene]);
  const { actions, mixer } = useAnimations(animations, groupRef);

  useEffect(() => {
    ALWAYS_HIDDEN.forEach((name) => {
      const obj = clonedScene.getObjectByName(name);
      if (obj) obj.visible = false;
    });

    // Store the direct parent bone of each rear wheel plus its initial quaternion.
    // We rotate relative to the rest pose so the wheel keeps its original orientation.
    wheelBones.current = WHEEL_NAMES.flatMap((name) => {
      const obj = clonedScene.getObjectByName(name);
      if (!obj || !obj.parent) { console.warn(`[F35C] wheel/bone not found: ${name}`); return []; }
      const bone = obj.parent;

      const arm = bone.parent ?? bone;
      // inwardSign en world space para saber hacia qué lado está realmente cada tren
      const worldPos = new Vector3();
      arm.getWorldPosition(worldPos);
      const inwardSign = worldPos.x >= 0 ? -1 : 1;
      return [{ bone, baseQ: bone.quaternion.clone(), arm, inwardSign, liftY: 0, liftX: 0 }];
    });
  }, [clonedScene]);

  useEffect(() => {
    if (!mixer || animations.length === 0) return;
    console.log("[F35C] animations:", animations.map((a) => `"${a.name}" (${a.duration.toFixed(2)}s)`));
    Object.values(actions).forEach((a) => { a.play(); a.paused = true; a.time = 0; });
  }, [actions, mixer, animations]);

  useEffect(() => {
    const actionList = Object.values(actions);
    if (!actionList.length) return;
    if (gearDown) {
      targetTime.current = 0;
    } else {
      const maxDur = actionList.reduce((m, a) => Math.max(m, a.getClip().duration), 0);
      targetTime.current = maxDur;
    }
  }, [gearDown, actions]);

  useFrame((_, delta) => {
    const actionList = Object.values(actions);
    if (!mixer || !actionList.length) return;

    const maxDur = actionList.reduce((m, a) => Math.max(m, a.getClip().duration), 0);
    if (maxDur === 0) return;

    const diff = targetTime.current - animTime.current;
    if (Math.abs(diff) >= 0.001) {
      const step = (maxDur / GEAR_TRAVEL_SECONDS) * delta;
      animTime.current += Math.sign(diff) * Math.min(Math.abs(diff), step);
    }

    // Always stamp a.time and update so mixer writes fresh bone quaternions each frame.
    actionList.forEach((a) => {
      a.time = Math.max(0, Math.min(a.getClip().duration, animTime.current));
    });
    mixer.update(0);

    // Apply stow rotation + lift on top of each bone's rest-pose quaternion/position.
    const t = Math.max(0, Math.min(1, animTime.current / maxDur));
    if (wheelBones.current.length > 0) {
      const stowQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), WHEEL_STOW_ANGLE * t);
      wheelBones.current.forEach((entry) => {
        const { bone, baseQ, arm } = entry;
        bone.quaternion.copy(baseQ).premultiply(stowQ);
        // Deshacemos el lift del frame anterior y aplicamos el nuevo.
        // Así no acumula aunque el mixer no resetee la posición (update(0) con t fijo).
        const newLift   = WHEEL_STOW_LIFT   * t;
        const newInward = WHEEL_STOW_INWARD * t * entry.inwardSign;
        arm.position.y += newLift   - entry.liftY;
        arm.position.x += newInward - entry.liftX;
        entry.liftY = newLift;
        entry.liftX = newInward;
      });
    }
  }, -1);

  return (
    <group ref={groupRef} scale={scale} position={position} rotation={rotation}>
      <primitive object={clonedScene} />
    </group>
  );
}

useGLTF.preload("/F-35C.glb");
