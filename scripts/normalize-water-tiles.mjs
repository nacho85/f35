// Normaliza el tono del agua en los tiles z14 satelitales pre-rendering.
// Procesa offline /public/tiles/satellite/14/*/*.jpg para que todos los tiles
// converjan a una distribución uniforme del agua, mientras dejan la tierra
// intacta.
//
// Algoritmo (Lab color matching):
//   1. PASS 1 (stats): para cada tile, detectar pixeles de agua (heurística
//      relativa azul-dominante en RGB), convertir a Lab, acumular mean+std
//      global.
//   2. PASS 2 (apply): para cada tile, en pixeles de agua aplicar:
//        L_out = (L_in - tile_L_mean) * (global_L_std / tile_L_std) + global_L_mean
//        análogo para a, b.
//      Esto matchea media Y desvío estándar — corrige brillo, contraste,
//      saturación, y dominante de hue. Tiles convergen sin perder variación
//      interna (oleaje, profundidad, bajos).
//   3. Convertir Lab → RGB, escribir JPG sobre el mismo path.
//
// Backup: la primera vez se crea /public/tiles/satellite/14_original/ con
// los originales. Re-ejecuciones leen DESDE ese backup, nunca del z14
// procesado, así que los parámetros se pueden tunear y re-correr sin perder
// fidelidad.
//
// Uso:
//   node scripts/normalize-water-tiles.mjs           — corre la normalización
//   node scripts/normalize-water-tiles.mjs --reset   — copia backup → z14, sin procesar

import sharp from "sharp";
import { readdirSync, existsSync, mkdirSync, cpSync, statSync } from "fs";
import { join, dirname } from "path";

const Z14_DIR = "public/tiles/satellite/14";
const BACKUP_DIR = "public/tiles/satellite/14_original";
const RESET = process.argv.includes("--reset");

// ─── Backup ──────────────────────────────────────────────────────────────────
if (!existsSync(BACKUP_DIR)) {
  console.log(`Creando backup → ${BACKUP_DIR}`);
  cpSync(Z14_DIR, BACKUP_DIR, { recursive: true });
  const sz = (statSync(BACKUP_DIR).size); // ignore, just touch
  console.log("  ✓ backup creado");
} else {
  console.log(`Backup ya existe en ${BACKUP_DIR} — fuente de verdad`);
}

if (RESET) {
  console.log(`--reset: copiando ${BACKUP_DIR} → ${Z14_DIR}`);
  cpSync(BACKUP_DIR, Z14_DIR, { recursive: true, force: true });
  console.log("  ✓ z14 restaurado desde backup. No se procesó nada.");
  process.exit(0);
}

// ─── Listar todos los tiles desde el backup ─────────────────────────────────
function* iterTiles(rootBackup, rootDest) {
  for (const xDir of readdirSync(rootBackup)) {
    const xPathBackup = join(rootBackup, xDir);
    const xPathDest = join(rootDest, xDir);
    if (!statSync(xPathBackup).isDirectory()) continue;
    for (const yFile of readdirSync(xPathBackup)) {
      if (!yFile.endsWith(".jpg")) continue;
      const x = parseInt(xDir, 10);
      const y = parseInt(yFile.replace(".jpg", ""), 10);
      yield {
        backup: join(xPathBackup, yFile),
        dest: join(xPathDest, yFile),
        x, y,
      };
    }
  }
}

const tiles = [...iterTiles(BACKUP_DIR, Z14_DIR)];
console.log(`Procesando ${tiles.length} tiles z14`);
console.log("");

// ─── Color space helpers ────────────────────────────────────────────────────
// sRGB byte → linear → XYZ → Lab (D65). Escala Lab estándar: L∈[0,100], a/b∈[-128,127].
function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c * 255 : (1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
}
function rgbToLab(r, g, b) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  let X = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  let Y = (lr * 0.2126 + lg * 0.7152 + lb * 0.0722) / 1.00000;
  let Z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [
    116 * fy - 16,
    500 * (fx - fy),
    200 * (fy - fz),
  ];
}
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const finv = (t) => {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };
  const X = finv(fx) * 0.95047;
  const Y = finv(fy) * 1.00000;
  const Z = finv(fz) * 1.08883;
  const lr = X *  3.2406 + Y * -1.5372 + Z * -0.4986;
  const lg = X * -0.9689 + Y *  1.8758 + Z *  0.0415;
  const lb = X *  0.0557 + Y * -0.2040 + Z *  1.0570;
  return [
    Math.max(0, Math.min(255, linearToSrgb(lr))),
    Math.max(0, Math.min(255, linearToSrgb(lg))),
    Math.max(0, Math.min(255, linearToSrgb(lb))),
  ];
}

