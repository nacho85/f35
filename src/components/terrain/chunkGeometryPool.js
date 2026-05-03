"use client";

// Pool de Web Workers para construir geometrías de StreamingTerrain chunks
// (positions + normals + uvs + indices). Init lazy: el pool se crea cuando
// el heightmap está listo y hace `init` a cada worker con un snapshot del HM.
//
// Si initPool() todavía no fue llamado, buildChunkGeometry rechaza — el caller
// (StreamingTerrain) debe esperar isHeightmapReady() antes de pedir chunks.

import { getHeightmapSnapshot } from "./sharedHeightmap";

const POOL_SIZE = 4;
let _pool = null;
let _initPromise = null;
let _nextId = 1;
let _rrIdx = 0;

export function initChunkGeometryPool() {
  if (_initPromise) return _initPromise;
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    _initPromise = Promise.reject(new Error("Worker not available"));
    return _initPromise;
  }
  const snapshot = getHeightmapSnapshot();
  if (!snapshot.fine) {
    _initPromise = Promise.reject(new Error("Heightmap not ready"));
    return _initPromise;
  }
  _pool = [];
  const readyPromises = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const w = new Worker(new URL("./chunkGeometryWorker.js", import.meta.url), { type: "module" });
    const pending = new Map();
    let resolveReady;
    const readyP = new Promise((r) => { resolveReady = r; });
    w.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "ready") { resolveReady(); return; }
      if (msg.type === "built") {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        p.resolve({
          positions: msg.positions,
          normals: msg.normals,
          uvs: msg.uvs,
          indices: msg.indices,
        });
      }
    };
    // Snapshot data se copia (estructured clone) — cada worker tiene su copia
    // del heightmap (~unos MB cada uno, total <50MB para POOL_SIZE=4).
    w.postMessage({ type: "init", fine: snapshot.fine, outer: snapshot.outer });
    _pool.push({ worker: w, pending });
    readyPromises.push(readyP);
  }
  _initPromise = Promise.all(readyPromises);
  return _initPromise;
}

export function buildChunkGeometry(params) {
  if (!_pool) return Promise.reject(new Error("Pool not initialized"));
  const slot = _pool[_rrIdx++ % POOL_SIZE];
  const id = _nextId++;
  return new Promise((resolve, reject) => {
    slot.pending.set(id, { resolve, reject });
    slot.worker.postMessage({ type: "build", id, params });
  });
}
