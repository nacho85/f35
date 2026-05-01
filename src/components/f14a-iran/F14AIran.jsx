"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ExhaustPlume } from "../common/ExhaustPlume";
import { HeatShimmer } from "../common/HeatShimmer";
import { SeatedPilot } from "../common/SeatedPilot";
import { PHASE_RANGES as HINGE_PHASE_RANGES } from "./F14AIranDebugHinges";

// Reusable temps para wheel spin
const _wheelTmpQ = new THREE.Quaternion();
const _wheelTmpV = new THREE.Vector3();
import {
  groupOfName, jitteredGroupColor,
  SWEEP_MAX, HOOK_DOWN_ANGLE, HOOK_LERP,
  CANOPY_OPEN_ANGLE, CANOPY_SLIDE_BACK, CANOPY_DROP_Y, CANOPY_LERP,
  createIranHookOverlayMaterial,
  HINGE_DEFS, DEFAULT_HINGES, edgeEndpoints,
  SPOILER_DEFS,
  FLAP_DEFS,
  SLAT_DEFS,
  RUDDER_DEFS,
  HSTAB_DEFS,
  NOZZLE_DEFS, NOZZLE_OPEN_SCALE,
} from "./utils";

// Re-export para compatibilidad con el helper de bisagras (importa de aca).
export { HINGE_DEFS, DEFAULT_HINGES };

