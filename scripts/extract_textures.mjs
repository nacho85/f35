// Extrae todas las textures del F-14-iran.glb como PNG para inspeccion visual.
import { NodeIO } from '../node_modules/@gltf-transform/core/dist/index.modern.js';
import { ALL_EXTENSIONS } from '../node_modules/@gltf-transform/extensions/dist/index.modern.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IN = resolve(ROOT, 'public/F-14-iran.glb');
const OUT_DIR = resolve(ROOT, 'scripts/tex_dump');
mkdirSync(OUT_DIR, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(IN);
const texs = doc.getRoot().listTextures();

for (const t of texs) {
  const name = (t.getName() || 'unnamed').replace(/[^\w.-]/g, '_');
  const img = t.getImage();
  const mime = t.getMimeType() || 'image/png';
  const ext = mime.includes('jpeg') ? 'jpg' : 'png';
  const outPath = resolve(OUT_DIR, `${name}.${ext}`);
  writeFileSync(outPath, Buffer.from(img));
  console.log(`${name.padEnd(20)} ${(img.byteLength/1024).toFixed(1)} KB -> ${outPath}`);
}
