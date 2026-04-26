// Read a Blender-labeled GLB (materials named "grp:XXX") and produce
// public/F-14A-iran.glb with semantic group nodes.

import { NodeIO } from '../node_modules/@gltf-transform/core/dist/index.modern.js';
import { ALL_EXTENSIONS } from '../node_modules/@gltf-transform/extensions/dist/index.modern.js';
import { writeFileSync, existsSync } from 'node:fs';
import { F14_GROUP_NAMES } from './f14-groups.mjs';

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IN_PATH  = resolve(ROOT, 'public/F-14A-iran-labeled.glb');
const OUT_PATH = resolve(ROOT, 'public/F-14A-iran.glb');
const MANIFEST_PATH = resolve(ROOT, 'scripts/f14-manifest.json');

if (!existsSync(IN_PATH)) {
  console.error(`[rig-labeled] Input not found: ${IN_PATH}`);
  process.exit(1);
}

class DSU {
  constructor(n) {
    this.p = new Int32Array(n);
    for (let i = 0; i < n; i++) this.p[i] = i;
    this.r = new Int8Array(n);
  }
  find(x) {
    while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; }
    return x;
  }
  union(a, b) {
    a = this.find(a); b = this.find(b);
    if (a === b) return;
    if (this.r[a] < this.r[b]) { const t = a; a = b; b = t; }
    this.p[b] = a;
    if (this.r[a] === this.r[b]) this.r[a]++;
  }
}

// Fallback espacial DESACTIVADO: el usuario ya pinto el modelo. Cualquier primitive
// sin `grp:XXX` va a 'Unlabeled'. Asi no contaminamos grupos semanticos con geometria
// suelta. Si queres que algo aparezca en un grupo, pintalo en Blender y re-exporta.
function spatialCategorize(_info) {
  return 'Unlabeled';
}

function shortHash(cx, cy, cz, n) {
  const h = ((cx*1000|0) ^ (cy*997|0) ^ (cz*883|0) ^ (n*769|0)) >>> 0;
  return h.toString(36).slice(0, 5);
}

const TYPO_MAP = {
  NoseGearStrur: 'NoseGearStrut',
};

function normalizeLabel(raw) {
  if (!raw) return raw;
  const stripped = raw.replace(/\.\d{3,}$/, '');
  return TYPO_MAP[stripped] || stripped;
}

function extractLabel(mat) {
  if (!mat) return null;
  const n = mat.getName() || '';
  if (n.startsWith('grp:')) {
    const raw = n.slice(4).trim();
    if (!raw) return null;
    return normalizeLabel(raw);
  }
  return null;
}

function primitiveStats(prim) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices();
  if (!pos) return [0,0,0,0,0,0,0,0];
  const arr = pos.getArray();
  const n = pos.getCount();
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for (let i = 0; i < n; i++) {
    const x = arr[i*3], y = arr[i*3+1], z = arr[i*3+2];
    if (x<minX) minX=x; if (x>maxX) maxX=x;
    if (y<minY) minY=y; if (y>maxY) maxY=y;
    if (z<minZ) minZ=z; if (z>maxZ) maxZ=z;
  }
  const cx = +((minX+maxX)/2).toFixed(3), cy = +((minY+maxY)/2).toFixed(3), cz = +((minZ+maxZ)/2).toFixed(3);
  const sx = +(maxX-minX).toFixed(3),     sy = +(maxY-minY).toFixed(3),     sz = +(maxZ-minZ).toFixed(3);
  const tris = idx ? (idx.getCount() / 3) | 0 : (n / 3) | 0;
  return [cx, cy, cz, sx, sy, sz, tris, n];
}

function clonePrimitive(doc, prim) {
  const newPrim = doc.createPrimitive().setMode(prim.getMode());
  const mat = prim.getMaterial();
  if (mat) newPrim.setMaterial(mat);
  for (const name of prim.listSemantics()) {
    const src = prim.getAttribute(name);
    if (!src) continue;
    const arr = src.getArray();
    const copy = new arr.constructor(arr);
    const acc = doc.createAccessor().setType(src.getType()).setArray(copy);
    newPrim.setAttribute(name, acc);
  }
  const idx = prim.getIndices();
  if (idx) {
    const arr = idx.getArray();
    const copy = new arr.constructor(arr);
    newPrim.setIndices(doc.createAccessor().setType('SCALAR').setArray(copy));
  }
  return newPrim;
}

