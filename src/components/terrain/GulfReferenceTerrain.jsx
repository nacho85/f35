"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import {
  TERRAIN_CENTER_LAT,
  TERRAIN_CENTER_LON,
  TERRAIN_GRID_SIZE,
  TERRAIN_WORLD_SIZE,
  TERRAIN_ZOOM,
  TILE_PX,
} from "./terrainScale";

function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat, zoom) {
  const latRad = THREE.MathUtils.degToRad(lat);
  const mercator = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.floor(((1 - mercator / Math.PI) / 2) * 2 ** zoom);
}

function tileUrl(z, x, y, token) {
  return `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}.jpg90?access_token=${token}`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Tile failed: ${url}`));
    img.src = url;
  });
}

async function stitchSatellite(token) {
  const centerX = lonToTileX(TERRAIN_CENTER_LON, TERRAIN_ZOOM);
  const centerY = latToTileY(TERRAIN_CENTER_LAT, TERRAIN_ZOOM);
  const half = Math.floor(TERRAIN_GRID_SIZE / 2);
  const px = TILE_PX * TERRAIN_GRID_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");

  await Promise.all(
    Array.from({ length: TERRAIN_GRID_SIZE }, (_, row) =>
      Array.from({ length: TERRAIN_GRID_SIZE }, (_, col) =>
        loadImage(
          tileUrl(TERRAIN_ZOOM, centerX - half + col, centerY - half + row, token)
        ).then((img) => {
          ctx.drawImage(img, col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX);
        })
      )
    ).flat()
  );

  return canvas;
}

export default function GulfReferenceTerrain({ token, groundY = -2 }) {
  const meshRef = useRef(null);

  useEffect(() => {
    if (!token) {
      console.warn("GulfReferenceTerrain: no Mapbox token provided");
      return;
    }

    let cancelled = false;

    async function build() {
      const satelliteCanvas = await stitchSatellite(token);
      if (cancelled) {
        return;
      }

      const texture = new THREE.CanvasTexture(satelliteCanvas);
      texture.anisotropy = 16;
      texture.colorSpace = THREE.SRGBColorSpace;

      const mesh = meshRef.current;
      if (!mesh || cancelled) {
        texture.dispose();
        return;
      }

      const previousMaterial = mesh.material;
      mesh.material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.96,
        metalness: 0,
      });

      if (previousMaterial.map) {
        previousMaterial.map.dispose();
      }
      previousMaterial.dispose();
    }

    build().catch((error) => {
      console.error("GulfReferenceTerrain:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, groundY, 0]}
      receiveShadow
    >
      <planeGeometry args={[TERRAIN_WORLD_SIZE, TERRAIN_WORLD_SIZE, 1, 1]} />
      <meshStandardMaterial color="#c8ad74" roughness={1} metalness={0} />
    </mesh>
  );
}
