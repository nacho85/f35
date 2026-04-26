import { NodeIO } from '../node_modules/@gltf-transform/core/dist/index.modern.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const IN = resolve(__dirname, '..', 'public/F-14A-iran.glb');

const TARGETS = [
  'NoseGearDragBraceRearL', 'NoseGearDragBraceRearR', 'NoseGearDragBraceRearU',
  'NoseGearDragBraceRearAnchorL', 'NoseGearDragBraceRearAnchorR',
  'NoseGearDragBraceFrontL', 'NoseGearDragBraceFrontR', 'NoseGearDragBraceFrontU',
];

function mat4Identity() { return new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function mat4Mul(a, b) { const o = new Float64Array(16); for (let r=0;r<4;r++) for (let c=0;c<4;c++) { let s=0; for (let k=0;k<4;k++) s+=a[r*4+k]*b[k*4+c]; o[r*4+c]=s; } return o; }
function trsToMat(t, r, s) { const [x,y,z,w]=r; const [sx,sy,sz]=s; const xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z; return new Float64Array([(1-2*(yy+zz))*sx,2*(xy+wz)*sx,2*(xz-wy)*sx,0,2*(xy-wz)*sy,(1-2*(xx+zz))*sy,2*(yz+wx)*sy,0,2*(xz+wy)*sz,2*(yz-wx)*sz,(1-2*(xx+yy))*sz,0,t[0],t[1],t[2],1]); }
function applyMat(m,x,y,z){return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}

const io = new NodeIO();
const doc = await io.read(IN);
const scene = doc.getRoot().listScenes()[0];
const box = new Map();

function walk(node, parentM) {
  const world = mat4Mul(parentM, trsToMat(node.getTranslation(), node.getRotation(), node.getScale()));
  const name = node.getName() || '';
  const mesh = node.getMesh();
  if (mesh) {
    let a = node, group = null;
    while (a) { const n = a.getName() || ''; if (n.startsWith('group_')) { group = n.slice(6); break; } a = a.getParentNode(); }
    if (group && TARGETS.includes(group)) {
      const prim = mesh.listPrimitives()[0];
      const pos = prim && prim.getAttribute('POSITION');
      if (pos) {
        const arr = pos.getArray();
        let b = box.get(group);
        if (!b) { b = { mn:[Infinity,Infinity,Infinity], mx:[-Infinity,-Infinity,-Infinity] }; box.set(group, b); }
        for (let i=0;i<pos.getCount();i++) {
          const [x,y,z] = applyMat(world, arr[i*3], arr[i*3+1], arr[i*3+2]);
          if (x<b.mn[0]) b.mn[0]=x; if (x>b.mx[0]) b.mx[0]=x;
          if (y<b.mn[1]) b.mn[1]=y; if (y>b.mx[1]) b.mx[1]=y;
          if (z<b.mn[2]) b.mn[2]=z; if (z>b.mx[2]) b.mx[2]=z;
        }
      }
    }
  }
  for (const c of node.listChildren()) walk(c, world);
}
for (const n of scene.listChildren()) walk(n, mat4Identity());

function fmt(v){return v.map(x=>x.toFixed(3).padStart(8)).join(' ');}
for (const t of TARGETS) {
  const b = box.get(t); if (!b) { console.log(`${t.padEnd(34)} MISSING`); continue; }
  const c = [(b.mn[0]+b.mx[0])/2, (b.mn[1]+b.mx[1])/2, (b.mn[2]+b.mx[2])/2];
  const s = [b.mx[0]-b.mn[0], b.mx[1]-b.mn[1], b.mx[2]-b.mn[2]];
  console.log(`${t.padEnd(34)} c=${fmt(c)}  sz=${fmt(s)}  min=${fmt(b.mn)}  max=${fmt(b.mx)}`);
}
