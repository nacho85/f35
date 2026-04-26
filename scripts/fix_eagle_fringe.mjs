/**
 * Fix alpha fringe on iranian_iriaf_symbol.png
 * Dilates RGB of opaque pixels into transparent neighbours,
 * so the GPU bilinear filter blends red→transparent instead of white→transparent.
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.resolve(__dirname, "../public/iranian_iriaf_symbol.png");
const DILATE = 12;

const { data, info } = await sharp(IMG)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: W, height: H } = info;
const buf = new Float32Array(data.length);
for (let i = 0; i < data.length; i++) buf[i] = data[i] / 255;

const rgb = new Float32Array(buf);       // will hold dilated RGB
const opaque = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) opaque[i] = buf[i * 4 + 3] > 0.05 ? 1 : 0;

for (let pass = 0; pass < DILATE; pass++) {
  const newRgb    = rgb.slice();
  const newOpaque = opaque.slice();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (opaque[idx]) continue;                    // already opaque, skip
      for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const ny = y + dy, nx = x + dx;
        if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
        const nidx = ny * W + nx;
        if (!opaque[nidx]) continue;
        // copy RGB from opaque neighbour, keep alpha=0
        newRgb[idx*4+0] = rgb[nidx*4+0];
        newRgb[idx*4+1] = rgb[nidx*4+1];
        newRgb[idx*4+2] = rgb[nidx*4+2];
        newOpaque[idx]  = 1;
        break;
      }
    }
  }
  for (let i = 0; i < W * H; i++) {
    if (!opaque[i]) {
      rgb[i*4+0] = newRgb[i*4+0];
      rgb[i*4+1] = newRgb[i*4+1];
      rgb[i*4+2] = newRgb[i*4+2];
    }
    opaque[i] = newOpaque[i];
  }
}

// Keep original alpha, use dilated RGB
const out = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  out[i*4+0] = Math.round(rgb[i*4+0] * 255);
  out[i*4+1] = Math.round(rgb[i*4+1] * 255);
  out[i*4+2] = Math.round(rgb[i*4+2] * 255);
  out[i*4+3] = data[i*4+3];  // original alpha
}

await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile(IMG);

console.log(`✓ ${IMG}  (${W}x${H}, dilated ${DILATE}px)`);