// Heurística agua: blue-dominant relativo, no thresholds absolutos.
function isWaterPixel(r, g, b) {
  return b > r * 1.3 && b > g * 0.85 && b > 30;
}
// Soft mask [0,1] para suavizar transiciones costeras.
function waterMask(r, g, b) {
  const m1 = Math.max(0, Math.min(1, (b - r * 1.2) / 25));
  const m2 = Math.max(0, Math.min(1, (b - g * 0.75) / 25));
  const m3 = Math.max(0, Math.min(1, (b - 25) / 20));
  return m1 * m2 * m3;
}

// ─── PASS 1: estadísticas globales del agua ─────────────────────────────────
console.log("PASS 1: stats globales (Lab) sobre pixeles de agua...");
const t0 = Date.now();
let gN = 0;
let gLs = 0, gAs = 0, gBs = 0;       // sum
let gLs2 = 0, gAs2 = 0, gBs2 = 0;    // sum of squares
const tileStats = []; // { Lmean, Lstd, amean, astd, bmean, bstd, n }

for (let i = 0; i < tiles.length; i++) {
  const { backup } = tiles[i];
  const { data, info } = await sharp(backup)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  let n = 0;
  let lS = 0, aS = 0, bS = 0;
  let lS2 = 0, aS2 = 0, bS2 = 0;
  for (let p = 0; p < px; p++) {
    const o = p * info.channels;
    const r = data[o], g = data[o + 1], bl = data[o + 2];
    if (!isWaterPixel(r, g, bl)) continue;
    const [L, A, B] = rgbToLab(r, g, bl);
    lS += L; aS += A; bS += B;
    lS2 += L * L; aS2 += A * A; bS2 += B * B;
    n++;
  }
  const Lm = n > 0 ? lS / n : 0;
  const Am = n > 0 ? aS / n : 0;
  const Bm = n > 0 ? bS / n : 0;
  const Lv = n > 0 ? Math.max(0, lS2 / n - Lm * Lm) : 0;
  const Av = n > 0 ? Math.max(0, aS2 / n - Am * Am) : 0;
  const Bv = n > 0 ? Math.max(0, bS2 / n - Bm * Bm) : 0;
  tileStats.push({
    Lmean: Lm, Lstd: Math.sqrt(Lv),
    amean: Am, astd: Math.sqrt(Av),
    bmean: Bm, bstd: Math.sqrt(Bv),
    n,
  });
  gLs += lS; gAs += aS; gBs += bS;
  gLs2 += lS2; gAs2 += aS2; gBs2 += bS2;
  gN += n;

  if ((i + 1) % 200 === 0 || i === tiles.length - 1) {
    process.stdout.write(`\r  ${i + 1}/${tiles.length} tiles · ${gN} px de agua acumulados`);
  }
}
console.log("");
const gLm = gLs / gN, gAm = gAs / gN, gBm = gBs / gN;
const gLstd = Math.sqrt(gLs2 / gN - gLm * gLm);
const gAstd = Math.sqrt(gAs2 / gN - gAm * gAm);
const gBstd = Math.sqrt(gBs2 / gN - gBm * gBm);
console.log(`  global Lab water: L=${gLm.toFixed(2)}±${gLstd.toFixed(2)}  a=${gAm.toFixed(2)}±${gAstd.toFixed(2)}  b=${gBm.toFixed(2)}±${gBstd.toFixed(2)}`);
console.log(`  total ${gN.toLocaleString()} pixeles de agua sobre ${tiles.length} tiles`);

// ─── PASS 1.5: dilation + smoothing espacial de stats por tile ─────────────
// Cada tile tiene stats propias, pero las usamos directamente da cortes
// porque tiles vecinos tienen σ distintos y mostly-land tiles tienen stats
// no confiables. Solución: armar una grilla 2D (x, y) de tiles, dilatar
// stats hacia tiles inválidos (poca agua), y aplicar Gaussian blur sobre
// los 6 fields (L/a/b mean+std). Cada tile termina usando un PROMEDIO
// SUAVE de su vecindario → tiles adyacentes convergen, cortes desaparecen.
console.log("");
console.log("PASS 1.5: smoothing espacial de stats por tile...");

const minX = Math.min(...tiles.map(t => t.x));
const maxX = Math.max(...tiles.map(t => t.x));
const minY = Math.min(...tiles.map(t => t.y));
const maxY = Math.max(...tiles.map(t => t.y));
const W = maxX - minX + 1;
const H = maxY - minY + 1;
const idxOf = (x, y) => (y - minY) * W + (x - minX);

const FIELDS = ["Lmean", "Lstd", "amean", "astd", "bmean", "bstd"];
const grids = {};
for (const f of FIELDS) grids[f] = new Float32Array(W * H);
const valid = new Uint8Array(W * H);
const MIN_VALID_N = 500; // mínimo px de agua para que stats sean confiables

