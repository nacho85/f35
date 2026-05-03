// Proyección lat/lon → world (X, Z) que matchea exactamente la satelital
// Mapbox (Web Mercator stitched at zoom WT_OUTER_ZOOM, calibrada al
// TERRAIN_CENTER_LAT).
//
// Por qué Mercator y no equirectangular: los tiles de Mapbox son Mercator,
// y al stitchearlos en una imagen plana queda una proyección Mercator. Si
// usamos equirect para placement OSM, a >50km del centro acumulamos error
// proporcional a la diferencia tan(lat) vs lat → buildings/roads se desfasan
// del satelital. Usando Mercator quedan alineados.
//
// Fórmulas:
//   - X (este-oeste): linear, igual que equirect (cos(L_center) constante).
//   - Z (norte-sur): proporcional a la diferencia de y_mercator,
//     escalada por EARTH·cos(L_center)/(2π) — derivado de:
//        world_Z = (y_merc(L_center) - y_merc(L)) · 2^zoom · MPT(L_center)/(2π)
//     y MPT(L_center) = EARTH·cos(L_center)/2^zoom → 2^zoom se cancela.

import { TERRAIN_CENTER_LAT, TERRAIN_CENTER_LON } from "./terrainScale";

const EARTH = 40075016.686;
const L_RAD = (TERRAIN_CENTER_LAT * Math.PI) / 180;
const COS_L = Math.cos(L_RAD);

export const M_PER_LON = (EARTH * COS_L) / 360;
const MERC_SCALE = (EARTH * COS_L) / (2 * Math.PI);
const Y_MERC_REF = Math.log(Math.tan(Math.PI / 4 + L_RAD / 2));

export function llToWorld(lat, lon) {
  const yMerc = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2));
  return [
    (lon - TERRAIN_CENTER_LON) * M_PER_LON,
    (Y_MERC_REF - yMerc) * MERC_SCALE,
  ];
}

// Inverse — útil para debug o para componentes que necesitan saber la lat
// de un punto del mundo.
export function worldToLatLon(x, z) {
  const lon = TERRAIN_CENTER_LON + x / M_PER_LON;
  const yMerc = Y_MERC_REF - z / MERC_SCALE;
  const lat = (Math.atan(Math.sinh(yMerc)) * 180) / Math.PI;
  return [lat, lon];
}
