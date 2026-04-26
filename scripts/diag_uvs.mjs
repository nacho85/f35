// Inspecciona UVs y texturas: rangos, wrapping, normal maps.
import { NodeIO } from '../node_modules/@gltf-transform/core/dist/index.modern.js';
import { ALL_EXTENSIONS } from '../node_modules/@gltf-transform/extensions/dist/index.modern.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function inspect(path) {
  console.log(`\n=== ${path} ===`);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path);
  const root = doc.getRoot();

  // Texturas: wrap + mag/min filter + mimeType + size
  for (const t of root.listTextures()) {
    const img = t.getImage();
    console.log(`  tex ${(t.getName()||'unnamed').padEnd(14)}  mime=${t.getMimeType()}  bytes=${img?img.byteLength:'?'}`);
  }

  // Materiales: normal/occlusion maps
  console.log(`  materials with normalMap:`);
  for (const m of root.listMaterials()) {
    const nm = m.getNormalTexture();
    if (nm) console.log(`    ${m.getName()}  normalMap=${nm.getName()}`);
  }

  // UV ranges per primitive
  const uvStats = { total: 0, outsideUnit: 0, minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity };
  for (const mesh of root.listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      const uv = p.getAttribute('TEXCOORD_0');
      if (!uv) continue;
      const arr = uv.getArray();
      for (let i = 0; i < uv.getCount(); i++) {
        const u = arr[i*2], v = arr[i*2+1];
        uvStats.total++;
        if (u < 0 || u > 1 || v < 0 || v > 1) uvStats.outsideUnit++;
        if (u < uvStats.minU) uvStats.minU = u;
        if (u > uvStats.maxU) uvStats.maxU = u;
        if (v < uvStats.minV) uvStats.minV = v;
        if (v > uvStats.maxV) uvStats.maxV = v;
      }
    }
  }
  console.log(`  UV stats: total=${uvStats.total}  outsideUnit=${uvStats.outsideUnit} (${(uvStats.outsideUnit/uvStats.total*100).toFixed(1)}%)`);
  console.log(`    U range: [${uvStats.minU.toFixed(3)}, ${uvStats.maxU.toFixed(3)}]`);
  console.log(`    V range: [${uvStats.minV.toFixed(3)}, ${uvStats.maxV.toFixed(3)}]`);
}

await inspect(resolve(ROOT, 'public/F-14-iran.glb'));
await inspect(resolve(ROOT, 'public/F-14A-iran-labeled.glb'));
