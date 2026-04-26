"use client";

import { useGLTF } from "@react-three/drei";
import useMig29Animations from "./useMig29Animations";

export default function Mig29({
  canopyOpen = false,
  gearDown   = false,
  position   = [0, 0, 0],
  rotation   = [0, 0, 0],
  scale      = 1,
}) {
  const { scene, nodes, animations } = useGLTF("/mig-29.glb");
  useMig29Animations(scene, nodes, animations, { canopyOpen, gearDown });

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload("/mig-29.glb");
