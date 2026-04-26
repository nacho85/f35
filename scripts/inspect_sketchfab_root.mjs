import { NodeIO } from '../node_modules/@gltf-transform/core/dist/index.modern.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const IN = resolve(__dirname, '..', 'public/F-14A-iran.glb');

const io = new NodeIO();
const doc = await io.read(IN);
const scene = doc.getRoot().listScenes()[0];

function dump(n, depth) {
  const name = n.getName() || '(unnamed)';
  console.log('  '.repeat(depth) + `${name}  T=${n.getTranslation()}  R=${n.getRotation()}  S=${n.getScale()}`);
  if (depth < 2) for (const c of n.listChildren()) dump(c, depth + 1);
}
for (const n of scene.listChildren()) dump(n, 0);
