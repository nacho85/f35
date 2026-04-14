"use client";

import { useMemo } from "react";
import * as THREE from "three";

import {
  COAST_OFFSET,
  RUNWAY_CORRIDOR_HALF_LENGTH,
  RUNWAY_CORRIDOR_HALF_WIDTH,
  TERRAIN_WORLD_SIZE,
} from "./terrainScale";

const SEGMENTS = 192;
const DUNE_SCALE = 0.00042;
const DUNE_HEIGHT = 7;

function fade(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  return lerp(
    lerp(hash(xi, yi), hash(xi + 1, yi), fade(xf)),
    lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), fade(xf)),
    fade(yf)
  );
}

function fbm(x, y) {
  return (
    noise2(x, y) * 0.58 +
    noise2(x * 2.1, y * 2.1) * 0.28 +
    noise2(x * 4.7, y * 4.7) * 0.14
  );
}

function makeSandTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = fbm(x * 0.03, y * 0.03) * 0.68 + fbm(x * 0.14 + 21, y * 0.14) * 0.32;
      const i = (y * size + x) * 4;
      data[i] = Math.min(255, Math.round(183 + v * 52));
      data[i + 1] = Math.min(255, Math.round(151 + v * 39));
      data[i + 2] = Math.min(255, Math.round(92 + v * 26));
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

export default function GulfFallbackTerrain({ groundY = -2 }) {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      TERRAIN_WORLD_SIZE,
      TERRAIN_WORLD_SIZE,
      SEGMENTS,
      SEGMENTS
    );
    const pos = geo.attributes.position.array;
    const side = SEGMENTS + 1;

    for (let row = 0; row < side; row += 1) {
      for (let col = 0; col < side; col += 1) {
        const vi = (row * side + col) * 3;
        const px = pos[vi];
        const py = pos[vi + 1];

        if (py > COAST_OFFSET) {
          continue;
        }

        if (
          Math.abs(px) < RUNWAY_CORRIDOR_HALF_WIDTH &&
          Math.abs(py) < RUNWAY_CORRIDOR_HALF_LENGTH
        ) {
          continue;
        }

        const distRunway = Math.max(
          Math.abs(px) - RUNWAY_CORRIDOR_HALF_WIDTH,
          Math.abs(py) - RUNWAY_CORRIDOR_HALF_LENGTH,
          0
        );
        const distCoast = Math.max(COAST_OFFSET - py, 0);
        const blend = Math.min(Math.min(distRunway, distCoast) / 800, 1);
        pos[vi + 2] = (fbm(px * DUNE_SCALE, py * DUNE_SCALE) - 0.5) * DUNE_HEIGHT * blend;
      }
    }

    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, []);

  const terrainMaterial = useMemo(() => {
    const texture = new THREE.CanvasTexture(makeSandTexture());
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(56, 56);
    texture.anisotropy = 16;
    texture.colorSpace = THREE.SRGBColorSpace;

    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.95,
      metalness: 0,
    });
  }, []);

  const waterLength = TERRAIN_WORLD_SIZE / 2 - COAST_OFFSET;
  const waterCenterZ = COAST_OFFSET + waterLength / 2;

  return (
    <>
      <mesh
        geometry={geometry}
        material={terrainMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, groundY, 0]}
        receiveShadow
      />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, groundY + 0.02, waterCenterZ]}
      >
        <planeGeometry args={[TERRAIN_WORLD_SIZE, waterLength * 2]} />
        <meshStandardMaterial color="#2a83ab" roughness={0.78} metalness={0} />
      </mesh>
    </>
  );
}
