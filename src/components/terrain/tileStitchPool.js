"use client";

// Pool de Web Workers para stitchear chunks satelitales fuera del main thread.
// Round-robin: cada llamada a stitchInWorker toma el siguiente worker del pool.
// Lazy init — los workers se crean en el primer uso (evita SSR issues).

const POOL_SIZE = 4;
let _pool = null;
let _nextId = 1;
let _rrIdx = 0;

function getPool() {
  if (_pool) return _pool;
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  _pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const w = new Worker(new URL("./tileStitchWorker.js", import.meta.url), { type: "module" });
    const pending = new Map();
    w.onmessage = (e) => {
      const { id, bitmap, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(bitmap);
    };
    _pool.push({ worker: w, pending });
  }
  return _pool;
}

export function stitchSupported() {
  return typeof OffscreenCanvas !== "undefined" && typeof Worker !== "undefined";
}

export function stitchInWorker({ tasks, gridSize, tilePx, waterColor }) {
  const pool = getPool();
  if (!pool) return Promise.reject(new Error("Worker pool not available"));
  const slot = pool[_rrIdx++ % POOL_SIZE];
  const id = _nextId++;
  return new Promise((resolve, reject) => {
    slot.pending.set(id, { resolve, reject });
    slot.worker.postMessage({ id, tasks, gridSize, tilePx, waterColor });
  });
}
