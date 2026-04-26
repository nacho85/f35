// Compara triangulos totales entre el GLB original y el labeled. Si el labeled
// tiene mas, hay geometria duplicada.
import { NodeIO } from '../node_modules/@gltf-transform/core/dist/index.modern.js';
import { ALL_EXTENSIONS } from '../node_modules/@gltf-transform/extensions/dist/index.modern.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function count(path) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path);
  let tris = 0, prims = 0, verts = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      prims++;
      const idx = p.getIndices();
      const pos = p.getAttribute('POSITION');
      if (idx) tris += idx.getCount() / 3;
      else if (pos) tris += pos.getCount() / 3;
      if (pos) verts += pos.getCount();
    }
  }
  return { prims, tris, verts };
}

const src = await count(resolve(ROOT, 'public/F-14-iran.glb'));
const lab = await count(resolve(ROOT, 'public/F-14A-iran-labeled.glb'));
const v6  = await count(resolve(ROOT, 'public/F-14A-iran.glb'));
console.log(`source  (F-14-iran.glb)          : prims=${src.prims}  tris=${src.tris}  verts=${src.verts}`);
console.log(`labeled (F-14A-iran-labeled.glb) : prims=${lab.prims}  tris=${lab.tris}  verts=${lab.verts}`);
console.log(`v6      (F-14A-iran.glb)         : prims=${v6.prims}  tris=${v6.tris}  verts=${v6.verts}`);
console.log(`\ndelta labeled vs source: tris ${lab.tris - src.tris >= 0 ? '+' : ''}${lab.tris - src.tris}`);
console.log(`delta v6 vs labeled    : tris ${v6.tris - lab.tris >= 0 ? '+' : ''}${v6.tris - lab.tris}`);
