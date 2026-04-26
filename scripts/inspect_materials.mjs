import { NodeIO } from '../node_modules/@gltf-transform/core/dist/index.modern.js';
import { ALL_EXTENSIONS } from '../node_modules/@gltf-transform/extensions/dist/index.modern.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function inspect(path) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path);
  const root = doc.getRoot();
  const mats = root.listMaterials();
  const texs = root.listTextures();
  console.log(`\n=== ${path} ===`);
  console.log(`Materials: ${mats.length}, Textures: ${texs.length}`);
  for (const m of mats) {
    const bc = m.getBaseColorTexture();
    console.log(`  ${m.getName() || '(unnamed)'}: baseColor=${bc ? (bc.getName() || bc.getURI() || '(tex)') : 'NONE'}  color=${JSON.stringify(m.getBaseColorFactor())}`);
  }
}

await inspect(resolve(ROOT, 'public/F-14-iran.glb'));
await inspect(resolve(ROOT, 'public/F-14A-iran.glb'));
