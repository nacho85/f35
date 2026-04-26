"use client";

import { useRef, useCallback } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function bfsIslands(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index ? geo.index.array : null;
  const triCount = idx ? idx.length / 3 : pos.count / 3;
  const vtt = {};
  for (let t = 0; t < triCount; t++)
    for (let k = 0; k < 3; k++) {
      const v = idx ? idx[t*3+k] : t*3+k;
      if (!vtt[v]) vtt[v] = [];
      vtt[v].push(t);
    }
  const vis = new Uint8Array(triCount);
  const islands = [];
  for (let s = 0; s < triCount; s++) {
    if (vis[s]) continue;
    const comp = [], q = [s];
    while (q.length) {
      const t = q.pop(); if (vis[t]) continue; vis[t]=1; comp.push(t);
      for (let k=0; k<3; k++) { const v=idx?idx[t*3+k]:t*3+k; for (const nb of (vtt[v]||[])) if (!vis[nb]) q.push(nb); }
    }
    islands.push(comp);
  }
  return islands;
}

function islandCentroid(geo, tris) {
  const pos = geo.attributes.position;
  const idx = geo.index ? geo.index.array : null;
  const verts = new Set();
  for (const t of tris) for (let k=0; k<3; k++) verts.add(idx?idx[t*3+k]:t*3+k);
  let x=0, y=0, z=0;
  for (const v of verts) { x+=pos.getX(v); y+=pos.getY(v); z+=pos.getZ(v); }
  const n = verts.size;
  return new THREE.Vector3(x/n, y/n, z/n);
}

/** Crea un BufferGeometry nuevo a partir de un subconjunto de triángulos del geo fuente. */
function buildSubGeometry(geo, tris) {
  const idx = geo.index?.array ?? null;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv  = geo.attributes.uv;

  const oldToNew = new Map();
  let ni = 0;
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const v = idx ? idx[t*3+k] : t*3+k;
      if (!oldToNew.has(v)) oldToNew.set(v, ni++);
    }
  const n = oldToNew.size;
  const pa = new Float32Array(n * 3);
  const na = nor ? new Float32Array(n * 3) : null;
  const ua = uv  ? new Float32Array(n * 2) : null;
  for (const [ov, nv] of oldToNew) {
    pa[nv*3  ] = pos.getX(ov); pa[nv*3+1] = pos.getY(ov); pa[nv*3+2] = pos.getZ(ov);
    if (na) { na[nv*3]=nor.getX(ov); na[nv*3+1]=nor.getY(ov); na[nv*3+2]=nor.getZ(ov); }
    if (ua) { ua[nv*2]=uv.getX(ov); ua[nv*2+1]=uv.getY(ov); }
  }
  const ia = new Uint32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++)
    for (let k = 0; k < 3; k++) {
      const v = idx ? idx[tris[i]*3+k] : tris[i]*3+k;
      ia[i*3+k] = oldToNew.get(v);
    }
  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.BufferAttribute(pa, 3));
  if (na) newGeo.setAttribute('normal', new THREE.BufferAttribute(na, 3));
  if (ua) newGeo.setAttribute('uv', new THREE.BufferAttribute(ua, 2));
  newGeo.setIndex(new THREE.BufferAttribute(ia, 1));
  return newGeo;
}

// Matrices / vectores pre-alocados — evitan GC en useFrame
const _mA = new THREE.Matrix4();
const _mB = new THREE.Matrix4();
const _sceneInv = new THREE.Matrix4();
const _hingeAxis = new THREE.Vector3();

/**
 * Rota `node` alrededor de una bisagra arbitraria en world space.
 * pivot: punto de la bisagra en world coords (se divide por s para pasar a local)
 * axis:  dirección del eje (se normaliza internamente)
 */
function applyHingeLocal(node, natLocal, angle, pivotWX, pivotWY, pivotWZ, axisX, axisY, axisZ, s) {
  if (!node || !natLocal) return;
  const px = pivotWX / s;
  const py = pivotWY / s;
  const pz = pivotWZ / s;
  _hingeAxis.set(axisX, axisY, axisZ).normalize();
  _mA.copy(natLocal);
  _mB.makeTranslation(-px, -py, -pz);              _mA.premultiply(_mB);
  _mB.makeRotationAxis(_hingeAxis, angle);          _mA.premultiply(_mB);
  _mB.makeTranslation( px,  py,  pz);              _mA.premultiply(_mB);
  node.matrix.copy(_mA);
  node.updateMatrixWorld(true);
}

