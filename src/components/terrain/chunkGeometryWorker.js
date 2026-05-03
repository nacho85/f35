// Worker: genera la geometría per-chunk del StreamingTerrain (positions, normals,
// uvs, indices) sampleando el heightmap fine + outer sin bloquear el main thread.
//
// Protocolo:
//   in:  { type: "init", fine, outer }       — recibe heightmap snapshot UNA vez
//   in:  { type: "build", id, params }       — genera 1 chunk
//        params = { wx, wz, worldSize, segs, yOffset }
//   out: { type: "built", id, positions, normals, uvs, indices }
//
// Layout vértices (matchea PlaneGeometry + rotateX(-PI/2)):
//   for iy in 0..segs, for ix in 0..segs:
//     xlocal = (ix/segs - 0.5) * worldSize
//     zlocal = (iy/segs - 0.5) * worldSize
//     y = sample(xlocal+wx, zlocal+wz) + yOffset
//     uv = (ix/segs, 1 - iy/segs)
//   index winding: a,b,d / b,c,d   (a=top-left, b=bot-left, c=bot-right, d=top-right)

let _hmFine = null;
let _hmOuter = null;

function sampleHm(hm, x, z) {
  const u = 0.5 + (x - hm.centerX) / hm.worldSize;
  const v = 0.5 + (z - hm.centerZ) / hm.worldSize;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const fx = u * (hm.w - 1);
  const fy = v * (hm.h - 1);
  const x0 = Math.floor(fx), x1 = Math.min(hm.w - 1, x0 + 1);
  const y0 = Math.floor(fy), y1 = Math.min(hm.h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const d = hm.data;
  const w = hm.w;
  const p00 = d[(y0 * w + x0) * 4] / 255;
  const p10 = d[(y0 * w + x1) * 4] / 255;
  const p01 = d[(y1 * w + x0) * 4] / 255;
  const p11 = d[(y1 * w + x1) * 4] / 255;
  const v0 = p00 * (1 - tx) + p10 * tx;
  const v1 = p01 * (1 - tx) + p11 * tx;
  return (v0 * (1 - ty) + v1 * ty) * hm.range + hm.minElev + hm.yOffset;
}

function elevation(x, z) {
  if (_hmFine) {
    const e = sampleHm(_hmFine, x, z);
    if (e !== null) return e;
  }
  if (_hmOuter) {
    const e = sampleHm(_hmOuter, x, z);
    if (e !== null) return e;
  }
  return 0;
}

function buildChunk({ wx, wz, worldSize, segs, yOffset }) {
  const N = segs + 1;
  const vertCount = N * N;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const half = worldSize / 2;

  // Positions + UVs
  let pi = 0, ui = 0;
  for (let iy = 0; iy <= segs; iy++) {
    const ty = iy / segs;
    const zlocal = (ty - 0.5) * worldSize;
    const wzWorld = zlocal + wz;
    for (let ix = 0; ix <= segs; ix++) {
      const tx = ix / segs;
      const xlocal = (tx - 0.5) * worldSize;
      const wxWorld = xlocal + wx;
      const y = elevation(wxWorld, wzWorld) + yOffset;
      positions[pi++] = xlocal;
      positions[pi++] = y;
      positions[pi++] = zlocal;
      uvs[ui++] = tx;
      uvs[ui++] = 1 - ty;
    }
  }

  // Indices (uint16 si vertCount < 65536, sino uint32). 49² = 2401 < 65536 ok.
  const useU32 = vertCount > 65535;
  const triCount = segs * segs * 2;
  const indices = useU32 ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
  let ii = 0;
  for (let iy = 0; iy < segs; iy++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iy * N + ix;
      const b = (iy + 1) * N + ix;
      const c = (iy + 1) * N + (ix + 1);
      const d = iy * N + (ix + 1);
      indices[ii++] = a; indices[ii++] = b; indices[ii++] = d;
      indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
    }
  }

  // Normals (face-derived, accumulated to verts, then normalized).
  // Mismo algoritmo que THREE.BufferGeometry.computeVertexNormals.
  const normals = new Float32Array(vertCount * 3);
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3, ib = indices[t + 1] * 3, ic = indices[t + 2] * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const fx = cx - ax, fy = cy - ay, fz = cz - az;
    const nx = ey * fz - ez * fy;
    const ny = ez * fx - ex * fz;
    const nz = ex * fy - ey * fx;
    normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
    normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
    normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i], y = normals[i + 1], z = normals[i + 2];
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    normals[i] = x / len; normals[i + 1] = y / len; normals[i + 2] = z / len;
  }

  return { positions, normals, uvs, indices };
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    _hmFine = msg.fine;
    _hmOuter = msg.outer;
    self.postMessage({ type: "ready" });
    return;
  }
  if (msg.type === "build") {
    const { id, params } = msg;
    const { positions, normals, uvs, indices } = buildChunk(params);
    self.postMessage(
      { type: "built", id, positions, normals, uvs, indices },
      [positions.buffer, normals.buffer, uvs.buffer, indices.buffer]
    );
  }
};