for (let i = 0; i < tiles.length; i++) {
  const t = tiles[i];
  const idx = idxOf(t.x, t.y);
  const s = tileStats[i];
  if (s.n >= MIN_VALID_N) {
    for (const f of FIELDS) grids[f][idx] = s[f];
    valid[idx] = 1;
  }
}

// Dilation: para cada celda inválida, llenar con promedio de vecinos válidos.
// Repetir hasta cubrir todo el grid (o tope de N pasadas).
for (let pass = 0; pass < Math.max(W, H); pass++) {
  const newlyFilled = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (valid[idx]) continue;
      const acc = {}; for (const f of FIELDS) acc[f] = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const nIdx = ny * W + nx;
          if (valid[nIdx] === 1) {
            for (const f of FIELDS) acc[f] += grids[f][nIdx];
            n++;
          }
        }
      }
      if (n > 0) {
        for (const f of FIELDS) grids[f][idx] = acc[f] / n;
        newlyFilled.push(idx);
      }
    }
  }
  if (newlyFilled.length === 0) break;
  for (const idx of newlyFilled) valid[idx] = 1;
}

// Box-blur: 12 pasadas con kernel 3×3 → vecindario efectivo ~25×25 tiles.
// Esto hace que adyacentes converjan suavemente.
const SMOOTH_PASSES = 12;
for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
  for (const f of FIELDS) {
    const src = grids[f];
    const dst = new Float32Array(src.length);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            s += src[ny * W + nx]; n++;
          }
        }
        dst[y * W + x] = s / n;
      }
    }
    grids[f] = dst;
  }
}
console.log(`  ✓ stats grid ${W}×${H} dilated + smoothed (${SMOOTH_PASSES} passes)`);

// ─── PASS 2: aplicar matching usando stats SMOOTHED y guardar ──────────────
console.log("");
console.log("PASS 2: aplicar matching Lab con stats smoothed y escribir JPGs...");
const MIN_STD = 0.5;            // evitar amplificar ruido en tiles flat-color

let processed = 0, untouched = 0;
for (let i = 0; i < tiles.length; i++) {
  const { backup, dest, x, y } = tiles[i];
  const idx = idxOf(x, y);

  const destDir = dirname(dest);
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

  // Stats que vamos a usar para este tile = stats SMOOTHED del grid.
  const sLmean = grids.Lmean[idx];
  const sLstd  = grids.Lstd[idx];
  const samean = grids.amean[idx];
  const sastd  = grids.astd[idx];
  const sbmean = grids.bmean[idx];
  const sbstd  = grids.bstd[idx];

  // Si el tile y todos sus vecinos quedaron sin stats válidas (extremo del
  // grid sin agua), copiar backup tal cual.
  if (sLstd === 0 && samean === 0) {
    await sharp(backup).jpeg({ quality: 90 }).toFile(dest);
    untouched++;
  } else {
    const { data, info } = await sharp(backup)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = info.width * info.height;
    const out = Buffer.allocUnsafe(px * 3);
    const sL = sLstd > MIN_STD ? gLstd / sLstd : 1;
    const sA = sastd > MIN_STD ? gAstd / sastd : 1;
    const sB = sbstd > MIN_STD ? gBstd / sbstd : 1;
    let waterPxTouched = 0;
    for (let p = 0; p < px; p++) {
      const oi = p * info.channels;
      const oo = p * 3;
      const r = data[oi], g = data[oi + 1], bl = data[oi + 2];
      const m = waterMask(r, g, bl);
      if (m <= 0) {
        out[oo] = r; out[oo + 1] = g; out[oo + 2] = bl;
        continue;
      }
      const [L, A, B] = rgbToLab(r, g, bl);
      const Lp = (L - sLmean) * sL + gLm;
      const Ap = (A - samean) * sA + gAm;
      const Bp = (B - sbmean) * sB + gBm;
      const [r2, g2, b2] = labToRgb(Lp, Ap, Bp);
      out[oo]     = Math.round(r * (1 - m) + r2 * m);
      out[oo + 1] = Math.round(g * (1 - m) + g2 * m);
      out[oo + 2] = Math.round(bl * (1 - m) + b2 * m);
      waterPxTouched++;
    }
    await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
      .jpeg({ quality: 90 })
      .toFile(dest);
    processed++;
  }

  if ((i + 1) % 100 === 0 || i === tiles.length - 1) {
    process.stdout.write(`\r  ${i + 1}/${tiles.length} tiles · ${processed} normalized · ${untouched} untouched`);
  }
}
console.log("");

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log("");
console.log(`Done en ${elapsed}s.`);
console.log(`  ${processed} tiles normalizados con Lab matching (stats smoothed)`);
console.log(`  ${untouched} tiles sin stats válidas en su vecindario (sin tocar)`);
console.log("");
console.log("Recargá /bandar-test (con cache invalidado) para ver el resultado.");
console.log("Si querés volver al original: node scripts/normalize-water-tiles.mjs --reset");
