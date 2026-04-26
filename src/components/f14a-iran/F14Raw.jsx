"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect } from "react";

// Loads the untouched source GLB, no material override, no splitting.
// Used as a "ground truth" reference to compare against the rigged v6.
export default function F14Raw({
  glbPath = "/F-14-iran.glb",
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}) {
  const { scene } = useGLTF(glbPath);

  useEffect(() => {
    scene.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      // Desactivar normalMap — el tangent space del Sketchfab original produce
      // rayitas finas al renderizar en three.js. Sin normalMap = sin rayas.
      if (obj.material?.normalMap) {
        obj.material.normalMap = null;
        obj.material.needsUpdate = true;
      }
    });
  }, [scene]);

  return <primitive object={scene} position={position} rotation={rotation} scale={scale} />;
}

useGLTF.preload("/F-14-iran.glb");