export default function F14AIran({
  glbPath = "/F-14A-iran.glb",
  highlightGroup = null,
  highlightName  = null,
  showRaw        = false,
  debug          = false,  // false = sin lineas/sprites de debug + texturas originales
  onClickPart    = null,
  wingSwept      = 0,   // 0 = extendidas (20°), 1 = barridas (68°)
  hookDown       = false,
  canopyOpen     = false,
  hinges         = DEFAULT_HINGES,
  spoilers       = [],
  flaps          = [],
  slats          = [],
  rudders        = [],
  hstabs         = [],
  nozzleDeploy   = 0,
  nozzleClosedOffset = { x: 0, y: 0, z: 0 },
  pilotOffset    = { x: 0, y: 0, z: 0 },
  pilotTilt      = 0,    // grados
  pilotScale     = 1,
  pilotPose      = null,
  pilotEject     = false,
  chuteParams    = null,
  taxiSpeedRef   = null,
  controlsRef    = null,  // ref a { roll, pitch, rudder, throttle, speed, airborne }
  noseGearSteerRef = null,  // ref a steering input -1..+1 (rueda delantera)
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}) {
  const { scene } = useGLTF(glbPath);
  const meta = useRef(new Map());
  const wingL = useRef(null);
  const wingR = useRef(null);
  const wingLOrig = useRef({ x: 0, y: 0, z: 0 });
  const wingROrig = useRef({ x: 0, y: 0, z: 0 });
  const hookPivot = useRef(null);
  const hookRigged = useRef(false);
  const canopyPivot   = useRef(null);
  const canopyRigged  = useRef(false);
  const canopyOrigY   = useRef(0);
  const canopyOrigZ   = useRef(0);
  const canopyT       = useRef(0);  // 0 = cerrado, 1 = abierto
  const gearRigged     = useRef(false);
  // Pivotes + baseline de las 6 bisagras del nose gear (editables por prop).
  // Cada entrada: { pivot, baseP0, baseP1, line, lineGeo } — baseP0/P1 en world.
  const hingeData = useRef([]);
  const hingesRigged = useRef(false);
  // Wheel spin: pivote intermedio dentro de cada wheel group para rotar
  // alrededor del axle (eje de menor extension del bbox local).
  const wheelSpinData = useRef([]);
  const wheelsRigged  = useRef(false);
  const spoilerData    = useRef([]);
  const spoilersRigged = useRef(false);
  const flapData       = useRef([]);
  const flapsRigged    = useRef(false);
  const slatData       = useRef([]);
  const slatsRigged    = useRef(false);
  const rudderData     = useRef([]);
  const ruddersRigged  = useRef(false);
  const hstabData      = useRef([]);
  const hstabsRigged   = useRef(false);
  const nozzleRefs     = useRef([]);
  const nozzlesRigged  = useRef(false);
  // gearDownT animado (1 = full down, 0 = retraido). Se aproxima al target
  // (1 cuando !airborne, 0 cuando airborne) en ~4 segundos.
  const gearDownT = useRef(1);
  // Refs para los plumes (posicion + throttle), uno por nozzle. Memo estable
  // para que ExhaustPlume reciba siempre el mismo objeto entre renders.
  const plumePosRefs = useMemo(() => [
    { current: new THREE.Vector3() },
    { current: new THREE.Vector3() },
  ], []);
  const plumeAxisRefs = useMemo(() => [
    { current: new THREE.Vector3() },
    { current: new THREE.Vector3() },
  ], []);
  const plumeThrottleRef = useRef(0);
  // Anchors de los asientos (detectados del bbox center de group_Seat1/Seat2)
  const [seatAnchors, setSeatAnchors] = useState([]);
  // Canopy fly-off: physics state que toma el control del canopyPivot al ejectar
  const canopyFlyState = useRef({
    active: false,
    vel: new THREE.Vector3(),
    omega: new THREE.Vector3(),
  });
  // Outer group ref — necesario para convertir world↔local cuando el group tiene scale.
  const outerGroupRef = useRef(null);
  // Seat eject: ref al group_Seat1 + estado fisico (sigue al piloto, luego cae con tumble)
  const { scene: rootScene } = useThree();
  const seatGroupRef  = useRef(null);
  const seatPivotRef  = useRef(null);     // pivot envoltorio (abajo-centro del bbox) — para rotar sin desplazar
  const seatBBoxCenter= useRef(new THREE.Vector3()); // world center del bbox al detectarse
  const seatBBoxBottom= useRef(new THREE.Vector3()); // world (cx, minY, cz) — punto pivote
  const seatOrigParent= useRef(null);     // padre original para reset
  const seatOrigPos   = useRef(new THREE.Vector3());
  const seatOrigQuat  = useRef(new THREE.Quaternion());
  const seatFlyState  = useRef({
    active: false, t: 0, postSep: false,
    vel: new THREE.Vector3(),
    omega: new THREE.Vector3(),
  });
  // Canopy: trigger fly-off al ejectar, reset cuando vuelve a false
  useEffect(() => {
    if (pilotEject) {
      if (canopyPivot.current && !canopyFlyState.current.active) {
        canopyFlyState.current.active = true;
        canopyFlyState.current.vel.set(0.4, 20.0, -3.5);
        canopyFlyState.current.omega.set(3.5, 5.0, 4.2);
      }
      // Seat: crear pivot en abajo-centro del bbox (world), reparentar el seat
      // dentro del pivot preservando world transform. Asi rotar el pivot pivotea
      // alrededor del punto fisico del asiento (no su origen interno desplazado).
      if (seatGroupRef.current && !seatFlyState.current.active) {
        const obj = seatGroupRef.current;
        obj.updateWorldMatrix(true, false);
        const pivot = new THREE.Group();
        pivot.position.copy(seatBBoxBottom.current);
        rootScene.add(pivot);
        pivot.attach(obj);   // preserva world transform del seat
        seatPivotRef.current = pivot;
        const s = seatFlyState.current;
        s.active = true; s.t = 0; s.postSep = false;
        s.vel.set(0, 0, 0);
        s.omega.set(0, 0, 0);
      }
    } else {
      // Reset: dejar que la logica normal del canopy lo regrese
      canopyFlyState.current.active = false;
      canopyFlyState.current.vel.set(0, 0, 0);
      canopyFlyState.current.omega.set(0, 0, 0);
      if (canopyPivot.current) {
        canopyPivot.current.position.set(0, canopyOrigY.current, canopyOrigZ.current);
        canopyPivot.current.rotation.set(0, 0, 0);
      }
      // Reset seat
      seatFlyState.current.active = false;
      seatFlyState.current.t = 0;
      seatFlyState.current.postSep = false;
      seatFlyState.current.vel.set(0, 0, 0);
      seatFlyState.current.omega.set(0, 0, 0);
      if (seatGroupRef.current) {
        // Sacar el seat del pivot, restaurar al padre original con pose local
        const obj = seatGroupRef.current;
        obj.removeFromParent();
        if (seatOrigParent.current) seatOrigParent.current.add(obj);
        obj.position.copy(seatOrigPos.current);
        obj.quaternion.copy(seatOrigQuat.current);
        obj.scale.set(1, 1, 1);
      }
      // Eliminar el pivot
      if (seatPivotRef.current) {
        seatPivotRef.current.removeFromParent();
        seatPivotRef.current = null;
      }
    }
  }, [pilotEject]);

  useEffect(() => {
    // CRITICAL: el rigging captura coords WORLD del GLB y las usa como local del
    // scene. Eso solo funciona si scene.matrixWorld es identidad (scale=1).
    // Truco: temporariamente forzamos scale=1 en el outer group, hacemos todo el
    // rigging con matrices natales, y al final restauramos el scale real. Las
    // posiciones capturadas quedan en scene local @ scale=1 — al restaurar scale
    // todo escala proporcionalmente y se ve como en debug pero al tamaño main.
    // Zero out TODA la cadena de transforms ancestros + scale del outer group.
    // Asi el rigging corre con scene.matrixWorld = identity (como en debug
    // scene), todas las capturas de bbox/world matchean los valores de debug
    // exactamente, y no necesitan compensacion por offsets externos.
    let _savedScale = null;
    const _savedAncestorPositions = [];
    if (outerGroupRef.current) {
      _savedScale = outerGroupRef.current.scale.clone();
      outerGroupRef.current.scale.set(1, 1, 1);
      // Save & zero outerGroup position
      _savedAncestorPositions.push({ node: outerGroupRef.current, pos: outerGroupRef.current.position.clone() });
      outerGroupRef.current.position.set(0, 0, 0);
      // Walk up ancestors, save & zero any non-zero positions
      let node = outerGroupRef.current.parent;
      while (node) {
        if (node.position.x !== 0 || node.position.y !== 0 || node.position.z !== 0) {
          _savedAncestorPositions.push({ node, pos: node.position.clone() });
          node.position.set(0, 0, 0);
        }
        node = node.parent;
      }
      outerGroupRef.current.updateWorldMatrix(true, true);
    }
    meta.current.clear();
    scene.traverse(obj => {
      if (!obj.isMesh) return;
      // Excluir overlays del hook: son meshes generados en runtime con shader propio
      // (bandera de Irán). Si entran a meta, el highlight useEffect les asigna un
      // MeshStandardMaterial y borra la bandera. En strict mode el primer effect corre
      // dos veces, asi que este check es obligatorio.
      if (obj.userData?.isHookOverlay) return;
      const name = obj.name || "";
      const group = groupOfName(name);
      const c = jitteredGroupColor(group, name);
      const hex = c.getHex();
      const paintedMat = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.7,
        metalness: 0.1,
        flatShading: false,
      });
      const originalMat = obj.material;
      // Aumentar anisotropy + desactivar normalMap (que produce rayitas por
      // incompatibilidad de tangent space entre el Sketchfab original y lo
      // que three.js espera). Sin normal map = menos bumps, pero limpio.
      if (originalMat) {
        for (const key of ["map", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"]) {
          const tex = originalMat[key];
          if (tex && tex.anisotropy !== 16) {
            tex.anisotropy = 16;
            tex.needsUpdate = true;
          }
        }
        if (originalMat.normalMap) {
          originalMat.normalMap = null;
          originalMat.needsUpdate = true;
        }
      }
      obj.castShadow = true;
      obj.receiveShadow = true;
      meta.current.set(obj, { name, group, baseColorHex: hex, originalMat, paintedMat });
    });

    // Localizar los nodos de grupo creados por rig-f14-labeled.mjs.
    // Guardamos posicion original (deberia ser 0,0,0) para sumar offsets de sweep.
    const gL = scene.getObjectByName("group_Wing_L");
    const gR = scene.getObjectByName("group_Wing_R");
    if (gL) {
      wingL.current = gL;
      wingLOrig.current = { x: gL.position.x, y: gL.position.y, z: gL.position.z };
    }
    if (gR) {
      wingR.current = gR;
      wingROrig.current = { x: gR.position.x, y: gR.position.y, z: gR.position.z };
    }

    // Flaps/Spoilers/LeadFlaps acompañan el sweep del ala. attach() preserva
    // world pos; al estar bajo group_Wing_L/R, heredan rotation.z + offset.
    const WING_FOLLOWERS_L = ["group_Slat_L", "group_Flap_L", "group_FlapInner_L", "group_Spoiler_L"];
    const WING_FOLLOWERS_R = ["group_Slat_R", "group_Flap_R", "group_FlapInner_R", "group_Spoiler_R"];
    const hasAncestor = (obj, anc) => {
      let p = obj.parent;
      while (p) { if (p === anc) return true; p = p.parent; }
      return false;
    };
    if (gL) {
      for (const name of WING_FOLLOWERS_L) {
        const obj = scene.getObjectByName(name);
        if (obj && !hasAncestor(obj, gL)) gL.attach(obj);
      }
    }
    if (gR) {
      for (const name of WING_FOLLOWERS_R) {
        const obj = scene.getObjectByName(name);
        if (obj && !hasAncestor(obj, gR)) gR.attach(obj);
      }
    }

    // Rigging del tail hook: pivote en la bisagra (bounding box world),
    // reparent con attach() para preservar world pos, overlay bandera de Irán.
    // IMPORTANTE: el Sketchfab_model tiene rotacion -90° en X, asi que los ejes
    // world NO coinciden con los locales del manifest. En world, el eje
    // longitudinal del hook es Z (no Y); la cola esta en max Z y arriba en max Y.
    // Por eso seguimos la misma logica de v1 (world Z para la bandera).
    // Solo una vez por vida del scene: re-llamar arruinaria el attach.
    const gHook = scene.getObjectByName("group_TailHook");
    if (gHook && !hookRigged.current) {
      scene.updateWorldMatrix(true, true);
      const hookBB = new THREE.Box3().expandByObject(gHook);
      // Bisagra en (centro X, max Y world = arriba, max Z world = atras/cola).
      const hingePos = new THREE.Vector3(
        (hookBB.min.x + hookBB.max.x) * 0.5,
        hookBB.max.y,
        hookBB.max.z
      );
      const zPivot = hookBB.max.z;
      const zTip   = hookBB.min.z;
      const zRange = zPivot - zTip;

      const overlayMat = createIranHookOverlayMaterial();
      const vp = new THREE.Vector3();
      const addOverlay = (mesh) => {
        mesh.updateWorldMatrix(true, false);
        const pos = mesh.geometry.attributes.position;
        const tArr = new Float32Array(pos.count);
        for (let vi = 0; vi < pos.count; vi++) {
          vp.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
          tArr[vi] = zRange > 0
            ? Math.max(0, Math.min(1, (zPivot - vp.z) / zRange))
            : 0;
        }
        const geo = mesh.geometry.clone();
        geo.setAttribute("hookT", new THREE.BufferAttribute(tArr, 1));
        const overlay = new THREE.Mesh(geo, overlayMat);
        overlay.userData.isHookOverlay = true;
        mesh.add(overlay);
      };

      gHook.traverse(o => {
        if (o.isMesh && !o.userData.isHookOverlay) addOverlay(o);
      });

      const pivot = new THREE.Group();
      pivot.position.copy(hingePos);
      scene.add(pivot);
      pivot.attach(gHook);
      hookPivot.current = pivot;
      hookRigged.current = true;
    }

    // Canopy: levanta hood + frame (no el interior). Pivote en front-top world,
    // igual que v1: (0, bbox.max.y, bbox.min.z). rotation.x < 0 abre hacia atras.
    const gCanopy      = scene.getObjectByName("group_Canopy");
    const gCockpitFrame = scene.getObjectByName("group_CockpitFrame");
    const canopyParts = [gCanopy, gCockpitFrame].filter(Boolean);
    if (canopyParts.length > 0 && !canopyRigged.current) {
      scene.updateWorldMatrix(true, true);
      const bb = new THREE.Box3();
      canopyParts.forEach(n => bb.expandByObject(n));
      const hinge = new THREE.Vector3(0, bb.max.y, bb.min.z);
      const pivot = new THREE.Group();
      pivot.position.copy(hinge);
      scene.add(pivot);
      canopyParts.forEach(n => pivot.attach(n));
      canopyPivot.current = pivot;
      canopyOrigY.current = hinge.y;
      canopyOrigZ.current = hinge.z;
      canopyRigged.current = true;
    }

    // ── Tren de aterrizaje ────────────────────────────────────────────────
    // 7 pivotes independientes, driveados por un solo gearDown ∈ [0..1].
    // Convencion: en la pose del modelo original (GLB) el tren esta EXTENDIDO.
    // Por eso gearDown=1 deja rotaciones en 0; al bajar el slider, cada pivote
    // rota hacia su pose retraida.
    //
    // Pivote = punto de bisagra aproximado. Para struts: esquina interior-superior
    // del bbox (mas cerca del fuselaje). Para doors: borde mas cercano al centro.
    if (!gearRigged.current) {
      scene.updateWorldMatrix(true, true);

      gearRigged.current = true;
    }

    // Bisagras del nose gear: 6 pivotes editables
    if (!hingesRigged.current) {
      // Asegurar matrices al dia para que worldToLocal funcione bien con scale.
      scene.updateWorldMatrix(true, true);
      // Devuelve bbox en LOCAL frame del scene (no world). Necesario cuando el
      // outer group tiene scale (main scene) — sino todos los pivotes quedan
      // mal posicionados al rotar la geometria a la pose final.
      const worldBBox = (objName) => {
        const obj = scene.getObjectByName(objName);
        if (!obj) return null;
        return new THREE.Box3().setFromObject(obj);
      };
      const mkLabel = (text) => {
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#ffff00"; ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        ctx.fillStyle = "#ffff00"; ctx.font = "bold 40px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
        }));
        sprite.scale.set(0.25, 0.125, 1); sprite.renderOrder = 1000;
        return sprite;
      };

      hingeData.current = [];
      for (const def of HINGE_DEFS) {
        const bb = worldBBox(def.bbox);
        const targetNames = Array.isArray(def.target) ? def.target : [def.target];
        const targets = targetNames.map(n => scene.getObjectByName(n)).filter(Boolean);
        if (!bb || targets.length === 0) { hingeData.current.push(null); continue; }

        const [p0, p1] = def.points
          ? [new THREE.Vector3(...def.points[0]), new THREE.Vector3(...def.points[1])]
          : edgeEndpoints(bb, def.edge);

        // Pivote ANIDADO: outer setea posicion + orientacion (X local = eje
        // de la linea). inner se usa para rotation.x que no pisa al outer.
        const outer = new THREE.Group();
        outer.name = `hinge_${def.idx}_outer`;
        const mid = p0.clone().add(p1).multiplyScalar(0.5);
        outer.position.copy(mid);
        // axisLock fuerza el eje de rotacion a un eje principal (X/Y/Z),
        // util para struts con bulon perpendicular donde queremos pitch puro.
        const axis = def.axisLock === "x" ? new THREE.Vector3(1, 0, 0)
                   : def.axisLock === "y" ? new THREE.Vector3(0, 1, 0)
                   : def.axisLock === "z" ? new THREE.Vector3(0, 0, 1)
                   : new THREE.Vector3().subVectors(p1, p0).normalize();
        outer.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
        scene.add(outer);

        const pivot = new THREE.Group();
        pivot.name = `hinge_${def.idx}_pivot`;
        outer.add(pivot);
        // CRITICO: actualizar worldMatrix de outer/pivot antes del attach,
        // sino attach usa matriz vieja y la geometria queda en el lugar viejo.
        outer.updateMatrixWorld(true);
        for (const t of targets) pivot.attach(t);

        // Linea amarilla: endpoints en space del parent (scene por ahora).
        const geo = new THREE.BufferGeometry().setFromPoints([p0, p1]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0xffff00, depthTest: false, transparent: true,
        }));
        line.renderOrder = 999;
        line.raycast = () => {};  // no interceptar clicks
        scene.add(line);

        // Sprite con numero
        const sprite = mkLabel(String(def.idx));
        sprite.raycast = () => {};  // no interceptar clicks
        scene.add(sprite);

        hingeData.current.push({
          def, outer, pivot, baseP0: p0, baseP1: p1, line, lineGeo: geo, sprite,
          parent: scene,
        });
      }

      // HIERARCHY: bisagras con `nestUnder: N` se anidan bajo la pivot inner
      // de la bisagra N, asi heredan su rotacion. Hardcoded default: H5 nest
      // under H6 (joint main strut sigue al rear strut cuando este rota).
      const NESTING = new Map();
      NESTING.set(5, 6);  // H5 nestUnder H6
      for (const hd of hingeData.current) {
        if (hd && hd.def.nestUnder) NESTING.set(hd.def.idx, hd.def.nestUnder);
      }
      for (const [childIdx, parentIdx] of NESTING) {
        const child = hingeData.current[childIdx - 1];
        const parent = hingeData.current[parentIdx - 1];
        if (!child || !parent) continue;
        parent.pivot.attach(child.outer);
        parent.pivot.attach(child.line);
        parent.pivot.attach(child.sprite);
        child.line.position.set(0, 0, 0); child.line.quaternion.identity();
        child.sprite.quaternion.identity();
        // Convertir baseP0/P1 de WORLD a local del pivot parent
        child.baseP0 = parent.pivot.worldToLocal(child.baseP0.clone());
        child.baseP1 = parent.pivot.worldToLocal(child.baseP1.clone());
        child.parent = parent.pivot;
      }

      // Debug: listener para checkear nivel de ruedas al apretar el boton del UI.
      const handleCheckWheels = () => {
        const wheels = [
          "group_NoseGearWheel", "group_MainGearWheel_L", "group_MainGearWheel_R",
        ];
        const rows = [];
        for (const w of wheels) {
          const obj = scene.getObjectByName(w);
          if (!obj) { rows.push({ wheel: w, bottomY: "MISSING" }); continue; }
          const bb = new THREE.Box3().setFromObject(obj);
          rows.push({ wheel: w, bottomY: +bb.min.y.toFixed(4), centerY: +((bb.min.y + bb.max.y) / 2).toFixed(4) });
        }
        console.table(rows);
      };
      window.addEventListener("f14airan-check-wheels", handleCheckWheels);
      // Cleanup no es critico porque el scope del useEffect no recrea (deps=[scene]).

      hingesRigged.current = true;
      console.log(`[F14AIran] ${hingeData.current.filter(Boolean).length}/${HINGE_DEFS.length} bisagras rigged`);
    }

    // Wheel spin: el wheel group tiene origen en (0,0,0) escena, lejos de la
    // rueda — rotarlo directo orbitaria. Solucion: meter un pivote intermedio
    // posicionado en el CENTRO del bbox (en local de g), y attach() los hijos.
    // attach preserva world pos, asi que las meshes no se mueven; al rotar el
    // pivote (cuyo origen ESTA en el axle), giran in-place.
    if (!wheelsRigged.current) {
      scene.updateWorldMatrix(true, true);
      // FRONT wheel: codigo simple que YA FUNCIONA — bbox center + worldX axis.
      // No tocar.
      const setupNoseWheel = (groupName) => {
        const g = scene.getObjectByName(groupName);
        if (!g) return;
        const bb = new THREE.Box3().setFromObject(g);
        const worldCenter = new THREE.Vector3(
          (bb.min.x + bb.max.x) * 0.5,
          (bb.min.y + bb.max.y) * 0.5,
          (bb.min.z + bb.max.z) * 0.5
        );
        // Pivote del steer = ARRIBA del bbox (donde el strut conecta).
        // Asi el wheel orbita alrededor del strut al doblar (no spin sobre si).
        const worldTop = new THREE.Vector3(worldCenter.x, bb.max.y, worldCenter.z);
        g.updateWorldMatrix(true, false);
        // steerGroup en world TOP — rota Y para steering
        const steerGroup = new THREE.Group();
        steerGroup.name = `${groupName}_steer`;
        steerGroup.position.copy(g.worldToLocal(worldTop.clone()));
        g.add(steerGroup);
        steerGroup.updateMatrixWorld(true);
        // spinPivot en world CENTER (del wheel) — child del steerGroup. Asi:
        // - spin rota wheel alrededor de su centro (axle X)
        // - steer rota steerGroup alrededor del top → spinPivot orbita
        const pivot = new THREE.Group();
        pivot.name = `${groupName}_spin`;
        pivot.position.copy(steerGroup.worldToLocal(worldCenter.clone()));
        steerGroup.add(pivot);
        pivot.updateMatrixWorld(true);
        // Reparentar children del wheel group al pivot (preservar world)
        const prevChildren = g.children.filter(c => c !== steerGroup);
        for (const c of prevChildren) pivot.attach(c);
        wheelSpinData.current.push({
          kind: "nose", g, pivot, steerGroup,
          axis: new THREE.Vector3(1, 0, 0),
        });
      };

      // MAIN wheels: PCA REAL via power iteration. El axle = direccion con
      // MENOR varianza (perpendicular a la cara del disco). Funciona aunque
      // el disco este tilteado en g local (bbox-axis-aligned no funcionaria).
      const setupMainWheel = (groupName) => {
        const g = scene.getObjectByName(groupName);
        if (!g) return;

        // Sub-mesh mas grande = neumatico (Object_25/26)
        let bigMesh = null, bigCount = 0;
        g.traverse(c => {
          if (!c.isMesh || !c.geometry) return;
          const cnt = c.geometry.attributes.position.count;
          if (cnt > bigCount) { bigCount = cnt; bigMesh = c; }
        });
        if (!bigMesh) return;

        // Vertices del neumatico en g LOCAL
        const verts = [];
        g.updateWorldMatrix(true, false);
        const invG = new THREE.Matrix4().copy(g.matrixWorld).invert();
        bigMesh.updateWorldMatrix(true, false);
        const pos = bigMesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          verts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(bigMesh.matrixWorld).applyMatrix4(invG));
        }
        const center = new THREE.Vector3();
        verts.forEach(v => center.add(v));
        center.divideScalar(verts.length);
        const centered = verts.map(v => v.clone().sub(center));

        // PCA via power iteration: v1 = max var, v2 = max var perp v1, axle = v1 × v2
        const powerIter = (start, perpTo = null) => {
          const v = start.clone().normalize();
          const acc = new THREE.Vector3();
          for (let it = 0; it < 30; it++) {
            acc.set(0, 0, 0);
            for (const p of centered) acc.addScaledVector(p, p.dot(v));
            if (perpTo) acc.sub(perpTo.clone().multiplyScalar(acc.dot(perpTo)));
            if (acc.lengthSq() > 1e-10) v.copy(acc).normalize();
          }
          return v;
        };
        const v1 = powerIter(new THREE.Vector3(1, 0, 0));
        const seed2 = Math.abs(v1.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const v2 = powerIter(seed2.sub(v1.clone().multiplyScalar(seed2.dot(v1))).normalize(), v1);
        const axleLocal = new THREE.Vector3().crossVectors(v1, v2).normalize();

        // alignGroup: aplica rotacion de alineamiento (axle → +X world) cada frame
        // pivot: child de alignGroup, solo para el spin
        const alignGroup = new THREE.Group();
        alignGroup.name = `${groupName}_align`;
        alignGroup.position.copy(center);
        g.add(alignGroup);

        const pivot = new THREE.Group();
        pivot.name = `${groupName}_spin`;
        alignGroup.add(pivot);
        alignGroup.updateWorldMatrix(true, false);
        pivot.updateWorldMatrix(true, false);

        const prevChildren = g.children.filter(c => c !== alignGroup);
        for (const c of prevChildren) pivot.attach(c);

        const side = groupName.endsWith("_L") ? "L" : "R";
        wheelSpinData.current.push({ kind: "main", pivot, alignGroup, axleLocal, g, side });
        console.log(`[wheel ${groupName}] big=${bigMesh.name} axleLocal=`, axleLocal.toArray());
      };

      setupNoseWheel("group_NoseGearWheel");
      setupMainWheel("group_MainGearWheel_L");
      setupMainWheel("group_MainGearWheel_R");
      wheelsRigged.current = true;
      console.log(`[F14AIran] ${wheelSpinData.current.length} wheels spin-rigged`);
    }

    // Spoilers: bisagras marcadas a mano en world coords. Convertimos a wing
    // local, attachamos outer/inner debajo del wing → siguen el sweep.
    // Mismo patron que las bisagras del tren: yellow line + sprite, attachados
    // al wing (siguen el sweep). Las coords vienen en world; convertimos al
    // frame local del wing.
    if (!spoilersRigged.current) {
      scene.updateWorldMatrix(true, true);
      const mkSpoilerLabel = (text) => {
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#a3e635"; ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        ctx.fillStyle = "#a3e635"; ctx.font = "bold 36px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
        }));
        sprite.scale.set(0.25, 0.125, 1); sprite.renderOrder = 1000;
        return sprite;
      };

      for (const def of SPOILER_DEFS) {
        const target = scene.getObjectByName(def.target);
        const wing   = scene.getObjectByName(def.wingGroup);
        if (!target || !wing) { spoilerData.current.push(null); continue; }

        const p0w = new THREE.Vector3(...def.points[0]);
        const p1w = new THREE.Vector3(...def.points[1]);
        const inv = new THREE.Matrix4().copy(wing.matrixWorld).invert();
        const p0  = p0w.clone().applyMatrix4(inv);
        const p1  = p1w.clone().applyMatrix4(inv);
        const mid = p0.clone().add(p1).multiplyScalar(0.5);
        const axis = new THREE.Vector3().subVectors(p1, p0).normalize();

        const outer = new THREE.Group();
        outer.name = `spoiler_${def.side}_outer`;
        outer.position.copy(mid);
        outer.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
        wing.add(outer);

        const inner = new THREE.Group();
        inner.name = `spoiler_${def.side}_inner`;
        outer.add(inner);
        inner.attach(target);

        const geo = new THREE.BufferGeometry().setFromPoints([p0, p1]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0xa3e635, depthTest: false, transparent: true,
        }));
        line.renderOrder = 999;
        line.raycast = () => {};
        wing.add(line);

        const sprite = mkSpoilerLabel(`S${def.side}`);
        sprite.raycast = () => {};
        sprite.position.copy(mid);
        wing.add(sprite);

        spoilerData.current.push({
          def, outer, pivot: inner, baseP0: p0, baseP1: p1, line, lineGeo: geo, sprite,
        });
      }
      spoilersRigged.current = true;
      console.log(`[F14AIran] ${spoilerData.current.filter(Boolean).length}/${SPOILER_DEFS.length} spoilers rigged`);
    }

    // Flaps: mismo patron que spoilers, sprite cyan ("FL"/"FR").
    if (!flapsRigged.current) {
      scene.updateWorldMatrix(true, true);
      const mkFlapLabel = (text) => {
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        ctx.fillStyle = "#22d3ee"; ctx.font = "bold 36px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
        }));
        sprite.scale.set(0.25, 0.125, 1); sprite.renderOrder = 1000;
        return sprite;
      };

      for (const def of FLAP_DEFS) {
        const target = scene.getObjectByName(def.target);
        const wing   = scene.getObjectByName(def.wingGroup);
        if (!target || !wing) { flapData.current.push(null); continue; }

        const p0w = new THREE.Vector3(...def.points[0]);
        const p1w = new THREE.Vector3(...def.points[1]);
        const inv = new THREE.Matrix4().copy(wing.matrixWorld).invert();
        const p0  = p0w.clone().applyMatrix4(inv);
        const p1  = p1w.clone().applyMatrix4(inv);
        const mid = p0.clone().add(p1).multiplyScalar(0.5);
        const axis = new THREE.Vector3().subVectors(p1, p0).normalize();

        const outer = new THREE.Group();
        outer.name = `flap_${def.side}_outer`;
        outer.position.copy(mid);
        outer.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
        wing.add(outer);

        const inner = new THREE.Group();
        inner.name = `flap_${def.side}_inner`;
        outer.add(inner);
        inner.attach(target);

        const geo = new THREE.BufferGeometry().setFromPoints([p0, p1]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0x22d3ee, depthTest: false, transparent: true,
        }));
        line.renderOrder = 999;
        line.raycast = () => {};
        wing.add(line);

        const sprite = mkFlapLabel(`F${def.side}`);
        sprite.raycast = () => {};
        sprite.position.copy(mid);
        wing.add(sprite);

        flapData.current.push({
          def, outer, pivot: inner, baseP0: p0, baseP1: p1, line, lineGeo: geo, sprite,
        });
      }
      flapsRigged.current = true;
      console.log(`[F14AIran] ${flapData.current.filter(Boolean).length}/${FLAP_DEFS.length} flaps rigged`);
    }

    // Slats: mismo patron, sprite naranja ("LL"/"LR" — Leading edge L/R).
    if (!slatsRigged.current) {
      scene.updateWorldMatrix(true, true);
      const mkSlatLabel = (text) => {
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#fb923c"; ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        ctx.fillStyle = "#fb923c"; ctx.font = "bold 36px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
        }));
        sprite.scale.set(0.25, 0.125, 1); sprite.renderOrder = 1000;
        return sprite;
      };

      for (const def of SLAT_DEFS) {
        const target = scene.getObjectByName(def.target);
        const wing   = scene.getObjectByName(def.wingGroup);
        if (!target || !wing) { slatData.current.push(null); continue; }

        const p0w = new THREE.Vector3(...def.points[0]);
        const p1w = new THREE.Vector3(...def.points[1]);
        const inv = new THREE.Matrix4().copy(wing.matrixWorld).invert();
        const p0  = p0w.clone().applyMatrix4(inv);
        const p1  = p1w.clone().applyMatrix4(inv);
        const mid = p0.clone().add(p1).multiplyScalar(0.5);
        const axis = new THREE.Vector3().subVectors(p1, p0).normalize();

        const outer = new THREE.Group();
        outer.name = `slat_${def.side}_outer`;
        outer.position.copy(mid);
        outer.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
        wing.add(outer);

        const inner = new THREE.Group();
        inner.name = `slat_${def.side}_inner`;
        outer.add(inner);
        inner.attach(target);

        const geo = new THREE.BufferGeometry().setFromPoints([p0, p1]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0xfb923c, depthTest: false, transparent: true,
        }));
        line.renderOrder = 999;
        line.raycast = () => {};
        wing.add(line);

        const sprite = mkSlatLabel(`L${def.side}`);
        sprite.raycast = () => {};
        sprite.position.copy(mid);
        wing.add(sprite);

        slatData.current.push({
          def, outer, pivot: inner, baseP0: p0, baseP1: p1, line, lineGeo: geo, sprite,
        });
      }
      slatsRigged.current = true;
      console.log(`[F14AIran] ${slatData.current.filter(Boolean).length}/${SLAT_DEFS.length} slats rigged`);
    }

    // Rudders: en VStab fijo, attachados directo a scene root.
    if (!ruddersRigged.current) {
      scene.updateWorldMatrix(true, true);
      const mkRudderLabel = (text) => {
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#e879f9"; ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        ctx.fillStyle = "#e879f9"; ctx.font = "bold 36px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
        }));
        sprite.scale.set(0.25, 0.125, 1); sprite.renderOrder = 1000;
        return sprite;
      };

      for (const def of RUDDER_DEFS) {
        const target = scene.getObjectByName(def.target);
        if (!target) { rudderData.current.push(null); continue; }

        // Si hay topAnchor, el eje es bottom_mid → topAnchor (ambos sobre el
        // eje de rotacion). Sino el eje es directamente p0 → p1.
        const bP0 = new THREE.Vector3(...def.points[0]);
        const bP1 = new THREE.Vector3(...def.points[1]);
        const p0 = def.topAnchor ? bP0.clone().add(bP1).multiplyScalar(0.5) : bP0;
        const p1 = def.topAnchor ? new THREE.Vector3(...def.topAnchor)      : bP1;
        const mid = p0.clone().add(p1).multiplyScalar(0.5);
        const axis = new THREE.Vector3().subVectors(p1, p0).normalize();

        const outer = new THREE.Group();
        outer.name = `rudder_${def.side}_outer`;
        outer.position.copy(mid);
        outer.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
        scene.add(outer);

        const inner = new THREE.Group();
        inner.name = `rudder_${def.side}_inner`;
        outer.add(inner);
        inner.attach(target);

        const geo = new THREE.BufferGeometry().setFromPoints([p0, p1]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0xe879f9, depthTest: false, transparent: true,
        }));
        line.renderOrder = 999;
        line.raycast = () => {};
        scene.add(line);

        const sprite = mkRudderLabel(`R${def.side}`);
        sprite.raycast = () => {};
        sprite.position.copy(mid);
        scene.add(sprite);

        rudderData.current.push({
          def, outer, pivot: inner, baseP0: p0, baseP1: p1, line, lineGeo: geo, sprite,
        });
      }
      ruddersRigged.current = true;
      console.log(`[F14AIran] ${rudderData.current.filter(Boolean).length}/${RUDDER_DEFS.length} rudders rigged`);
    }

    // HStabs: stabilator pivot. Attachados a scene root (vstab fijo).
    if (!hstabsRigged.current) {
      scene.updateWorldMatrix(true, true);
      const mkHStabLabel = (text) => {
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        ctx.fillStyle = "#ef4444"; ctx.font = "bold 36px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
        }));
        sprite.scale.set(0.25, 0.125, 1); sprite.renderOrder = 1000;
        return sprite;
      };

      for (const def of HSTAB_DEFS) {
        const target = scene.getObjectByName(def.target);
        if (!target) { hstabData.current.push(null); continue; }

        const p0 = new THREE.Vector3(...def.points[0]);
        const p1 = new THREE.Vector3(...def.points[1]);
        const mid = p0.clone().add(p1).multiplyScalar(0.5);
        const axis = new THREE.Vector3().subVectors(p1, p0).normalize();

        const outer = new THREE.Group();
        outer.name = `hstab_${def.side}_outer`;
        outer.position.copy(mid);
        outer.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
        scene.add(outer);

        const inner = new THREE.Group();
        inner.name = `hstab_${def.side}_inner`;
        outer.add(inner);
        inner.attach(target);

        const geo = new THREE.BufferGeometry().setFromPoints([p0, p1]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0xef4444, depthTest: false, transparent: true,
        }));
        line.renderOrder = 999;
        line.raycast = () => {};
        scene.add(line);

        const sprite = mkHStabLabel(`H${def.side}`);
        sprite.raycast = () => {};
        sprite.position.copy(mid);
        scene.add(sprite);

        hstabData.current.push({
          def, outer, pivot: inner, baseP0: p0, baseP1: p1, line, lineGeo: geo, sprite,
        });
      }
      hstabsRigged.current = true;
      console.log(`[F14AIran] ${hstabData.current.filter(Boolean).length}/${HSTAB_DEFS.length} hstabs rigged`);
    }

    // Nozzles: solo dibujo aros (sin deformacion). Auto-detect con min/max Z.
    if (!nozzlesRigged.current) {
      scene.updateWorldMatrix(true, true);
      for (const def of NOZZLE_DEFS) {
        const grp = scene.getObjectByName(def.target);
        if (!grp) { nozzleRefs.current.push(null); continue; }

        const verts = [];
        grp.traverse(c => {
          if (!c.isMesh || !c.geometry) return;
          c.updateWorldMatrix(true, false);
          const pos = c.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            verts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(c.matrixWorld));
          }
        });
        if (verts.length === 0) { nozzleRefs.current.push(null); continue; }

        let minZ = Infinity, maxZ = -Infinity;
        for (const v of verts) { if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z; }
        const tol = (maxZ - minZ) * 0.05;
        const ringMin = [], ringMax = [];
        for (const v of verts) {
          if (v.z <= minZ + tol) ringMin.push(v);
          else if (v.z >= maxZ - tol) ringMax.push(v);
        }
        const centroid = (cluster) => {
          const c = new THREE.Vector3();
          cluster.forEach(v => c.add(v));
          return c.divideScalar(cluster.length);
        };
        const rear  = centroid(ringMin);
        const front = centroid(ringMax);

        // Capturar mesh-local: por mesh, convierto front/rear world a local,
        // computo axisDir/axisLen en local, y T axial por vertice (sin clampear).
        const meshes = [];
        grp.traverse(c => {
          if (!c.isMesh || !c.geometry) return;
          c.updateWorldMatrix(true, false);
          const w2m = new THREE.Matrix4().copy(c.matrixWorld).invert();
          const localFront = front.clone().applyMatrix4(w2m);
          const localRear  = rear.clone().applyMatrix4(w2m);
          const axisVec = new THREE.Vector3().subVectors(localRear, localFront);
          const axisLen = axisVec.length();
          if (axisLen < 1e-6) return;  // safety
          const axisDir = axisVec.divideScalar(axisLen);

          const pos = c.geometry.attributes.position;
          // origPos: copio explicito con getX/Y/Z para soportar InterleavedBufferAttribute
          const origPos = new Float32Array(pos.count * 3);
          const tArr    = new Float32Array(pos.count);
          const rel = new THREE.Vector3();
          for (let i = 0; i < pos.count; i++) {
            origPos[i*3]   = pos.getX(i);
            origPos[i*3+1] = pos.getY(i);
            origPos[i*3+2] = pos.getZ(i);
            rel.set(origPos[i*3] - localFront.x, origPos[i*3+1] - localFront.y, origPos[i*3+2] - localFront.z);
            tArr[i] = rel.dot(axisDir) / axisLen;
          }
          meshes.push({ mesh: c, origPos, tArr, localFront, axisDir, axisLen, w2m });
        });

        nozzleRefs.current.push({
          grp, front, rear, meshes,
          baseGrpPos: { x: grp.position.x, y: grp.position.y, z: grp.position.z },
        });
        // Setear posicion + eje del exhaust (rear - front normalizado)
        const idx = nozzleRefs.current.length - 1;
        if (plumePosRefs[idx])  plumePosRefs[idx].current.copy(rear);
        if (plumeAxisRefs[idx]) plumeAxisRefs[idx].current.subVectors(rear, front).normalize();
      }
      nozzlesRigged.current = true;
    }

    // Seat anchor (solo Seat1 = piloto delantero)
    scene.updateWorldMatrix(true, true);
    const anchors = [];
    const g = scene.getObjectByName("group_Seat1");
    if (g) {
      const bb = new THREE.Box3().setFromObject(g);
      const cWorld = new THREE.Vector3(); bb.getCenter(cWorld);
      // Pivote del seat eject (rootScene = world frame): abajo-centro del bbox.
      seatBBoxBottom.current.set(cWorld.x, bb.min.y, cWorld.z);
      // Anchor del SeatedPilot: convertir world → local del outer group, ya que
      // el SeatedPilot se renderiza adentro de ese group (que tiene scale).
      const cLocal = cWorld.clone();
      if (outerGroupRef.current) {
        outerGroupRef.current.updateWorldMatrix(true, false);
        outerGroupRef.current.worldToLocal(cLocal);
      }
      anchors.push({ name: "group_Seat1", pos: [cLocal.x, cLocal.y, cLocal.z] });
      seatGroupRef.current = g;
      seatOrigParent.current = g.parent;
      seatOrigPos.current.copy(g.position);
      seatOrigQuat.current.copy(g.quaternion);
      seatBBoxCenter.current.copy(cWorld);
    }
    if (anchors.length) setSeatAnchors(anchors);

    if (typeof window !== 'undefined') {
      window.__F14_PLUME_POSREFS = plumePosRefs;
      window.__F14_PLUME_THR = plumeThrottleRef;
      window.__F14_OUTER = outerGroupRef.current;
    }
    // Restaurar scale + posiciones de ancestros que zeroamos.
    if (outerGroupRef.current && _savedScale) {
      outerGroupRef.current.scale.copy(_savedScale);
    }
    for (const { node, pos } of _savedAncestorPositions) {
      node.position.copy(pos);
    }
    if (outerGroupRef.current) outerGroupRef.current.updateWorldMatrix(true, true);
  }, [scene]);

  // Wing sweep — mismos numeros que F14.jsx (v1). El eje X del v6 esta
  // invertido respecto al v1 (x>0 = izq), pero la formula x += ±0.6*sweep
  // ya considera ese signo por ala, asi que se mantiene igual.
  useFrame((_state, delta) => {
    // Valores efectivos: si hay controlsRef, los derivamos del estado del avion
    // (throttle/velocidad). Sino usamos los props como fallback.
    let effSweep = wingSwept;
    let effNozzle = nozzleDeploy;
    let effFlaps    = flaps;
    let effSlats    = slats;
    let effSpoilers = spoilers;
    let effRudders  = rudders;
    let effHStabs   = hstabs;
    let effHinges   = hinges;
    if (controlsRef?.current) {
      const c = controlsRef.current;
      // Wing sweep schedule del F-14: extendidas (0%) a baja velocidad,
      // barridas (100%) a alta velocidad. Linear ramp 130-230 m/s (~250-450 kt).
      const speed = c.speed ?? 0;
      effSweep = THREE.MathUtils.clamp((speed - 130) / 100, 0, 1);
      // Nozzle abre con throttle (afterburner). throttle=0 → cerrado, throttle=1 → abierto.
      effNozzle = c.throttle ?? 0;

      // ── Superficies de control ────────────────────────────────────────
      // Magnitudes full-deploy (matchean defaults del debug scene).
      const D2R   = Math.PI / 180;
      const FLAP_FULL_DEG  = 35;
      const SLAT_L_DEG     = -17;
      const SLAT_R_DEG     =  17;
      const SLAT_OFFSET_X_L =  0.05, SLAT_OFFSET_X_R = -0.05;
      const SLAT_OFFSET_Y   = -0.17;
      const SPOILER_FULL_DEG = -56;
      const SPOILER_OFFSET_L = { x: 0.01, y: -0.09, z: 0.03 };
      const SPOILER_OFFSET_R = { x: 0,    y:  0.06, z: 0.07 };
      const RUDDER_FULL_DEG  = 30;
      const HSTAB_FULL_DEG   = 20;

      // Schedule flaps/slats con velocidad (deploy en aproximacion). Linear
      // ramp 110→140 m/s: 1 a baja, 0 a alta.
      const fSched = THREE.MathUtils.clamp(1 - (speed - 110) / 30, 0, 1);
      effFlaps = [
        { x: 0, y: 0, z: 0, angle: FLAP_FULL_DEG * D2R * fSched },
        { x: 0, y: 0, z: 0, angle: FLAP_FULL_DEG * D2R * fSched },
      ];
      effSlats = [
        { x: SLAT_OFFSET_X_L * fSched, y: SLAT_OFFSET_Y * fSched, z: 0,
          angle: SLAT_L_DEG * D2R * fSched },
        { x: SLAT_OFFSET_X_R * fSched, y: SLAT_OFFSET_Y * fSched, z: 0,
          angle: SLAT_R_DEG * D2R * fSched },
      ];

      // Spoilers como roll-assist: la rueda que baja levanta el spoiler.
      // roll>0 = banco derecho (ala derecha baja) → R spoiler arriba.
      // Authority cae a 0 cuando el ala se barre (>50% sweep), igual que
      // el avion real: a alta velocidad el roll lo manda el rolling tail.
      const roll = c.roll ?? 0;
      const spoilerAuth = 1 - THREE.MathUtils.smoothstep(effSweep, 0.40, 0.70);
      const tSpoilerR = Math.max(0, roll) * spoilerAuth;
      const tSpoilerL = Math.max(0, -roll) * spoilerAuth;
      // L tiene invertDeploy=true: el modelo viene OPEN, asi que la pose
      // "full" representa el cierre. Para abrir el L, t aplicado = 1 - tSpoilerL.
      const tApplyL = 1 - tSpoilerL;
      const tApplyR = tSpoilerR;
      effSpoilers = [
        { x: SPOILER_OFFSET_L.x * tApplyL, y: SPOILER_OFFSET_L.y * tApplyL,
          z: SPOILER_OFFSET_L.z * tApplyL, angle: SPOILER_FULL_DEG * D2R * tApplyL },
        { x: SPOILER_OFFSET_R.x * tApplyR, y: SPOILER_OFFSET_R.y * tApplyR,
          z: SPOILER_OFFSET_R.z * tApplyR, angle: SPOILER_FULL_DEG * D2R * tApplyR },
      ];

      // Rudders por yaw (-1..+1). Ambos deflectan en el mismo signo.
      const rudder = c.rudder ?? 0;
      effRudders = [
        { x: 0, y: 0, z: 0, angle: RUDDER_FULL_DEG * D2R * rudder },
        { x: 0, y: 0, z: 0, angle: RUDDER_FULL_DEG * D2R * rudder },
      ];

      // Gear: animar gearDownT hacia target (1 cuando en tierra, 0 en vuelo).
      // RETRACT_TIME ~4s = transicion completa de full down → retraido.
      const RETRACT_TIME = 4.0;
      const gearTarget = c.airborne ? 0 : 1;
      const gd = gearDownT.current;
      const step = delta / RETRACT_TIME;
      gearDownT.current = gd + Math.sign(gearTarget - gd) *
        Math.min(Math.abs(gearTarget - gd), step);
      // effHinges = hinges (full deploy pose) × phase(gearDownT, [a,b]) por bisagra.
      const _gdT = gearDownT.current;
      effHinges = hinges.map((h, i) => {
        const range = HINGE_PHASE_RANGES[i] || [0, 1];
        const p = Math.max(0, Math.min(1, (_gdT - range[0]) / (range[1] - range[0])));
        return { x: h.x * p, y: h.y * p, z: h.z * p, angle: h.angle * p };
      });

      // HStabs (stabilators) por pitch (-1..+1). Pitch nose-up → trailing
      // edge UP → angle negativo (ajustar signo segun convencion del modelo).
      const pitch = c.pitch ?? 0;
      // Rolling tail: deflexion diferencial de stabilators ayuda al roll.
      // Mix ~50% del rango full. roll>0 (banco der) → L trailing edge down,
      // R trailing edge up (eleva R, baja L → genera roll a la derecha).
      const HSTAB_ROLL_MIX = 0.5;
      const pitchAng = -HSTAB_FULL_DEG * D2R * pitch;
      const rollAng  = -HSTAB_FULL_DEG * D2R * roll * HSTAB_ROLL_MIX;
      effHStabs = [
        { x: 0, y: 0, z: 0, angle: pitchAng + rollAng },
        { x: 0, y: 0, z: 0, angle: pitchAng - rollAng },
      ];
    }

    const sweep = effSweep * SWEEP_MAX;
    if (wingL.current) {
      const o = wingLOrig.current;
      wingL.current.position.x = o.x + effSweep * 0.6;
      wingL.current.position.y = o.y + effSweep * (-2.17);
      wingL.current.position.z = o.z;
      wingL.current.rotation.z = sweep;
    }
    if (wingR.current) {
      const o = wingROrig.current;
      wingR.current.position.x = o.x - effSweep * 0.6;
      wingR.current.position.y = o.y + effSweep * (-2.17);
      wingR.current.position.z = o.z;
      wingR.current.rotation.z = -sweep;
    }

    // Tail hook: rotación X con lerp. Si hookDown, bajar la punta.
    if (hookPivot.current) {
      const target = hookDown ? HOOK_DOWN_ANGLE : 0;
      hookPivot.current.rotation.x +=
        (target - hookPivot.current.rotation.x) * HOOK_LERP;
    }

    // Canopy: un solo factor T (0→1) drivea rotacion + desplazamiento axial.
    // Asi siempre se abre Y se corre hacia atras juntos, sin desfasajes.
    if (canopyPivot.current) {
      const fs = canopyFlyState.current;
      if (fs.active) {
        // Fly-off: gravedad + velocidad lineal + rotacion por omega
        fs.vel.y += -9.8 * delta;
        canopyPivot.current.position.addScaledVector(fs.vel, delta);
        canopyPivot.current.rotation.x += fs.omega.x * delta;
        canopyPivot.current.rotation.y += fs.omega.y * delta;
        canopyPivot.current.rotation.z += fs.omega.z * delta;
      } else {
        const targetT = canopyOpen ? 1 : 0;
        canopyT.current += (targetT - canopyT.current) * CANOPY_LERP;
        canopyPivot.current.rotation.x = canopyT.current * CANOPY_OPEN_ANGLE;
        canopyPivot.current.position.y =
          canopyOrigY.current + canopyT.current * CANOPY_DROP_Y;
        canopyPivot.current.position.z =
          canopyOrigZ.current + canopyT.current * CANOPY_SLIDE_BACK;
      }
    }

    // Asiento eyector: la fisica se aplica al PIVOT (su origen = abajo-centro
    // del bbox del asiento). Asi rotar pivotea alrededor de un punto coherente.
    if (seatPivotRef.current && seatFlyState.current.active) {
      const s = seatFlyState.current;
      s.t += delta;
      const t = s.t;
      const T_IGN = 0.05, T_CAT = 0.25, T_ROCK = 0.62, T_SEP = 0.90;
      const gravity = -5.5;
      let rocketAccel = 0;
      if (t >= T_IGN && t < T_CAT)        rocketAccel = 55.0;
      else if (t >= T_CAT && t < T_ROCK)  rocketAccel = 16.0;

      if (t >= T_IGN) {
        const g = s.postSep ? gravity * 1.4 : gravity + rocketAccel;
        s.vel.y += g * delta;
        s.vel.x *= 0.99;
        s.vel.z *= 0.99;
        seatPivotRef.current.position.addScaledVector(s.vel, delta);
      }

      if (!s.postSep && t >= T_SEP) {
        s.postSep = true;
        s.omega.set(0, 0, 0.7); // roll Z local — pivotea en abajo-centro
      }
      if (s.postSep) {
        const dq = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(s.omega.x * delta, 0, s.omega.z * delta, "XYZ")
        );
        seatPivotRef.current.quaternion.multiply(dq);
      }
    }

    // Bisagras (nose + main gear): offset → mueve outer (posicion de la linea),
    // angle → inner.rotation.x (rota alrededor del eje de la linea que outer
    // ya alineo con X local al setup).
    for (let i = 0; i < hingeData.current.length; i++) {
      const hd = hingeData.current[i];
      if (!hd) continue;
      const cfg = effHinges[i] || DEFAULT_HINGES[i];
      const ox = cfg.x || 0, oy = cfg.y || 0, oz = cfg.z || 0;
      const p0 = hd.baseP0.clone().add(new THREE.Vector3(ox, oy, oz));
      const p1 = hd.baseP1.clone().add(new THREE.Vector3(ox, oy, oz));
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      hd.outer.position.copy(mid);
      hd.pivot.rotation.x = cfg.angle || 0;
      const posAttr = hd.lineGeo.attributes.position;
      posAttr.setXYZ(0, p0.x, p0.y, p0.z);
      posAttr.setXYZ(1, p1.x, p1.y, p1.z);
      posAttr.needsUpdate = true;
      hd.sprite.position.copy(mid);
      hd.sprite.position.y += 0.05;
    }

    // Spoilers: mismo patron que bisagras. offset (xyz) mueve el outer al
    // mid de p0+offset/p1+offset, y angle rota el inner.
    for (let i = 0; i < spoilerData.current.length; i++) {
      const sd = spoilerData.current[i];
      if (!sd) continue;
      const cfg = effSpoilers[i] || { x: 0, y: 0, z: 0, angle: 0 };
      const ox = cfg.x || 0, oy = cfg.y || 0, oz = cfg.z || 0;
      const p0 = sd.baseP0.clone().add(new THREE.Vector3(ox, oy, oz));
      const p1 = sd.baseP1.clone().add(new THREE.Vector3(ox, oy, oz));
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      sd.outer.position.copy(mid);
      sd.pivot.rotation.x = cfg.angle || 0;
      const posAttr = sd.lineGeo.attributes.position;
      posAttr.setXYZ(0, p0.x, p0.y, p0.z);
      posAttr.setXYZ(1, p1.x, p1.y, p1.z);
      posAttr.needsUpdate = true;
      sd.sprite.position.copy(mid);
      sd.sprite.position.y += 0.05;
    }

    // Flaps: mismo loop que spoilers
    for (let i = 0; i < flapData.current.length; i++) {
      const fd = flapData.current[i];
      if (!fd) continue;
      const cfg = effFlaps[i] || { x: 0, y: 0, z: 0, angle: 0 };
      const ox = cfg.x || 0, oy = cfg.y || 0, oz = cfg.z || 0;
      const p0 = fd.baseP0.clone().add(new THREE.Vector3(ox, oy, oz));
      const p1 = fd.baseP1.clone().add(new THREE.Vector3(ox, oy, oz));
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      fd.outer.position.copy(mid);
      fd.pivot.rotation.x = cfg.angle || 0;
      const posAttr = fd.lineGeo.attributes.position;
      posAttr.setXYZ(0, p0.x, p0.y, p0.z);
      posAttr.setXYZ(1, p1.x, p1.y, p1.z);
      posAttr.needsUpdate = true;
      fd.sprite.position.copy(mid);
      fd.sprite.position.y += 0.05;
    }

    // Slats
    for (let i = 0; i < slatData.current.length; i++) {
      const ld = slatData.current[i];
      if (!ld) continue;
      const cfg = effSlats[i] || { x: 0, y: 0, z: 0, angle: 0 };
      const ox = cfg.x || 0, oy = cfg.y || 0, oz = cfg.z || 0;
      const p0 = ld.baseP0.clone().add(new THREE.Vector3(ox, oy, oz));
      const p1 = ld.baseP1.clone().add(new THREE.Vector3(ox, oy, oz));
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      ld.outer.position.copy(mid);
      ld.pivot.rotation.x = cfg.angle || 0;
      const posAttr = ld.lineGeo.attributes.position;
      posAttr.setXYZ(0, p0.x, p0.y, p0.z);
      posAttr.setXYZ(1, p1.x, p1.y, p1.z);
      posAttr.needsUpdate = true;
      ld.sprite.position.copy(mid);
      ld.sprite.position.y += 0.05;
    }

    // Rudders
    for (let i = 0; i < rudderData.current.length; i++) {
      const rd = rudderData.current[i];
      if (!rd) continue;
      const cfg = effRudders[i] || { x: 0, y: 0, z: 0, angle: 0 };
      const ox = cfg.x || 0, oy = cfg.y || 0, oz = cfg.z || 0;
      const p0 = rd.baseP0.clone().add(new THREE.Vector3(ox, oy, oz));
      const p1 = rd.baseP1.clone().add(new THREE.Vector3(ox, oy, oz));
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      rd.outer.position.copy(mid);
      rd.pivot.rotation.x = cfg.angle || 0;
      const posAttr = rd.lineGeo.attributes.position;
      posAttr.setXYZ(0, p0.x, p0.y, p0.z);
      posAttr.setXYZ(1, p1.x, p1.y, p1.z);
      posAttr.needsUpdate = true;
      rd.sprite.position.copy(mid);
      rd.sprite.position.y += 0.05;
    }

    // Nozzles: taper en mesh-local. f=1 en t=0 (frente fijo), f=fondoF en t=1
    // (fondo achica). fondoF = lerp(closedF, 1, deploy). En deploy=1 no cambia.
    // Adicionalmente: nozzleClosedOffset traslada la pieza ENTERA al cerrar.
    const closedFactor = 1 / NOZZLE_OPEN_SCALE;
    const fondoF = closedFactor + (1 - closedFactor) * effNozzle;
    const closedAmt = 1 - effNozzle;
    const axisPt = new THREE.Vector3();
    plumeThrottleRef.current = effNozzle;
    for (let nzi = 0; nzi < nozzleRefs.current.length; nzi++) {
      const nz = nozzleRefs.current[nzi];
      if (!nz || !nz.meshes) continue;
      // Trasladar la pieza entera (group.position) por offset * (1-deploy)
      const offX = (nozzleClosedOffset.x || 0) * closedAmt;
      const offY = (nozzleClosedOffset.y || 0) * closedAmt;
      const offZ = (nozzleClosedOffset.z || 0) * closedAmt;
      nz.grp.position.set(nz.baseGrpPos.x + offX, nz.baseGrpPos.y + offY, nz.baseGrpPos.z + offZ);
      // El plume se ancla en rear + offset (sigue a la pieza al cerrar)
      if (plumePosRefs[nzi]) plumePosRefs[nzi].current.set(nz.rear.x + offX, nz.rear.y + offY, nz.rear.z + offZ);
      // Taper de petalos
      for (const m of nz.meshes) {
        const pos = m.mesh.geometry.attributes.position;
        const op = m.origPos;
        const tArr = m.tArr;
        for (let i = 0; i < pos.count; i++) {
          const t  = tArr[i];
          const tC = Math.max(0, Math.min(1, t));
          const f  = 1 + (fondoF - 1) * tC;
          axisPt.copy(m.axisDir).multiplyScalar(t * m.axisLen).add(m.localFront);
          const rx = op[i*3]   - axisPt.x;
          const ry = op[i*3+1] - axisPt.y;
          const rz = op[i*3+2] - axisPt.z;
          pos.setXYZ(i, axisPt.x + rx * f, axisPt.y + ry * f, axisPt.z + rz * f);
        }
        // eslint-disable-next-line react-hooks/immutability
        pos.needsUpdate = true;
      }
    }

    // HStabs
    for (let i = 0; i < hstabData.current.length; i++) {
      const hd = hstabData.current[i];
      if (!hd) continue;
      const cfg = effHStabs[i] || { x: 0, y: 0, z: 0, angle: 0 };
      const ox = cfg.x || 0, oy = cfg.y || 0, oz = cfg.z || 0;
      const p0 = hd.baseP0.clone().add(new THREE.Vector3(ox, oy, oz));
      const p1 = hd.baseP1.clone().add(new THREE.Vector3(ox, oy, oz));
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      hd.outer.position.copy(mid);
      hd.pivot.rotation.x = cfg.angle || 0;
      const posAttr = hd.lineGeo.attributes.position;
      posAttr.setXYZ(0, p0.x, p0.y, p0.z);
      posAttr.setXYZ(1, p1.x, p1.y, p1.z);
      posAttr.needsUpdate = true;
      hd.sprite.position.copy(mid);
      hd.sprite.position.y += 0.05;
    }

    // Steer FIJO de -5° espejado en las ruedas traseras (siempre aplicado,
    // independiente de si W esta apretado).
    for (const ws of wheelSpinData.current) {
      if (ws.kind !== "main") continue;
      const STEER = THREE.MathUtils.degToRad(-5);
      const sign = ws.side === "L" ? 1 : -1;
      ws.g.getWorldQuaternion(_wheelTmpQ);
      _wheelTmpV.set(0, 1, 0).applyQuaternion(_wheelTmpQ.invert());
      ws.alignGroup.quaternion.setFromAxisAngle(_wheelTmpV, STEER * sign);
    }

    // Nose wheel STEERING: input -1..+1 con clamp a ±NOSE_STEER_MAX.
    // Eje de rotacion = world Y (vertical) convertido al frame local del wheel.
    const NOSE_STEER_MAX = THREE.MathUtils.degToRad(35);
    const steerInput = THREE.MathUtils.clamp(noseGearSteerRef?.current ?? 0, -1, 1);
    for (const ws of wheelSpinData.current) {
      if (ws.kind !== "nose" || !ws.steerGroup) continue;
      ws.g.getWorldQuaternion(_wheelTmpQ);
      _wheelTmpV.set(0, 1, 0).applyQuaternion(_wheelTmpQ.invert());
      ws.steerGroup.quaternion.setFromAxisAngle(_wheelTmpV, -steerInput * NOSE_STEER_MAX);
    }

    // Wheel spin — proporcional a taxiSpeedRef (m/s). Solo gira si gear
    // esta extendido (no tiene sentido girar plegadas dentro del bay).
    const taxiSpeed = taxiSpeedRef?.current ?? 0;
    if (taxiSpeed > 0.01 && wheelSpinData.current.length) {
      const WHEEL_RADIUS = 0.4;
      const omega = taxiSpeed / WHEEL_RADIUS;
      const dAngle = omega * delta;
      for (const ws of wheelSpinData.current) {
        if (ws.kind === "nose") {
          // Spin alrededor del axle LOCAL (no world X). Asi al doblar el avion
          // el axis de spin gira con el avion → wheel rola en la direccion
          // correcta sin "volverse loca".
          ws.pivot.rotateOnAxis(ws.axis, dAngle);
        } else {
          _wheelTmpQ.copy(ws.pivot.quaternion).invert();
          _wheelTmpV.copy(ws.axleLocal).applyQuaternion(_wheelTmpQ);
          ws.pivot.rotateOnAxis(_wheelTmpV, dAngle);
        }
      }
    }
  });

  useEffect(() => {
    const matchName  = highlightName  ? (n => n === highlightName) : null;
    const matchGroup = highlightGroup ? (g => g === highlightGroup) : null;
    const hasFilter = !!(matchName || matchGroup);
    // En modo no-debug forzamos texturas originales (sin recoloreo por groups).
    const useRaw = showRaw || !debug;

    scene.traverse(obj => {
      if (!obj.isMesh) return;
      const info = meta.current.get(obj);
      if (!info) return;

      const matches = !hasFilter
        || (matchName  && matchName(info.name))
        || (matchGroup && matchGroup(info.group));

      if (useRaw) {
        obj.material = info.originalMat;
        if (hasFilter && !matches) {
          const dim = info.originalMat.clone();
          dim.transparent = true;
          dim.opacity = 0.06;
          dim.depthWrite = false;
          obj.material = dim;
        }
      } else {
        const mat = info.paintedMat;
        obj.material = mat;
        if (matches) {
          mat.color.setHex(info.baseColorHex);
          mat.opacity = 1;
          mat.transparent = false;
          mat.depthWrite = true;
        } else {
          mat.color.setHex(0x151515);
          mat.opacity = 0.06;
          mat.transparent = true;
          mat.depthWrite = false;
        }
        mat.needsUpdate = true;
      }
    });
  }, [highlightGroup, highlightName, showRaw, debug, scene]);

  // Toggle visibilidad de las lineas y sprites de debug (bisagras, spoilers,
  // flaps, slats, rudders, hstabs). Corre cuando debug cambia o tras rigging.
  useEffect(() => {
    const toggle = (arr) => arr?.forEach(d => {
      if (d?.line)   d.line.visible   = debug;
      if (d?.sprite) d.sprite.visible = debug;
    });
    toggle(hingeData.current);
    toggle(spoilerData.current);
    toggle(flapData.current);
    toggle(slatData.current);
    toggle(rudderData.current);
    toggle(hstabData.current);
  }, [debug, scene]);

  return (
    <group ref={outerGroupRef} position={position} rotation={rotation} scale={scale}>
      <primitive
        object={scene}
        onClick={e => {
          e.stopPropagation();
          const obj = e.object;
          const info = meta.current.get(obj);
          if (info && onClickPart) onClickPart({ ...info, point: e.point.toArray() });
          const p = e.point.toArray();
          console.log("[F14AIran click]", obj.name, "world:",
            `[${p[0].toFixed(5)}, ${p[1].toFixed(5)}, ${p[2].toFixed(5)}]`);
        }}
      />
      <ExhaustPlume posRef={plumePosRefs[0]} throttleRef={plumeThrottleRef} />
      <ExhaustPlume posRef={plumePosRefs[1]} throttleRef={plumeThrottleRef} />
      <HeatShimmer  posRef={plumePosRefs[0]} axisRef={plumeAxisRefs[0]} throttleRef={plumeThrottleRef} />
      <HeatShimmer  posRef={plumePosRefs[1]} axisRef={plumeAxisRefs[1]} throttleRef={plumeThrottleRef} />
      {seatAnchors.map(s => (
        <SeatedPilot key={s.name}
          position={[s.pos[0] + pilotOffset.x, s.pos[1] + pilotOffset.y, s.pos[2] + pilotOffset.z]}
          tilt={pilotTilt}
          scale={pilotScale}
          pose={pilotPose}
          eject={pilotEject}
          chuteParams={chuteParams}
        />
      ))}
    </group>
  );
}

useGLTF.preload("/F-14A-iran.glb");
