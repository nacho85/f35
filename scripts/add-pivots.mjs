// Agrega Empties (nodos sin mesh) al F-14A-iran.glb en las posiciones
// correctas de las bisagras, para que el rigging JS solo tenga que
// scene.getObjectByName("pivot_XXX") y attachear/rotar, sin calcular bboxes.
//
// Corre despues de rig-f14-labeled.mjs. Idempotente: si los pivotes ya existen,
// los reemplaza.

import { NodeIO } from '../node_modules/@gltf-transform/core/dist/index.modern.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IN_PATH  = resolve(ROOT, 'public/F-14A-iran.glb');
const OUT_PATH = IN_PATH; // in-place

// Helpers: walk scene computing world matrices, collect world bbox per group_XXX
function mat4Identity() { return new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function mat4Mul(a, b) {
  const o = new Float64Array(16);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r*4+k] * b[k*4+c];
      o[r*4+c] = s;
    }
  return o;
}
function trsToMat(t, r, s) {
  const [x,y,z,w] = r;
  const [sx,sy,sz] = s;
  const xx=x*x, yy=y*y, zz=z*z, xy=x*y, xz=x*z, yz=y*z, wx=w*x, wy=w*y, wz=w*z;
  return new Float64Array([
    (1-2*(yy+zz))*sx, 2*(xy+wz)*sx, 2*(xz-wy)*sx, 0,
    2*(xy-wz)*sy, (1-2*(xx+zz))*sy, 2*(yz+wx)*sy, 0,
    2*(xz+wy)*sz, 2*(yz-wx)*sz, (1-2*(xx+yy))*sz, 0,
    t[0], t[1], t[2], 1,
  ]);
}
function applyMat(m, x, y, z) {
  return [
    m[0]*x + m[4]*y + m[8]*z + m[12],
    m[1]*x + m[5]*y + m[9]*z + m[13],
    m[2]*x + m[6]*y + m[10]*z + m[14],
  ];
}

const io = new NodeIO();
const doc = await io.read(IN_PATH);
const root = doc.getRoot();
const scene = root.listScenes()[0];

// Descubrir nodos hijos del Sketchfab_model (que es donde viven los group_XXX)
const sceneRoots = scene.listChildren();
const primaryRoot = sceneRoots.find(n => (n.getName() || '') === 'Sketchfab_model') ?? sceneRoots[0];

// Borrar pivotes previos (idempotencia) — buscar en toda la escena
function removePivots(node) {
  for (const child of [...node.listChildren()]) {
    if ((child.getName() || '').startsWith('pivot_')) {
      const parent = child.getParentNode();
      if (parent) parent.removeChild(child);
      else scene.removeChild(child);
      child.dispose();
    } else {
      removePivots(child);
    }
  }
}
removePivots(primaryRoot);
for (const n of [...scene.listChildren()]) {
  if ((n.getName() || '').startsWith('pivot_')) { scene.removeChild(n); n.dispose(); }
}

// Colectar bbox world por group
const groupBox = new Map();
function walk(node, parentM) {
  const localM = trsToMat(node.getTranslation(), node.getRotation(), node.getScale());
  const worldM = mat4Mul(parentM, localM);
  const name = node.getName() || '';
  const mesh = node.getMesh();
  if (mesh) {
    // buscar que group_XXX es ancestro
    let ancestor = node;
    let groupName = null;
    while (ancestor) {
      const an = ancestor.getName() || '';
      if (an.startsWith('group_')) { groupName = an.slice(6); break; }
      ancestor = ancestor.getParentNode();
    }
    if (groupName) {
      const prim = mesh.listPrimitives()[0];
      const pos = prim && prim.getAttribute('POSITION');
      if (pos) {
        const arr = pos.getArray();
        let bx = groupBox.get(groupName);
        if (!bx) { bx = { mn: [Infinity,Infinity,Infinity], mx: [-Infinity,-Infinity,-Infinity] }; groupBox.set(groupName, bx); }
        for (let i = 0; i < pos.getCount(); i++) {
          const [wx, wy, wz] = applyMat(worldM, arr[i*3], arr[i*3+1], arr[i*3+2]);
          if (wx < bx.mn[0]) bx.mn[0] = wx; if (wx > bx.mx[0]) bx.mx[0] = wx;
          if (wy < bx.mn[1]) bx.mn[1] = wy; if (wy > bx.mx[1]) bx.mx[1] = wy;
          if (wz < bx.mn[2]) bx.mn[2] = wz; if (wz > bx.mx[2]) bx.mx[2] = wz;
        }
      }
    }
  }
  for (const c of node.listChildren()) walk(c, worldM);
}
for (const n of scene.listChildren()) walk(n, mat4Identity());

function bb(group) { return groupBox.get(group); }
function cx(b) { return (b.mn[0] + b.mx[0]) * 0.5; }
function cy(b) { return (b.mn[1] + b.mx[1]) * 0.5; }
function cz(b) { return (b.mn[2] + b.mx[2]) * 0.5; }

