"use client";

// IndexedDB cache para canvases stitcheados del terreno. Reload-a-reload, evita
// re-decodificar 10k JPG y re-stitchear 25 canvases — en su lugar guarda cada
// canvas como blob JPEG y lo restaura con createImageBitmap.
//
// Cache key incluye todos los params que afectan el output (zoom, grid, shift,
// downsample, manifest version). Si cambiás un param, la entrada vieja queda
// huérfana — se limpian con clearTerrainCache() (expuesto en window para dev).

const DB_NAME = "f35-terrain";
const DB_VERSION = 1;
const STORE = "canvases";

let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
  return _dbPromise;
}

export async function getCachedCanvas(key) {
  try {
    const db = await openDB();
    const blob = await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror  = () => resolve(null);
    });
    if (!blob) return null;
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    bmp.close?.();
    return c;
  } catch {
    return null;
  }
}

export async function putCachedCanvas(key, canvas, quality = 0.85) {
  try {
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });
    if (!blob) return;
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    });
  } catch {}
}

export async function clearTerrainCache() {
  const db = await openDB();
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
  });
  console.log("[terrainCache] cleared");
}

if (typeof window !== "undefined") {
  window.__clearTerrainCache = clearTerrainCache;
}
