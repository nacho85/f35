"use client";

import { useRef, useEffect, useMemo } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import useMig29Animations from "./useMig29Animations";
import { DecalGeometry } from "three-stdlib";

const DECALS = [
  // ── tail L ────────────────────────────────────────────────────────────────
  { key: "tail_L_number", pos: [-28.0471, 19.2645, -19.5029], scale: [4, 2, 1], tex: "number", rot: Math.PI * 3 / 180, normal: [0, -1, 0] },
  { key: "tail_L_flag",   pos: [-28.4877, 15.8265, -19.0997], scale: [6, 3.5, 1], tex: "flag", rot: Math.PI * 3 / 180, normal: [0, -1, 0] },
  { key: "tail_L_eagle",  pos: [-25.7608,  8.3830, -18.4185], scale: [10, 10, 1], tex: "eagle"   },
  // ── tail R (Z mirrored) ───────────────────────────────────────────────────
  { key: "tail_R_number", pos: [-28.0471, 19.2645,  19.5029], scale: [4, 2,   1], tex: "number", flipH: true, flipV: true, rot: Math.PI * -3 / 180, normal: [0, 1, 0] },
  { key: "tail_R_flag",   pos: [-28.4877, 15.8265,  19.0997], scale: [6, 3.5, 1], tex: "flag",   flipH: true, flipV: true, rot: Math.PI * -3 / 180, normal: [0, 1, 0] },
  // ── wings top ─────────────────────────────────────────────────────────────
  { key: "wing_top_L",    pos: [ -2.9632,  0.5225, -46.0854], scale: [4.838, 4.838, 1], tex: "roundel" },
  { key: "wing_top_R",    pos: [ -2.9632,  0.5225,  46.0854], scale: [4.838, 4.838, 1], tex: "roundel" },
  // ── wing bottom ───────────────────────────────────────────────────────────
  { key: "wing_bot_L",    pos: [ -3.0583, -0.3788, -46.1643], scale: [5, 5,   1], tex: "eagle", rot: Math.PI / 2 },
  // ── fuselage ──────────────────────────────────────────────────────────────
  { key: "roundel_51",    pos: [ 33.5089, -5.5040, -11.5903], scale: [3.629, 3.629, 1], tex: "roundel" },
  { key: "iriaf_L",       pos: [ 65.0724,  6.5967,  -4.8962], scale: [8, 3,   1], tex: "iriaf", flipH: true, flipV: true, rot: 0.3 - Math.PI * 25 / 180 },
  { key: "iriaf_R",       pos: [ 65.0724,  6.5967,   4.8962], scale: [8, 3,   1], tex: "iriaf", rot: 0.3 + Math.PI * -10 / 180 },
  { key: "persian_num",   pos: [ 85.6089,  1.6351,  -4.6746], scale: [5, 2.5, 1], tex: "pnumber", rot: Math.PI * -2 / 180, normal: [0, -1, 0] },
  { key: "persian_num_R", pos: [ 85.6089,  1.6351,   4.6746], scale: [5, 2.5, 1], tex: "pnumber", flipH: true, flipV: true, rot: Math.PI *  2 / 180, normal: [0,  1, 0] },
  { key: "wing_bot_R",    pos: [ -3.0583, -0.3788,  46.1643], scale: [5, 5,   1], tex: "eagle",   flipH: true, rot: Math.PI / 2 },
];

export default function Mig29Iran({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, canopyOpen = false, gearDown = false, gearProgressOverride = null }) {
  const { scene, nodes, animations } = useGLTF("/mig-29-iran.glb");
  const decalsRef = useRef([]);
  useMig29Animations(scene, nodes, animations, { canopyOpen, gearDown, gearProgressOverride });

  const textures = useTexture({
    flag:    "/iranian_flag.png",
    roundel: "/iranian_roundel.png",
    number:  "/iranian_number.png",
    pnumber: "/iranian_persian_number.png",
    iriaf:   "/iranian_iriaf.png",
    eagle:   "/iranian_iriaf_symbol.png",
  });

  const flipped = useMemo(() => {
    const out = {};
    for (const [k, t] of Object.entries(textures)) {
      const c = t.clone();
      c.repeat.set(-1, 1);
      c.offset.set(1, 0);
      c.needsUpdate = true;
      out[k] = c;
    }
    return out;
  }, [textures]);


  useEffect(() => {
    let airframe = null;
    scene.traverse(obj => {
      if (obj.isMesh && obj.name === "Object_4") airframe = obj;
    });
    if (!airframe) return;

    airframe.updateWorldMatrix(true, false);
    if (!airframe.geometry.attributes.normal) airframe.geometry.computeVertexNormals();

    const verts = airframe.geometry.attributes.position.array;
    const norms = airframe.geometry.attributes.normal.array;
    const savedMatrix = airframe.matrixWorld.clone();
    const mwInv = savedMatrix.clone().invert();

    DECALS.forEach(({ pos, scale: s, tex, flipH, flipV, rot = 0, normal: fixedNormal }) => {
      // World → local
      const localPos = new THREE.Vector3(...pos).applyMatrix4(mwInv);

      let closestNormal;
      if (fixedNormal) {
        // Use hardcoded local-space normal (stable across position tweaks)
        closestNormal = new THREE.Vector3(...fixedNormal);
      } else {
        // Find closest vertex normal in local space
        closestNormal = new THREE.Vector3();
        let bestDist = Infinity;
        const v = new THREE.Vector3();
        for (let i = 0; i < verts.length; i += 3) {
          v.set(verts[i], verts[i + 1], verts[i + 2]);
          const d = localPos.distanceTo(v);
          if (d < bestDist) {
            bestDist = d;
            closestNormal.set(norms[i], norms[i + 1], norms[i + 2]);
          }
        }
      }

      // Replicate Decal auto-detection orientation
      const o = new THREE.Object3D();
      o.position.copy(localPos);
      o.lookAt(localPos.clone().add(closestNormal));
      o.rotateZ(Math.PI);
      o.rotateY(Math.PI);
      if (rot) o.rotateZ(rot);

      // Create geometry with identity matrixWorld (local space)
      airframe.matrixWorld.identity();
      const geo = new DecalGeometry(
        airframe,
        localPos,
        o.rotation,
        new THREE.Vector3(...s)
      );
      airframe.matrixWorld.copy(savedMatrix);

      let map = (flipH ? textures[tex] : flipped[tex]).clone();
      map.repeat.set(map.repeat.x, flipV ? -1 : 1);
      map.offset.set(map.offset.x, flipV ? 1 : 0);
      map.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });

      const mesh = new THREE.Mesh(geo, mat);
      airframe.add(mesh);
      decalsRef.current.push(mesh);
    });

    return () => {
      decalsRef.current.forEach(m => {
        m.geometry.dispose();
        m.material.dispose();
        if (m.parent) m.parent.remove(m);
      });
      decalsRef.current = [];
    };
  }, [scene, textures, flipped]);

  return (
    <primitive object={scene} position={position} rotation={rotation} scale={scale}
    />
  );
}

useGLTF.preload("/mig-29-iran.glb");