// Definicion de pivotes: name -> posicion en WORLD space
// Los Empties se agregan como hijos del primaryRoot (hermanos de los group_XXX),
// que suele tener la misma transform world que la escena principal. Igual los
// insertamos en WORLD porque primaryRoot.matrixWorld = identidad.
const PIVOTS = [];

function addPivot(name, pos) {
  if (!pos) { console.warn(`[add-pivots] SKIP ${name} (grupo faltante)`); return; }
  PIVOTS.push({ name, pos });
}

{
  // pivot_NoseGearStrut = JOINT entre main strut y rear strut.
  // En Y, tiene que caer en el max.y del REAR strut (donde esta el hinge,
  // NO en el max.y del main strut que es el extremo superior fuera del joint).
  // En Z, min.z del main strut (= extremo del strut que enfrenta al rear).
  const strut = bb('NoseGearStrut');
  const rear  = bb('NoseGearStrutRear');
  if (strut && rear) {
    addPivot('pivot_NoseGearStrut', [cx(strut), rear.mx[1], strut.mn[2]]);
  } else if (strut) {
    addPivot('pivot_NoseGearStrut', [cx(strut), strut.mx[1] - 0.05, strut.mn[2] + 0.1]);
  }
}
{
  const sr = bb('NoseGearStrutRear');
  // extremo superior (hacia el fuselaje): min.z, min.y
  if (sr) addPivot('pivot_NoseGearStrutRear', [cx(sr), sr.mn[1], sr.mn[2]]);
}
{
  const aL = bb('NoseGearDragBraceRearAnchorL');
  const aR = bb('NoseGearDragBraceRearAnchorR');
  if (aL && aR) {
    // Pivote central (eje de bisagra entre los dos anchors)
    addPivot('pivot_NoseGearDragBraceRear', [
      (cx(aL) + cx(aR)) * 0.5,
      (cy(aL) + cy(aR)) * 0.5,
      (cz(aL) + cz(aR)) * 0.5,
    ]);
    // Pivotes individuales: cada Rear L/R rota en su propio anchor
    addPivot('pivot_NoseGearDragBraceRearL', [cx(aL), cy(aL), cz(aL)]);
    addPivot('pivot_NoseGearDragBraceRearR', [cx(aR), cy(aR), cz(aR)]);
    // Pivote del cross-bar superior (RearU): centro de su bbox, que cae sobre
    // el eje de bisagra que pasa por los anchors
    const u = bb('NoseGearDragBraceRearU');
    if (u) addPivot('pivot_NoseGearDragBraceRearU', [cx(u), (cy(aL) + cy(aR)) * 0.5, (cz(aL) + cz(aR)) * 0.5]);
  }
}
{
  // Nose bay doors: pivote en el borde exterior (lejos del centro), centro Y/Z
  const dL = bb('NoseGearBayDoor_L');
  if (dL) addPivot('pivot_NoseGearBayDoor_L', [dL.mx[0], cy(dL), cz(dL)]);
  const dR = bb('NoseGearBayDoor_R');
  if (dR) addPivot('pivot_NoseGearBayDoor_R', [dR.mn[0], cy(dR), cz(dR)]);
}
{
  // Main gear L: arriba del strut, lado interior
  const sL = bb('MainGearStrut_L');
  if (sL) addPivot('pivot_MainGearStrut_L', [sL.mn[0] + 0.05, sL.mx[1] - 0.05, (sL.mn[2] + sL.mx[2]) * 0.5]);
  const sR = bb('MainGearStrut_R');
  if (sR) addPivot('pivot_MainGearStrut_R', [sR.mx[0] - 0.05, sR.mx[1] - 0.05, (sR.mn[2] + sR.mx[2]) * 0.5]);
}
{
  // Main gear bay doors: pivote en el borde interior
  const dL = bb('MainGearBayDoor_L');
  if (dL) addPivot('pivot_MainGearBayDoor_L', [dL.mn[0], cy(dL), cz(dL)]);
  const dR = bb('MainGearBayDoor_R');
  if (dR) addPivot('pivot_MainGearBayDoor_R', [dR.mx[0], cy(dR), cz(dR)]);
}

// Crear los Empties e insertarlos como hijos directos de la escena (sin
// transform padre), usando world coords tal cual. Si los ponemos bajo
// primaryRoot (Sketchfab_model), su rotacion -90X se aplica dos veces.
for (const { name, pos } of PIVOTS) {
  const n = doc.createNode(name);
  n.setTranslation(pos);
  scene.addChild(n);
  console.log(`[add-pivots] + ${name.padEnd(36)} @ [${pos.map(v => v.toFixed(3)).join(', ')}]`);
}

await io.write(OUT_PATH, doc);
console.log(`\n[add-pivots] ${PIVOTS.length} pivotes agregados a ${OUT_PATH}`);
