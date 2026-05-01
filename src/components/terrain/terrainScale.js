import * as THREE from "three";

// Centro: Bandar Abbas TFB.9 (Tactical Fighter Base 9), histórica base de los
// F-14A Tomcats iraníes en el Estrecho de Hormuz.
export const TERRAIN_CENTER_LAT = 27.218;
export const TERRAIN_CENTER_LON = 56.378;

export const TILE_PX = 256;
export const EARTH_CIRCUMFERENCE = 40075016.686;

const _MPT = (zoom) =>
  (EARTH_CIRCUMFERENCE * Math.cos(THREE.MathUtils.degToRad(TERRAIN_CENTER_LAT))) /
  (2 ** zoom);

// ─── LEGACY (fallback terrain — no se usa en el WT path) ──────────────────────
export const TERRAIN_ZOOM = 14;
export const TERRAIN_GRID_SIZE = 9;
export const TERRAIN_METERS_PER_TILE = _MPT(TERRAIN_ZOOM);
export const TERRAIN_WORLD_SIZE = TERRAIN_METERS_PER_TILE * TERRAIN_GRID_SIZE;
export const COAST_OFFSET = 5200;
// Carve area = "isla artificial" del aeropuerto. Más ancho que el runway real
// (240m) para cubrir taxiways/apron (~1.5 km × 4 km típico de un aeropuerto
// internacional como Bandar Abbas). Sin esto, las taxiways del heightmap natural
// dipean bajo el agua y se ve "agua comiendo el aeropuerto".
export const RUNWAY_CORRIDOR_HALF_WIDTH = 800;
export const RUNWAY_CORRIDOR_HALF_LENGTH = 2500;

// ─── LOD rings cubriendo todo el Golfo Pérsico ────────────────────────────────
// Cada ring es una textura cuadrada (canvas ≤ 8192 px = 32 tiles × 256 px)
// centrada en Bandar Abbas. Tiles pre-descargados a /public/tiles/ con el
// script `scripts/download-tiles.mjs`.
//
//   OUTER  zoom 10 · 1024 tiles · ~1114 km × 1114 km · ~35 km/tile
//          → todo el Golfo (Iraq, Kuwait, Saudi, UAE, Oman, costa iraní)
//   MID    zoom 13 · 1024 tiles · ~139 km × 139 km · ~4.4 km/tile
//          → región alrededor de Bandar Abbas, Estrecho de Hormuz
//   INNER  zoom 16 · 1024 tiles · ~17 km × 17 km · ~544 m/tile
//          → base aérea + alrededores, marcas de pista, edificios
export const WT_OUTER_ZOOM      = 10;
export const WT_OUTER_GRID_SIZE = 32;
export const WT_OUTER_METERS_PER_TILE = _MPT(WT_OUTER_ZOOM);
export const WT_OUTER_WORLD_SIZE = WT_OUTER_METERS_PER_TILE * WT_OUTER_GRID_SIZE;

export const WT_MID_ZOOM      = 13;
export const WT_MID_GRID_SIZE = 32;
export const WT_MID_METERS_PER_TILE = _MPT(WT_MID_ZOOM);
export const WT_MID_WORLD_SIZE = WT_MID_METERS_PER_TILE * WT_MID_GRID_SIZE;

export const WT_INNER_ZOOM      = 16;
export const WT_INNER_GRID_SIZE = 32;
export const WT_INNER_METERS_PER_TILE = _MPT(WT_INNER_ZOOM);
export const WT_INNER_WORLD_SIZE = WT_INNER_METERS_PER_TILE * WT_INNER_GRID_SIZE;