// ── Bisagra R Fwd — puntos clickeados en fuselaje ────────────────────────────
const _RFWD_P1   = new THREE.Vector3(7.478, -0.522, 0.325);
const _RFWD_AXIS = new THREE.Vector3(8.027 - 7.478, -0.534 - (-0.522), 0.319 - 0.325).normalize();
// ≈ (0.9998, -0.0219, -0.0109)

export default function F18({
  canopyOpen      = false,
  gearDown        = false,
  gearManual      = null,
  hookDown        = false,
  noseDoorAngleL    = Math.PI / 2,
  noseHingeAxisLY   = 0,
  noseHingeAxisLZ   = 0,
  nosePivotLY       = -0.61,
  nosePivotLZ       = -0.365,
  noseDoorAngleRFwd  = Math.PI / 2,
  nosePivotRFwdY     = -0.61,
  nosePivotRFwdZ     =  0.365,
  noseDoorAngleRAft = Math.PI / 2,
  noseHingeAxisRAftY = 0,
  noseHingeAxisRAftZ = 0,
  nosePivotRAftY    = -0.79,
  nosePivotRAftZ    =  0.38,
  gearLDoorAngle  = Math.PI / 2,
  gearRDoorAngle  = -Math.PI / 2,
  position        = [0, 0, 0],
  rotation        = [0, 0, 0],
  scale           = 0.1,
}) {
  const { scene, nodes, animations } = useGLTF("/F-18.glb");
  const ready          = useRef(false);
  const canopyPivot    = useRef(null);
  const hookPivot      = useRef(null);
  const gearLDoorPivot = useRef(null);
  const gearRDoorPivot = useRef(null);

  // Matrices naturales (local space del padre = scene)
  const doorLNatLocal    = useRef(null);
  const doorRFwdNatLocal = useRef(null);
  const doorRAftNatLocal = useRef(null);

  // Meshes del split runtime de la puerta R
  const doorRFwdMesh = useRef(null);
  const doorRAftMesh = useRef(null);

  const gearT = useRef(0);

  // Prop refs para evitar stale closures en useFrame
  const noseDoorAngleLRef     = useRef(noseDoorAngleL);
  const noseHingeAxisLYRef    = useRef(noseHingeAxisLY);
  const noseHingeAxisLZRef    = useRef(noseHingeAxisLZ);
  const nosePivotLYRef        = useRef(nosePivotLY);
  const nosePivotLZRef        = useRef(nosePivotLZ);
  const noseDoorAngleRFwdRef  = useRef(noseDoorAngleRFwd);
  const nosePivotRFwdYRef     = useRef(nosePivotRFwdY);
  const nosePivotRFwdZRef     = useRef(nosePivotRFwdZ);
  const noseDoorAngleRAftRef  = useRef(noseDoorAngleRAft);
  const noseHingeAxisRAftYRef = useRef(noseHingeAxisRAftY);
  const noseHingeAxisRAftZRef = useRef(noseHingeAxisRAftZ);
  const nosePivotRAftYRef     = useRef(nosePivotRAftY);
  const nosePivotRAftZRef     = useRef(nosePivotRAftZ);
  const gearLDoorAngleRef  = useRef(gearLDoorAngle);
  const gearRDoorAngleRef  = useRef(gearRDoorAngle);
  const gearManualRef      = useRef(gearManual);
  const gearDownRef        = useRef(gearDown);
  const canopyOpenRef      = useRef(canopyOpen);
  const hookDownRef        = useRef(hookDown);

  noseDoorAngleLRef.current     = noseDoorAngleL;
  noseHingeAxisLYRef.current    = noseHingeAxisLY;
  noseHingeAxisLZRef.current    = noseHingeAxisLZ;
  nosePivotLYRef.current        = nosePivotLY;
  nosePivotLZRef.current        = nosePivotLZ;
  noseDoorAngleRFwdRef.current  = noseDoorAngleRFwd;
  nosePivotRFwdYRef.current     = nosePivotRFwdY;
  nosePivotRFwdZRef.current     = nosePivotRFwdZ;
  noseDoorAngleRAftRef.current  = noseDoorAngleRAft;
  noseHingeAxisRAftYRef.current = noseHingeAxisRAftY;
  noseHingeAxisRAftZRef.current = noseHingeAxisRAftZ;
  nosePivotRAftYRef.current     = nosePivotRAftY;
  nosePivotRAftZRef.current     = nosePivotRAftZ;
  gearLDoorAngleRef.current  = gearLDoorAngle;
  gearRDoorAngleRef.current  = gearRDoorAngle;
  gearManualRef.current      = gearManual;
  gearDownRef.current        = gearDown;
  canopyOpenRef.current      = canopyOpen;
  hookDownRef.current        = hookDown;

  const dbgMeshes  = useRef({});
  const dbgIslands = useRef({});

  const setupScene = useCallback(() => {
    if (ready.current) return;
    scene.updateMatrixWorld(true);
    const s = scene.scale.x;

    // ── Canopy ────────────────────────────────────────────────────────────────
    const canopyMat = new THREE.MeshPhysicalMaterial({
      color: 0x88aacc, transmission: 0.82, roughness: 0.05, metalness: 0.1,
      thickness: 0.3, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    });
    nodes["F18-canopy"]?.traverse(o => { if (o.isMesh) o.material = canopyMat; });
    const canopyNode = nodes["F18-canopy"];
    if (canopyNode) {
      canopyNode.updateWorldMatrix(true, false);
      const bb = new THREE.Box3().expandByObject(canopyNode);
      const pivot = new THREE.Group();
      pivot.position.set(bb.min.x / s, bb.min.y / s, (bb.min.z + bb.max.z) / 2 / s);
      scene.add(pivot); pivot.attach(canopyNode);
      canopyPivot.current = pivot;
    }

    // ── Hook ──────────────────────────────────────────────────────────────────
    const hookNode = nodes["F18-hook"];
    if (hookNode) {
      hookNode.updateWorldMatrix(true, false);
      const bb = new THREE.Box3().expandByObject(hookNode);
      const pivot = new THREE.Group();
      pivot.position.set(bb.max.x / s, bb.max.y / s, (bb.min.z + bb.max.z) / 2 / s);
      scene.add(pivot); pivot.attach(hookNode);
      hookPivot.current = pivot;
    }

    if (nodes["F18-landingOff"]) nodes["F18-landingOff"].visible = false;

    // ── Debug paint ───────────────────────────────────────────────────────────
    const dbgColors = {
      "F18-noseGear":      0x00ffff,
      "F18-mainGearL":     0x0088ff, "F18-mainGearR": 0x00ff88,
      "F18-noseGearDoorL": 0xff0000,
      "F18-mainGearLDoor": 0x0000ff, "F18-mainGearRDoor": 0x00cc44,
    };
    Object.keys(dbgColors).forEach(name => {
      const n = nodes[name]; if (!n) return;
      n.traverse(o => {
        if (!o.isMesh) return;
        dbgMeshes.current[name] = o;
        o.material = new THREE.MeshStandardMaterial({ color: dbgColors[name], roughness: 0.4 });
        dbgIslands.current[name] = null;
      });
    });

    // ── Puerta nasal L ────────────────────────────────────────────────────────
    const doorLNode = nodes["F18-noseGearDoorL"];
    if (doorLNode) {
      doorLNode.updateWorldMatrix(true, false);
      doorLNatLocal.current = doorLNode.matrix.clone();
      doorLNode.matrixAutoUpdate = false;
    } else {
      console.warn("MISSING: F18-noseGearDoorL");
    }

    // ── Puerta nasal R — split BFS en Fwd (delantera) y Aft (trasera) ─────────
    const doorRNode = nodes["F18-noseGearDoorR"];
    if (doorRNode) {
      doorRNode.updateWorldMatrix(true, false);

      // Encontrar el mesh fuente (puede ser el nodo mismo o un hijo)
      let srcMesh = doorRNode.isMesh ? doorRNode : null;
      if (!srcMesh) doorRNode.traverse(o => { if (o.isMesh && !srcMesh) srcMesh = o; });

      if (srcMesh) {
        srcMesh.updateWorldMatrix(true, false);
        const islands = bfsIslands(srcMesh.geometry);
        console.log(`F18-noseGearDoorR: ${islands.length} isla(s)`);

        // Matriz local del srcMesh en espacio del scene (para los nuevos meshes)
        _sceneInv.copy(scene.matrixWorld).invert();
        const localToScene = new THREE.Matrix4().multiplyMatrices(_sceneInv, srcMesh.matrixWorld);

        if (islands.length >= 2) {
          // Separar por mayor gap en Z — los 2 clusters R están claramente
          // separados en Z: cluster principal Z≈3.5-4.5, cluster trasero Z≈1.0-1.4
          const centroids = islands.map(tris => islandCentroid(srcMesh.geometry, tris));
          const byZ = centroids.map((c, i) => ({ z: c.z, i })).sort((a, b) => a.z - b.z);
          let maxGap = -1, splitAt = 1;
          for (let k = 1; k < byZ.length; k++) {
            const gap = byZ[k].z - byZ[k-1].z;
            if (gap > maxGap) { maxGap = gap; splitAt = k; }
          }
          const gLowZ  = byZ.slice(0, splitAt).map(e => e.i); // Z bajo  → Aft
          const gHighZ = byZ.slice(splitAt).map(e => e.i);    // Z alto  → Fwd

          const fwdTris = gHighZ.flatMap(i => islands[i]);
          const aftTris = gLowZ.flatMap(i => islands[i]);

          const fwdGeo = buildSubGeometry(srcMesh.geometry, fwdTris);
          const aftGeo = buildSubGeometry(srcMesh.geometry, aftTris);

          const fwdMesh = new THREE.Mesh(fwdGeo,
            new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.4 }));
          const aftMesh = new THREE.Mesh(aftGeo,
            new THREE.MeshStandardMaterial({ color: 0xff9900, roughness: 0.4 }));

          fwdMesh.matrix.copy(localToScene); fwdMesh.matrixAutoUpdate = false;
          aftMesh.matrix.copy(localToScene); aftMesh.matrixAutoUpdate = false;

          scene.add(fwdMesh);
          scene.add(aftMesh);
          doorRNode.visible = false;

          doorRFwdNatLocal.current = localToScene.clone();
          doorRAftNatLocal.current = localToScene.clone();
          doorRFwdMesh.current = fwdMesh;
          doorRAftMesh.current = aftMesh;

          dbgMeshes.current["F18-noseGearDoorRFwd"] = fwdMesh;
          dbgMeshes.current["F18-noseGearDoorRAft"] = aftMesh;
          dbgIslands.current["F18-noseGearDoorRFwd"] = null;
          dbgIslands.current["F18-noseGearDoorRAft"] = null;

          console.log(`  Fwd: ${fwdTris.length} tris  Aft: ${aftTris.length} tris`);
        } else {
          // Una sola isla — tratar como Fwd
          srcMesh.matrix.copy(localToScene);
          srcMesh.matrixAutoUpdate = false;
          doorRFwdNatLocal.current = localToScene.clone();
          doorRFwdMesh.current = srcMesh;
          console.warn("F18-noseGearDoorR: solo 1 isla, no se pudo dividir");
        }
      }
    } else {
      console.warn("MISSING: F18-noseGearDoorR");
    }

    // ── Main gear door pivots ─────────────────────────────────────────────────
    const makePivotBbox = (nodeName, useMinZ = false) => {
      const n = nodes[nodeName]; if (!n) return null;
      n.updateWorldMatrix(true, false);
      const bb = new THREE.Box3().expandByObject(n);
      const pz = useMinZ ? bb.min.z : (bb.min.z + bb.max.z) / 2;
      const pivot = new THREE.Group();
      pivot.position.set((bb.min.x + bb.max.x) / 2 / s, bb.max.y / s, pz / s);
      scene.add(pivot); pivot.attach(n);
      return pivot;
    };
    gearLDoorPivot.current = makePivotBbox("F18-mainGearLDoor", false);
    gearRDoorPivot.current = makePivotBbox("F18-mainGearRDoor", true);

    gearT.current = gearDownRef.current ? 1 : 0;
    ready.current = true;
    console.log("F18 animations:", animations?.length, animations?.map(a => a.name));
    console.log("F18 setup done. L natLocal:", !!doorLNatLocal.current,
      "RFwd:", !!doorRFwdNatLocal.current, "RAft:", !!doorRAftNatLocal.current);
  }, [nodes, scene]);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    const mesh = e.object;

    // Siempre loguear el punto de intersección (útil para fuselaje y cualquier mesh)
    const p = e.point;
    console.log(`CLICK (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}) — ${mesh.name || "(sin nombre)"}`);

    let foundName = null;
    for (const [name, m] of Object.entries(dbgMeshes.current))
      if (m === mesh) { foundName = name; break; }
    if (!foundName) return;
    if (!dbgIslands.current[foundName])
      dbgIslands.current[foundName] = bfsIslands(mesh.geometry);
    const islands = dbgIslands.current[foundName];
    const triIdx = e.faceIndex; if (triIdx == null) return;
    for (let i = 0; i < islands.length; i++) {
      if (!islands[i].includes(triIdx)) continue;
      const c = islandCentroid(mesh.geometry, islands[i]);
      mesh.localToWorld(c);
      console.log(`HANG ${foundName} [${i}] ${islands[i].length}t | (${c.x.toFixed(3)}, ${c.y.toFixed(3)}, ${c.z.toFixed(3)})`);
      break;
    }
  }, []);

  useFrame(() => {
    setupScene();

    // ── Canopy ────────────────────────────────────────────────────────────────
    if (canopyPivot.current) {
      const target = canopyOpenRef.current ? 0.55 : 0;
      canopyPivot.current.rotation.z += (target - canopyPivot.current.rotation.z) * 0.08;
    }

    // ── Hook ──────────────────────────────────────────────────────────────────
    if (hookPivot.current) {
      const target = hookDownRef.current ? Math.PI / 4 : 0;
      hookPivot.current.rotation.z += (target - hookPivot.current.rotation.z) * (hookDownRef.current ? 0.06 : 0.02);
    }

    // ── Gear T ────────────────────────────────────────────────────────────────
    if (gearManualRef.current !== null) {
      gearT.current = gearManualRef.current;
    } else {
      const tgt = gearDownRef.current ? 1 : 0;
      gearT.current += (tgt - gearT.current) * (gearDownRef.current ? 0.007 : 0.009);
    }
    const t = gearT.current;
    const doorProg = Math.min(t / 0.2, 1.0);
    const s = scale;

    // ── Compuertas nasales ────────────────────────────────────────────────────
    // L (roja)
    applyHingeLocal(
      nodes["F18-noseGearDoorL"], doorLNatLocal.current,
      -(1 - doorProg) * noseDoorAngleLRef.current,
      0, nosePivotLYRef.current, nosePivotLZRef.current,
      1, noseHingeAxisLYRef.current, noseHingeAxisLZRef.current, s
    );
    // R Fwd (naranja oscuro)
    applyHingeLocal(
      doorRFwdMesh.current, doorRFwdNatLocal.current,
      (1 - doorProg) * noseDoorAngleRFwdRef.current,
      0, nosePivotRFwdYRef.current, nosePivotRFwdZRef.current,
      1, 0, 0, s
    );
    // R Aft (naranja claro)
    applyHingeLocal(
      doorRAftMesh.current, doorRAftNatLocal.current,
      (1 - doorProg) * noseDoorAngleRAftRef.current,
      0, nosePivotRAftYRef.current, nosePivotRAftZRef.current,
      1, noseHingeAxisRAftYRef.current, noseHingeAxisRAftZRef.current, s
    );

    // ── Compuertas principales ────────────────────────────────────────────────
    if (gearLDoorPivot.current)
      gearLDoorPivot.current.rotation.x = (1 - doorProg) * gearLDoorAngleRef.current;
    if (gearRDoorPivot.current)
      gearRDoorPivot.current.rotation.x = (1 - doorProg) * gearRDoorAngleRef.current;

    // ── Struts ────────────────────────────────────────────────────────────────
    ["F18-noseGear", "F18-mainGearL", "F18-mainGearR"].forEach(name => {
      const n = nodes[name]; if (n) n.visible = t > 0.05;
    });

    // ── Landing light ─────────────────────────────────────────────────────────
    const light = nodes["F18-landingOnLight"];
    if (light) light.visible = t > 0.95;
  });

  return (
    <primitive
      object={scene}
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={handleClick}
    />
  );
}

useGLTF.preload("/F-18.glb");
