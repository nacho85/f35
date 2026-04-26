import { NodeIO } from '../node_modules/@gltf-transform/core/dist/index.modern.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const IN = resolve(__dirname, '..', 'public/F-14A-iran.glb');

const TARGETS = [
  'NoseGearStrut',
  'NoseGearStrutRear',
  'NoseGearWheel',
  'NoseGearDragBraceRearAnchorL',
  'NoseGearDragBraceRearAnchorR',
];

const io = new NodeIO();
const doc = await io.read(IN);
const root = doc.getRoot();
const scene = root.listScenes()[0];

// walk scene nodes and compute world bboxes per group_XXX
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

const groupBox = new Map();

function walk(node, parentM) {
  const t = node.getTranslation();
  const r = node.getRotation();
  const s = node.getScale();
  const localM = trsToMat(t, r, s);
  const worldM = mat4Mul(parentM, localM);

  const name = node.getName() || '';
  // find which target group this node descends from
  const mesh = node.getMesh();
  if (mesh) {
    // find ancestor group by name
    let label = null;
    for (const tg of TARGETS) if (name.startsWith(tg + '__')) { label = tg; break; }
    if (label) {
      const prim = mesh.listPrimitives()[0];
      const pos = prim.getAttribute('POSITION');
      if (pos) {
        const arr = pos.getArray();
        const n = pos.getCount();
        let bx = groupBox.get(label);
        if (!bx) { bx = { mn: [Infinity,Infinity,Infinity], mx: [-Infinity,-Infinity,-Infinity] }; groupBox.set(label, bx); }
        for (let i = 0; i < n; i++) {
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

function fmt(v) { return v.map(x => x.toFixed(3).padStart(8)).join(' '); }
for (const tg of TARGETS) {
  const bx = groupBox.get(tg);
  if (!bx) { console.log(`${tg.padEnd(32)} NOT FOUND`); continue; }
  const c = [(bx.mn[0]+bx.mx[0])/2, (bx.mn[1]+bx.mx[1])/2, (bx.mn[2]+bx.mx[2])/2];
  const sz = [bx.mx[0]-bx.mn[0], bx.mx[1]-bx.mn[1], bx.mx[2]-bx.mn[2]];
  console.log(`${tg.padEnd(32)} center=${fmt(c)}  size=${fmt(sz)}  min=${fmt(bx.mn)}  max=${fmt(bx.mx)}`);
}