function splitByConnectedComponents(doc, prim) {
  const posAcc = prim.getAttribute('POSITION');
  const normAcc = prim.getAttribute('NORMAL');
  const uvAcc = prim.getAttribute('TEXCOORD_0');
  const tanAcc = prim.getAttribute('TANGENT');
  const uv2Acc = prim.getAttribute('TEXCOORD_1');
  const colAcc = prim.getAttribute('COLOR_0');
  const idxAcc = prim.getIndices();
  const mat = prim.getMaterial();
  if (!posAcc || !idxAcc) return [];

  const posArr = posAcc.getArray();
  const normArr = normAcc ? normAcc.getArray() : null;
  const uvArr = uvAcc ? uvAcc.getArray() : null;
  const tanArr = tanAcc ? tanAcc.getArray() : null;
  const uv2Arr = uv2Acc ? uv2Acc.getArray() : null;
  const colArr = colAcc ? colAcc.getArray() : null;
  const idxArr = idxAcc.getArray();
  const vertCount = posAcc.getCount();
  const triCount = idxArr.length / 3;

  const eps = 1e-5;
  const vertMap = new Int32Array(vertCount);
  const posKey = new Map();
  let canonical = 0;
  for (let i = 0; i < vertCount; i++) {
    const k = `${Math.round(posArr[i*3]/eps)},${Math.round(posArr[i*3+1]/eps)},${Math.round(posArr[i*3+2]/eps)}`;
    let c = posKey.get(k);
    if (c === undefined) { c = canonical++; posKey.set(k, c); }
    vertMap[i] = c;
  }
  const dsu = new DSU(canonical);
  for (let i = 0; i < idxArr.length; i += 3) {
    dsu.union(vertMap[idxArr[i]], vertMap[idxArr[i+1]]);
    dsu.union(vertMap[idxArr[i+1]], vertMap[idxArr[i+2]]);
  }

  const compTris = new Map();
  for (let ti = 0; ti < triCount; ti++) {
    const rt = dsu.find(vertMap[idxArr[ti*3]]);
    let arr = compTris.get(rt);
    if (!arr) { arr = []; compTris.set(rt, arr); }
    arr.push(ti);
  }

  const out = [];
  let compIdx = 0;
  for (const [, triList] of compTris) {
    compIdx++;
    const cTris = triList.length;
    const remap = new Map();
    const newIdx = new Uint32Array(cTris * 3);
    let newVC = 0;
    for (let k = 0; k < cTris; k++) {
      const ti = triList[k];
      for (let j = 0; j < 3; j++) {
        const oldV = idxArr[ti*3 + j];
        let nv = remap.get(oldV);
        if (nv === undefined) { nv = newVC++; remap.set(oldV, nv); }
        newIdx[k*3 + j] = nv;
      }
    }
    const newPos  = new Float32Array(newVC * 3);
    const newNorm = normArr ? new Float32Array(newVC * 3) : null;
    const newUv   = uvArr   ? new Float32Array(newVC * 2) : null;
    const newTan  = tanArr  ? new Float32Array(newVC * 4) : null;
    const newUv2  = uv2Arr  ? new Float32Array(newVC * 2) : null;
    const newCol  = colArr  ? new Float32Array(newVC * (colAcc.getType() === 'VEC4' ? 4 : 3)) : null;
    const colComp = colArr  ? (colAcc.getType() === 'VEC4' ? 4 : 3) : 0;
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for (const [oldV, nv] of remap) {
      const x = posArr[oldV*3], y = posArr[oldV*3+1], z = posArr[oldV*3+2];
      newPos[nv*3]=x; newPos[nv*3+1]=y; newPos[nv*3+2]=z;
      if (newNorm) { newNorm[nv*3]=normArr[oldV*3]; newNorm[nv*3+1]=normArr[oldV*3+1]; newNorm[nv*3+2]=normArr[oldV*3+2]; }
      if (newUv)   { newUv[nv*2]=uvArr[oldV*2];     newUv[nv*2+1]=uvArr[oldV*2+1]; }
      if (newTan)  { newTan[nv*4]=tanArr[oldV*4];   newTan[nv*4+1]=tanArr[oldV*4+1]; newTan[nv*4+2]=tanArr[oldV*4+2]; newTan[nv*4+3]=tanArr[oldV*4+3]; }
      if (newUv2)  { newUv2[nv*2]=uv2Arr[oldV*2];   newUv2[nv*2+1]=uv2Arr[oldV*2+1]; }
      if (newCol)  { for (let c = 0; c < colComp; c++) newCol[nv*colComp+c] = colArr[oldV*colComp+c]; }
      if (x<minX)minX=x; if (x>maxX)maxX=x;
      if (y<minY)minY=y; if (y>maxY)maxY=y;
      if (z<minZ)minZ=z; if (z>maxZ)maxZ=z;
    }
    const idxFinal = newVC < 65536 ? new Uint16Array(newIdx) : newIdx;
    const p = doc.createPrimitive().setMode(prim.getMode())
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(newPos))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(idxFinal));
    if (newNorm) p.setAttribute('NORMAL',     doc.createAccessor().setType('VEC3').setArray(newNorm));
    if (newUv)   p.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(newUv));
    if (newTan)  p.setAttribute('TANGENT',    doc.createAccessor().setType('VEC4').setArray(newTan));
    if (newUv2)  p.setAttribute('TEXCOORD_1', doc.createAccessor().setType('VEC2').setArray(newUv2));
    if (newCol)  p.setAttribute('COLOR_0',    doc.createAccessor().setType(colAcc.getType()).setArray(newCol));
    if (mat)     p.setMaterial(mat);
    out.push({
      prim: p, compIdx,
      cx: +((minX+maxX)/2).toFixed(3), cy: +((minY+maxY)/2).toFixed(3), cz: +((minZ+maxZ)/2).toFixed(3),
      sx: +(maxX-minX).toFixed(3),     sy: +(maxY-minY).toFixed(3),     sz: +(maxZ-minZ).toFixed(3),
      tris: cTris, verts: newVC,
    });
  }
  return out;
}

