import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';

const io = new NodeIO();
const doc = await io.read('/sessions/brave-epic-mccarthy/mnt/f35/public/F-14A-iran.glb');
const root = doc.getRoot();

// Build local matrix helper
function localMatrix(node) {
  const m = new THREE.Matrix4();
  const t = node.getTranslation();
  const r = node.getRotation();
  const s = node.getScale();
  m.compose(new THREE.Vector3(t[0],t[1],t[2]),
            new THREE.Quaternion(r[0],r[1],r[2],r[3]),
            new THREE.Vector3(s[0],s[1],s[2]));
  return m;
}

// Walk scenes -> compute world matrices for each node
const scene = root.listScenes()[0];
const worldByNode = new Map();
function walk(node, parentWorld) {
  const local = localMatrix(node);
  const world = new THREE.Matrix4().multiplyMatrices(parentWorld, local);
  worldByNode.set(node, world);
  for (const child of node.listChildren()) walk(child, world);
}
for (const n of scene.listChildren()) walk(n, new THREE.Matrix4().identity());

// Compute bbox including descendants
function bboxFor(node) {
  const box = new THREE.Box3();
  box.makeEmpty();
  function addMesh(n) {
    const mesh = n.getMesh();
    const world = worldByNode.get(n);
    if (mesh && world) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const arr = pos.getArray();
        const count = pos.getCount();
        const v = new THREE.Vector3();
        for (let i=0;i<count;i++){
          v.set(arr[i*3], arr[i*3+1], arr[i*3+2]).applyMatrix4(world);
          box.expandByPoint(v);
        }
      }
    }
    for (const c of n.listChildren()) addMesh(c);
  }
  addMesh(node);
  return box;
}

const targets = [
  'group_NoseGearStrut','group_NoseGearWheel',
  'group_NoseGearDragBraceFrontL','group_NoseGearDragBraceFrontR','group_NoseGearDragBraceFrontU',
  'group_NoseGearDragBraceRearL','group_NoseGearDragBraceRearR','group_NoseGearDragBraceRearU',
  'group_NoseGearDragBraceRearAnchorL','group_NoseGearDragBraceRearAnchorR'
];

const byName = new Map(root.listNodes().map(n=>[n.getName(),n]));
const f = n => n.toFixed(4);
for (const name of targets) {
  const node = byName.get(name);
  if (!node) { console.log(name,'NOT FOUND'); continue; }
  const box = bboxFor(node);
  if (box.isEmpty()) { console.log(name,'EMPTY'); continue; }
  const c = new THREE.Vector3(); box.getCenter(c);
  const s = new THREE.Vector3(); box.getSize(s);
  console.log(name);
  console.log('  min   ', f(box.min.x), f(box.min.y), f(box.min.z));
  console.log('  max   ', f(box.max.x), f(box.max.y), f(box.max.z));
  console.log('  center', f(c.x), f(c.y), f(c.z));
  console.log('  size  ', f(s.x), f(s.y), f(s.z));
}
