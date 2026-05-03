// Web Worker: stitchea N tiles JPG en un OffscreenCanvas y devuelve un
// ImageBitmap transferible. Saca decode + drawImage del main thread — eso es
// lo que estaba hitcheando cuando StreamingTerrain cargaba un chunk nuevo.
//
// Protocolo:
//   in:  { id, tasks: [{url, col, row}], gridSize, tilePx, waterColor }
//   out: { id, bitmap }   (bitmap se transfiere — el worker pierde la ref)
//   err: { id, error }

self.onmessage = async (e) => {
  const { id, tasks, gridSize, tilePx, waterColor } = e.data;
  try {
    const px = gridSize * tilePx;
    const canvas = new OffscreenCanvas(px, px);
    const ctx = canvas.getContext("2d");
    if (waterColor) {
      ctx.fillStyle = waterColor;
      ctx.fillRect(0, 0, px, px);
    }
    await Promise.all(tasks.map(async (t) => {
      try {
        const res = await fetch(t.url);
        if (!res.ok) return;
        const blob = await res.blob();
        const bmp = await createImageBitmap(blob);
        ctx.drawImage(bmp, t.col * tilePx, t.row * tilePx, tilePx, tilePx);
        bmp.close?.();
      } catch {
        // tile faltante — el waterColor de fondo queda visible
      }
    }));
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ id, bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};