console.log(`[rig-labeled] Loading ${IN_PATH}...`);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(IN_PATH);
const root = doc.getRoot();
const scene = root.listScenes()[0];

const sceneRoots = scene.listChildren();
const primaryRoot = sceneRoots.find(n => (n.getName() || '') === 'Sketchfab_model') ?? sceneRoots[0];
const duplicateRoots = sceneRoots.filter(n => n !== primaryRoot);
console.log(`[rig-labeled] Primary: "${primaryRoot.getName()}", removing ${duplicateRoots.length} duplicate root(s)`);
for (const dup of duplicateRoots) {
  scene.removeChild(dup);
  (function detach(n) { for (const c of n.listChildren()) detach(c); n.dispose(); })(dup);
}

const groups = new Map();
function getGroup(tag) {
  let g = groups.get(tag);
  if (!g) {
    g = doc.createNode(`group_${tag}`);
    primaryRoot.addChild(g);
    groups.set(tag, g);
  }
  return g;
}

const meshNodes = [];
(function walk(n) { if (n.getMesh()) meshNodes.push(n); for (const c of n.listChildren()) walk(c); })(primaryRoot);
console.log(`[rig-labeled] ${meshNodes.length} mesh-bearing nodes`);

const manifest = {
  groups: {}, parts: [],
  coverage: { labeled: 0, unlabeled: 0, totalPrimitives: 0 },
  unknownLabels: [],
};
const known = new Set(F14_GROUP_NAMES);
let totalParts = 0;
const processedNodes = [];
const t0 = Date.now();

