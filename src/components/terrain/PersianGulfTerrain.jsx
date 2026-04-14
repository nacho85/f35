"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// ─── Tile config ──────────────────────────────────────────────────────────────
//
//  Center tile (166, 110) ≈ Abu Dhabi coast (lat 24.4°N lon 54.3°E).
//
//  Orientation after rotation [-PI/2, 0, 0] + THREE default flipY:
//    world +Z  →  north (toward Gulf water)
//    world -Z  →  south (inland UAE desert, where plane starts)
//
//  5×5 zoom-8 grid covers ~750 km²:
//    tile y = 108  →  world Z ≈ +2000  (northern Gulf, Iran coast)
//    tile y = 110  →  world Z ≈     0  (UAE coastline)
//    tile y = 112  →  world Z ≈ -2000  (inland UAE / Oman)
//
//  The runway sits at Z = 0 (coastline) – first half on desert,
//  second half pointing out to sea.  Plane starts at Z ≈ -210 (inland)
//  and takes off toward +Z (over the Gulf).

const ZOOM        = 8;
const GRID_CENTER = { x: 166, y: 110 };
const GRID_SIZE   = 5;
const TILE_PX     = 256;
const WORLD_SIZE  = 4000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tileUrl(z, x, y, token) {
  return `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}.jpg90?access_token=${token}`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Tile failed: ${url}`));
    img.src = url;
  });
}

async function stitchSatellite(token) {
  const half   = Math.floor(GRID_SIZE / 2);
  const px     = TILE_PX * GRID_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");

  await Promise.all(
    Array.from({ length: GRID_SIZE }, (_, row) =>
      Array.from({ length: GRID_SIZE }, (_, col) =>
        loadImage(
          tileUrl(ZOOM, GRID_CENTER.x - half + col, GRID_CENTER.y - half + row, token)
        ).then((img) => ctx.drawImage(img, col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX))
      )
    ).flat()
  );

  return canvas;
}

// ─── Water plane (covers Gulf from just past runway to north edge) ─────────────
//
//  Gulf area starts at world Z ≈ +220 (just past the runway far threshold).
//  We extend it 200 units past the terrain edge for seamless horizon.

const WATER_Z_START = 220;
const WATER_LENGTH  = WORLD_SIZE / 2 - WATER_Z_START + 200;
const WATER_Z       = WATER_Z_START + WATER_LENGTH / 2;

function WaterPlane({ groundY }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY + 0.05, -WATER_Z]}>
      <planeGeometry args={[WORLD_SIZE + 800, WATER_LENGTH]} />
      <meshStandardMaterial
        color="#0d5c8a"
        roughness={0.07}
        metalness={0.22}
        transparent
        opacity={0.91}
      />
    </mesh>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PersianGulfTerrain({ token, groundY = -2 }) {
  const meshRef = useRef();

  useEffect(() => {
    if (!token) {
      console.warn("PersianGulfTerrain: no Mapbox token provided");
      return;
    }

    let cancelled = false;

    async function build() {
      const satelliteCanvas = await stitchSatellite(token);
      if (cancelled) return;

      const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1);
      const texture  = new THREE.CanvasTexture(satelliteCanvas);
      texture.anisotropy  = 16;
      texture.colorSpace  = THREE.SRGBColorSpace;

      const mesh = meshRef.current;
      if (!mesh || cancelled) return;

      const oldGeo = mesh.geometry;
      const oldMat = mesh.material;
      mesh.geometry = geometry;
      mesh.material = new THREE.MeshStandardMaterial({
        map:       texture,
        roughness: 0.88,
        metalness: 0,
      });
      oldGeo.dispose();
      if (oldMat.map) oldMat.map.dispose();
      oldMat.dispose();
    }

    build().catch(console.error);
    return () => { cancelled = true; };
  }, [token, groundY]);

  return (
    <>
      {/* Satellite terrain — sandy placeholder while tiles load */}
      <mesh
        ref={meshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, groundY, 0]}
        receiveShadow
      >
        <planeGeometry args={[WORLD_SIZE, WORLD_SIZE, 1, 1]} />
        <meshStandardMaterial color="#c2a96a" roughness={1} />
      </mesh>

      {/* Gulf water plane */}
      <WaterPlane groundY={groundY} />
    </>
  );
}
