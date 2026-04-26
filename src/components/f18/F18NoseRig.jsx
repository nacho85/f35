"use client";

import { useRef, useCallback } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ── Hinge math — pivot completo en 3D ────────────────────────────────────────
const _mA = new THREE.Matrix4();
const _mB = new THREE.Matrix4();
const _hingeAxis = new THREE.Vector3();

function applyHingeLocal(node, natLocal, angle, pWX, pWY, pWZ, axisX, axisY, axisZ, s) {
  if (!node || !natLocal) return;
  const px = pWX / s, py = pWY / s, pz = pWZ / s;
  _hingeAxis.set(axisX, axisY, axisZ).normalize();
  _mA.copy(natLocal);
  _mB.makeTranslation(-px, -py, -pz);      _mA.premultiply(_mB);
  _mB.makeRotationAxis(_hingeAxis, angle); _mA.premultiply(_mB);
  _mB.makeTranslation( px,  py,  pz);      _mA.premultiply(_mB);
  node.matrix.copy(_mA);
  node.updateMatrixWorld(true);
}

// ─────────────────────────────────────────────────────────────────────────────
export default function F18NoseRig({
  noseAngleL     = 0,
  noseAngleRFwd  = 0,
  noseAngleRAft  = 0,

  // Pivot 3D por compuerta (world coords)
  nosePivotLX    = 0, nosePivotLY    = -0.52, nosePivotLZ    = -0.33,
  nosePivotRFwdX = 0, nosePivotRFwdY = -0.522, nosePivotRFwdZ =  0.325,
  nosePivotRAftX = 0, nosePivotRAftY = -0.52, nosePivotRAftZ =  0.12,

  // Eje por compuerta
  noseAxisLX    = 1, noseAxisLY    = 0, noseAxisLZ    = 0,
  noseAxisRFwdX = 1, noseAxisRFwdY = 0, noseAxisRFwdZ = 0,
  noseAxisRAftX = 1, noseAxisRAftY = 0, noseAxisRAftZ = 0,

  canopyOpen  = false,
  hookDown    = false,
  onMeshClick = null,   // callback(THREE.Vector3) para marcar bisagras
  position    = [0, 0, 0],
  rotation    = [0, 0, 0],
  scale       = 0.1,
}) {
  const { scene, nodes } = useGLTF("/F-18-nose-rigged.glb");
  const ready = useRef(false);

  const doorLMesh    = useRef(null); const doorLNat    = useRef(null);
  const doorRFwdMesh = useRef(null); const doorRFwdNat = useRef(null);
  const doorRAftMesh = useRef(null); const doorRAftNat = useRef(null);
  const edgeLLines    = useRef(null);
  const edgeRFwdLines = useRef(null);
  const edgeRAftLines = useRef(null);
  const canopyPivot  = useRef(null);
  const hookPivot    = useRef(null);

  // prop refs
  const rAL   = useRef(noseAngleL);    const rARFwd = useRef(noseAngleRFwd); const rARAft = useRef(noseAngleRAft);
  const rPLX  = useRef(nosePivotLX);   const rPLY   = useRef(nosePivotLY);   const rPLZ   = useRef(nosePivotLZ);
  const rALX  = useRef(noseAxisLX);    const rALY   = useRef(noseAxisLY);    const rALZ   = useRef(noseAxisLZ);
  const rPFX  = useRef(nosePivotRFwdX);const rPFY   = useRef(nosePivotRFwdY);const rPFZ   = useRef(nosePivotRFwdZ);
  const rAFX  = useRef(noseAxisRFwdX); const rAFY   = useRef(noseAxisRFwdY); const rAFZ   = useRef(noseAxisRFwdZ);
  const rPAX  = useRef(nosePivotRAftX);const rPAY   = useRef(nosePivotRAftY);const rPAZ   = useRef(nosePivotRAftZ);
  const rAAX  = useRef(noseAxisRAftX); const rAAY   = useRef(noseAxisRAftY); const rAAZ   = useRef(noseAxisRAftZ);
  const rCan  = useRef(canopyOpen);    const rHook  = useRef(hookDown);
  const rClick= useRef(onMeshClick);

  rAL.current=noseAngleL; rARFwd.current=noseAngleRFwd; rARAft.current=noseAngleRAft;
  rPLX.current=nosePivotLX; rPLY.current=nosePivotLY; rPLZ.current=nosePivotLZ;
  rALX.current=noseAxisLX;  rALY.current=noseAxisLY;  rALZ.current=noseAxisLZ;
  rPFX.current=nosePivotRFwdX; rPFY.current=nosePivotRFwdY; rPFZ.current=nosePivotRFwdZ;
  rAFX.current=noseAxisRFwdX;  rAFY.current=noseAxisRFwdY;  rAFZ.current=noseAxisRFwdZ;
  rPAX.current=nosePivotRAftX; rPAY.current=nosePivotRAftY; rPAZ.current=nosePivotRAftZ;
  rAAX.current=noseAxisRAftX;  rAAY.current=noseAxisRAftY;  rAAZ.current=noseAxisRAftZ;
  rCan.current=canopyOpen; rHook.current=hookDown; rClick.current=onMeshClick;

  const setupScene = useCallback(() => {
    if (ready.current) return;
    scene.updateMatrixWorld(true);
    const s = scene.scale.x;

    const canopyMat = new THREE.MeshPhysicalMaterial({
      color: 0x88aacc, transmission: 0.82, roughness: 0.05, metalness: 0.1,
      thickness: 0.3, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    });
    nodes["F18-canopy"]?.traverse(o => { if (o.isMesh) o.material = canopyMat; });

    const canopyNode = nodes["F18-canopy"];
    if (canopyNode) {
      canopyNode.updateWorldMatrix(true, false);
      const bb = new THREE.Box3().expandByObject(canopyNode);
      const piv = new THREE.Group();
      piv.position.set(bb.min.x/s, bb.min.y/s, (bb.min.z+bb.max.z)/2/s);
      scene.add(piv); piv.attach(canopyNode);
      canopyPivot.current = piv;
    }

    const hookNode = nodes["F18-hook"];
    if (hookNode) {
      hookNode.updateWorldMatrix(true, false);
      const bb = new THREE.Box3().expandByObject(hookNode);
      const piv = new THREE.Group();
      piv.position.set(bb.max.x/s, bb.max.y/s, (bb.min.z+bb.max.z)/2/s);
      scene.add(piv); piv.attach(hookNode);
      hookPivot.current = piv;
    }

    if (nodes["F18-landingOff"]) nodes["F18-landingOff"].visible = false;

    const _sceneInv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const grabDoor = (name, meshRef, natRef, color) => {
      const node = nodes[name];
      if (!node) { console.warn("MISSING:", name); return; }
      node.updateWorldMatrix(true, false);
      let src = node.isMesh ? node : null;
      if (!src) node.traverse(o => { if (o.isMesh && !src) src = o; });
      if (!src) return;
      src.updateWorldMatrix(true, false);
      const localToScene = new THREE.Matrix4().multiplyMatrices(_sceneInv, src.matrixWorld);
      const newMesh = new THREE.Mesh(
        src.geometry,
        new THREE.MeshStandardMaterial({ color, roughness: 0.4 })
      );
      newMesh.matrix.copy(localToScene);
      newMesh.matrixAutoUpdate = false;
      scene.add(newMesh);
      node.visible = false;
      natRef.current  = localToScene.clone();
      meshRef.current = newMesh;
    };

    grabDoor("F18-noseGearDoorL",    doorLMesh,    doorLNat,    0xff3333);
    grabDoor("F18-noseGearDoorRFwd", doorRFwdMesh, doorRFwdNat, 0xff6600);
    grabDoor("F18-noseGearDoorRAft", doorRAftMesh, doorRAftNat, 0xff9900);

    // ── Línea continua del borde superior de cada compuerta ───────────────────
    const buildTopEdgeLine = (mesh, color) => {
      if (!mesh) return null;
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      const mat = mesh.matrix;
      const idx = geo.index?.array;
      const tmp = new THREE.Vector3();

      // Y world de cada vértice + máximo
      let maxY = -Infinity;
      const wY = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mat);
        wY[i] = tmp.y;
        if (tmp.y > maxY) maxY = tmp.y;
      }

      const thresh = 0.04;
      const triCount = idx ? idx.length / 3 : pos.count / 3;

      // Contar cuántas veces aparece cada arista (borde = 1 vez)
      const edgeCount = new Map();
      const eKey = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;
      for (let t = 0; t < triCount; t++)
        for (let k = 0; k < 3; k++) {
          const v0 = idx ? idx[t*3+k]       : t*3+k;
          const v1 = idx ? idx[t*3+(k+1)%3] : t*3+(k+1)%3;
          const k2 = eKey(v0, v1);
          edgeCount.set(k2, (edgeCount.get(k2) || 0) + 1);
        }

      // Aristas de contorno en el borde superior
      const adj = new Map();
      for (const [key, count] of edgeCount) {
        if (count !== 1) continue;
        const [va, vb] = key.split('_').map(Number);
        if (wY[va] < maxY - thresh || wY[vb] < maxY - thresh) continue;
        if (!adj.has(va)) adj.set(va, []);
        if (!adj.has(vb)) adj.set(vb, []);
        adj.get(va).push(vb);
        adj.get(vb).push(va);
      }
      if (!adj.size) return null;

      // Punto de inicio = extremo (1 solo vecino)
      let start = adj.keys().next().value;
      for (const [v, nb] of adj) { if (nb.length === 1) { start = v; break; } }

      // Encadenar path
      const path = [start];
      const seen = new Set([start]);
      let cur = start;
      while (true) {
        const next = (adj.get(cur) || []).find(n => !seen.has(n));
        if (next === undefined) break;
        path.push(next); seen.add(next); cur = next;
      }
      if (path.length < 2) return null;

      const pts = [];
      for (const v of path)
        pts.push(pos.getX(v), pos.getY(v), pos.getZ(v));

      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      const line = new THREE.Line(lineGeo,
        new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest: false }));
      line.matrix.copy(mat);
      line.matrixAutoUpdate = false;
      scene.add(line);
      return line;
    };

    edgeLLines.current    = buildTopEdgeLine(doorLMesh.current,    0xff8888);
    edgeRFwdLines.current = buildTopEdgeLine(doorRFwdMesh.current, 0xffaa55);
    edgeRAftLines.current = buildTopEdgeLine(doorRAftMesh.current, 0xffdd88);

    ready.current = true;
  }, [scene, nodes]);

  useFrame(() => {
    if (!scene) return;
    setupScene();
    const s = scene.scale.x;

    if (canopyPivot.current) canopyPivot.current.rotation.x = rCan.current  ? -Math.PI/3 : 0;
    if (hookPivot.current)   hookPivot.current.rotation.x   = rHook.current ?  Math.PI/5 : 0;

    applyHingeLocal(doorLMesh.current,    doorLNat.current,    rAL.current,
      rPLX.current, rPLY.current, rPLZ.current,
      rALX.current, rALY.current, rALZ.current, s);

    applyHingeLocal(doorRFwdMesh.current, doorRFwdNat.current, rARFwd.current,
      rPFX.current, rPFY.current, rPFZ.current,
      rAFX.current, rAFY.current, rAFZ.current, s);

    applyHingeLocal(doorRAftMesh.current, doorRAftNat.current, rARAft.current,
      rPAX.current, rPAY.current, rPAZ.current,
      rAAX.current, rAAY.current, rAAZ.current, s);

    // Mover bordes superiores con sus compuertas
    if (edgeLLines.current    && doorLMesh.current)    edgeLLines.current.matrix.copy(doorLMesh.current.matrix);
    if (edgeRFwdLines.current && doorRFwdMesh.current) edgeRFwdLines.current.matrix.copy(doorRFwdMesh.current.matrix);
    if (edgeRAftLines.current && doorRAftMesh.current) edgeRAftLines.current.matrix.copy(doorRAftMesh.current.matrix);
  });

  const handleClick = useCallback((e) => {
    if (!rClick.current) return;
    e.stopPropagation();
    rClick.current(e.point.clone());
  }, []);

  return (
    <group
      position={position} rotation={rotation} scale={scale}
      onClick={handleClick}
    >
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload("/F-18-nose-rigged.glb");