for (const node of meshNodes) {
  const mesh = node.getMesh();
  const prims = mesh.listPrimitives();
  if (prims.length === 0) continue;
  const nodeName = node.getName() || 'unnamed';

  for (const prim of prims) {
    manifest.coverage.totalPrimitives++;
    const mat   = prim.getMaterial();
    const rawLabel = extractLabel(mat);
    const label = rawLabel === 'Unlabeled' ? null : rawLabel;

    if (label) {
      if (!known.has(label) && !manifest.unknownLabels.includes(label)) {
        manifest.unknownLabels.push(label);
      }
      manifest.coverage.labeled++;

      const clonePrim = clonePrimitive(doc, prim);
      const newMesh = doc.createMesh(`${label}__${nodeName}`).addPrimitive(clonePrim);
      const newNode = doc.createNode(`${label}__${nodeName}`).setMesh(newMesh);
      getGroup(label).addChild(newNode);

      const [cx, cy, cz, sx, sy, sz, tris, verts] = primitiveStats(prim);
      manifest.parts.push({
        name: `${label}__${nodeName}`, group: label,
        labeled: true,
        center: [cx, cy, cz], size: [sx, sy, sz],
        tris, verts, parentOrigNode: nodeName,
      });
      manifest.groups[label] = (manifest.groups[label] || 0) + 1;
      totalParts++;
    } else {
      manifest.coverage.unlabeled++;
      const split = splitByConnectedComponents(doc, prim);
      for (const sub of split) {
        const tag = spatialCategorize(sub);
        const hash = shortHash(sub.cx, sub.cy, sub.cz, sub.tris);
        const partName = `${tag}__${nodeName}_${sub.compIdx}_${hash}`;
        const newMesh = doc.createMesh(partName).addPrimitive(sub.prim);
        const newNode = doc.createNode(partName).setMesh(newMesh);
        getGroup(tag).addChild(newNode);
        manifest.parts.push({
          name: partName, group: tag,
          labeled: false,
          center: [sub.cx, sub.cy, sub.cz], size: [sub.sx, sub.sy, sub.sz],
          tris: sub.tris, verts: sub.verts, parentOrigNode: nodeName,
        });
        manifest.groups[tag] = (manifest.groups[tag] || 0) + 1;
        totalParts++;
      }
    }
  }
  processedNodes.push(node);
}

for (const n of processedNodes) {
  const parent = n.getParentNode();
  if (parent) parent.removeChild(n);
  n.dispose();
}

console.log(`[rig-labeled] Created ${totalParts} parts in ${Date.now() - t0}ms across ${groups.size} groups`);
console.log(`[rig-labeled] Coverage: ${manifest.coverage.labeled} labeled / ${manifest.coverage.unlabeled} unlabeled primitives`);
if (manifest.unknownLabels.length > 0) {
  console.warn(`[rig-labeled] WARN: found labels not in the canonical list: ${manifest.unknownLabels.join(', ')}`);
}

function pruneMeshesAndPrims(label) {
  let m = 0, p = 0;
  for (const mesh of [...root.listMeshes()]) {
    const parents = mesh.listParents().filter(pp => pp.propertyType !== 'Root');
    if (parents.length === 0) {
      for (const pr of mesh.listPrimitives()) { pr.dispose(); p++; }
      mesh.dispose(); m++;
    }
  }
  console.log(`  ${label.padEnd(28)} meshes=${m}, prims=${p}`);
  return m + p;
}
function pruneList(items, label) {
  let removed = 0;
  for (const item of [...items]) {
    const parents = item.listParents().filter(pp => pp.propertyType !== 'Root');
    if (parents.length === 0) { item.dispose(); removed++; }
  }
  console.log(`  ${label.padEnd(28)} removed ${removed}`);
  return removed;
}
console.log('[rig-labeled] Pruning orphans...');
for (let pass = 1; pass <= 5; pass++) {
  const r = pruneMeshesAndPrims(`pass ${pass} meshes+prims`)
          + pruneList(root.listAccessors(), `pass ${pass} accessors`)
          + pruneList(root.listMaterials(), `pass ${pass} materials`)
          + pruneList(root.listTextures(),  `pass ${pass} textures`);
  if (r === 0) break;
}

console.log('[rig-labeled] Writing GLB...');
await io.write(OUT_PATH, doc);
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

console.log('\n=== Groups ===');
const sorted = Object.entries(manifest.groups).sort((a,b) => b[1] - a[1]);
for (const [k, v] of sorted) console.log(`  ${k.padEnd(24)} ${v}`);
console.log(`\nOutput: ${OUT_PATH}`);
console.log(`Manifest: ${MANIFEST_PATH}`);
