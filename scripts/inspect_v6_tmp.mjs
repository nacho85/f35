import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

const io = new NodeIO();
const doc = await io.read('/sessions/brave-epic-mccarthy/mnt/f35/public/F-14A-iran.glb');
const root = doc.getRoot();
const groupNodes = root.listNodes().filter(n => n.getName().startsWith('group_')).map(n=>n.getName()).sort();
console.log('=== group_* nodes (sorted) ===');
for (const n of groupNodes) console.log(n);

const required = [
  'group_NoseGearDragBraceFrontL','group_NoseGearDragBraceFrontR','group_NoseGearDragBraceFrontU',
  'group_NoseGearDragBraceRearL','group_NoseGearDragBraceRearR','group_NoseGearDragBraceRearU',
  'group_NoseGearDragBraceRearAnchorL','group_NoseGearDragBraceRearAnchorR'
];
console.log('\n=== Required presence ===');
for (const r of required) console.log(r, groupNodes.includes(r) ? 'PRESENT' : 'MISSING');