// ─── Inner ring — Zoom 14 nativo, NxN sub-meshes ─────────────────────────────
// Cada sub-mesh: 16×16 tiles de zoom 14 (canvas 4096 px, ~35 km × 35 km, ~6.8
// m/pixel). Grilla 5×5 = 175 km × 175 km, shifted al sur 32 tiles. Mismo
// layout/cobertura que el inner15 anterior pero 1/4 del disco (~108 MB) y sin
// downsample en cliente. North edge en costa iraní, extensión sur cubre el
// Estrecho de Hormuz + Musandam + Golfo de Omán.
export const WT_INNER14_ZOOM       = 14;
export const WT_INNER14_GRID_SIZE  = 16;              // tiles z14 por sub-mesh
export const WT_INNER14_GRID_COUNT = 5;               // sub-meshes por lado (5×5)
export const WT_INNER14_TILE_SHIFT_X = 0;
export const WT_INNER14_TILE_SHIFT_Y = 32;            // south shift = ~70 km
export const WT_INNER14_METERS_PER_TILE = _MPT(WT_INNER14_ZOOM);
export const WT_INNER14_SUBMESH_SIZE    = WT_INNER14_METERS_PER_TILE * WT_INNER14_GRID_SIZE;
export const WT_INNER14_TOTAL_SIZE      = WT_INNER14_SUBMESH_SIZE * WT_INNER14_GRID_COUNT;
export const WT_INNER14_CENTER_X = WT_INNER14_TILE_SHIFT_X * WT_INNER14_METERS_PER_TILE;
export const WT_INNER14_CENTER_Z = WT_INNER14_TILE_SHIFT_Y * WT_INNER14_METERS_PER_TILE;

// Heightmap COARSE: mismo zoom/grid que outer — relieve grueso para horizonte
export const WT_HEIGHT_ZOOM      = WT_OUTER_ZOOM;
export const WT_HEIGHT_GRID_SIZE = WT_OUTER_GRID_SIZE;

// Heightmap FINO: zoom 13, grid 48 + shift sur 16 tiles → cubre 209 km × 209 km
// centrado en +70 km sur. Esto le da margen al inner14 (175 km, mismo shift)
// para tener displacement sin clamp en los bordes sur.
export const WT_HEIGHT_FINE_ZOOM      = 13;
export const WT_HEIGHT_FINE_GRID_SIZE = 48;
export const WT_HEIGHT_FINE_TILE_SHIFT_X = 0;
export const WT_HEIGHT_FINE_TILE_SHIFT_Y = 16;
export const WT_HEIGHT_FINE_METERS_PER_TILE = _MPT(WT_HEIGHT_FINE_ZOOM);
export const WT_HEIGHT_FINE_WORLD_SIZE = WT_HEIGHT_FINE_METERS_PER_TILE * WT_HEIGHT_FINE_GRID_SIZE;
export const WT_HEIGHT_FINE_CENTER_X = WT_HEIGHT_FINE_TILE_SHIFT_X * WT_HEIGHT_FINE_METERS_PER_TILE;
export const WT_HEIGHT_FINE_CENTER_Z = WT_HEIGHT_FINE_TILE_SHIFT_Y * WT_HEIGHT_FINE_METERS_PER_TILE;

// ─── Airport patch — overlay z17 sobre el inner14 ────────────────────────────
// 1 sub-mesh de 48×48 tiles z17 = ~13 × 13 km centrado en TFB.9. Cubre el
// aeropuerto, ciudad, costa y el puerto comercial al sur. Resolución 1.06 m/px.
export const WT_AIRPORT_ZOOM       = 17;
export const WT_AIRPORT_GRID_SIZE  = 48;
export const WT_AIRPORT_METERS_PER_TILE = _MPT(WT_AIRPORT_ZOOM);
export const WT_AIRPORT_WORLD_SIZE = WT_AIRPORT_METERS_PER_TILE * WT_AIRPORT_GRID_SIZE;

// Mesh density. 256 segments es suficiente para el outer ring (cada quad ~4.3 km)
// El inner ring usa más segmentos relativos por unidad de área.
export const WT_MESH_SEGMENTS = 256;

// ─── Compatibilidad con el código actual ─────────────────────────────────────
// Mientras migramos a 3 rings, mantenemos los nombres antiguos apuntando al
// outer ring (vista global).
export const WT_ZOOM       = WT_OUTER_ZOOM;
export const WT_GRID_SIZE  = WT_OUTER_GRID_SIZE;
export const WT_WORLD_SIZE = WT_OUTER_WORLD_SIZE;
export const WT_METERS_PER_TILE = WT_OUTER_METERS_PER_TILE;
