// Registro global de fuentes de calor (nozzles, etc) para el HeatShimmerEffect.
// Cada source es { posRef: Vector3-ref (world coords), throttleRef: number-ref }.
// HeatShimmer.jsx hace add/remove en mount/unmount; el Effect lee la lista por frame.

const _sources = new Set();

export function registerHeatSource(src) { _sources.add(src); }
export function unregisterHeatSource(src) { _sources.delete(src); }
export function getHeatSources() { return _sources; }
