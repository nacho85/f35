"use client";

import { useMemo } from "react";
import * as THREE from "three";

// ─── Config ───────────────────────────────────────────────────────────────────
//
//  Coordinate convention (after rotation [-PI/2, 0, 0]):
//    plane Y  > 0  →  world -Z  (inland / south, where plane starts)
//    plane Y  < 0  →  world +Z  (Gulf   / north, ahead)
//
//  Scale: 1 unit = 1 metre.  Al Dhafra-style airbase, UAE.

const WORLD_SIZE = 80000;   // 80 km × 80 km detailed terrain mesh
const SEGMENTS   = 160;     // ~500 m/segment — reasonable dune fidelity at this scale
const DUNE_SCALE  = 0.00008; // lower frequency → longer dune ridges (more realistic)
const DUNE_HEIGHT = 12;     // up to 12 m dunes — typical UAE erg dunes

// Runway corridor kept perfectly flat.
// RWY_LEN = 3600, RWY_WIDTH = 60  (defined in F35Scene)
const FLAT_HW = 60;    // half-width (X) — 60 m matches runway + shoulders
const FLAT_HL = 2200;  // half-length — 2200 m > RWY_LEN/2 + RESA + apron

// Coastline at world Z = +COAST  (≈ 28 km from runway centre — realistic for Gulf airbase)
const COAST = 28000;

// ─── Noise helpers ────────────────────────────────────────────────────────────
function fade(t) { return t * t * (3 - 2 * t); }
function lrp(a, b, t) { return a + (b - a) * t; }
function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  return lrp(
    lrp(hash(xi, yi),     hash(xi + 1, yi),     fade(xf)),
    lrp(hash(xi, yi + 1), hash(xi + 1, yi + 1), fade(xf)),
    fade(yf),
  );
}
function fbm(x, y) {
  return noise2(x, y) * 0.60
       + noise2(x * 2.2, y * 2.2) * 0.28
       + noise2(x * 5.1, y * 5.1) * 0.12;
}

// ─── Procedural sand texture (tiled 512 × 512) ────────────────────────────────
function makeSandTexture() {
  const SIZE = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx  = canvas.getContext("2d");
  const img  = ctx.createImageData(SIZE, SIZE);
  const data = img.data;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = fbm(x * 0.035, y * 0.035) * 0.65 + fbm(x * 0.14 + 29, y * 0.14) * 0.35;
      const i = (y * SIZE + x) * 4;
      data[i]     = Math.min(255, Math.round(175 + v * 65));
      data[i + 1] = Math.min(255, Math.round(143 + v * 55));
      data[i + 2] = Math.min(255, Math.round( 76 + v * 44));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DesertTerrain({ groundY = -2 }) {

  const geometry = useMemo(() => {
    const geo  = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEGMENTS, SEGMENTS);
    const pos  = geo.attributes.position.array;
    const side = SEGMENTS + 1;

    for (let row = 0; row < side; row++) {
      for (let col = 0; col < side; col++) {
        const vi = (row * side + col) * 3;
        const px = pos[vi];       // plane X → world X
        const py = pos[vi + 1];   // plane Y → world -Z

        // Gulf side: terrain is flat below sea level — water plane covers this
        if (py < -COAST) continue;

        // Runway + apron corridor: completely flat
        if (Math.abs(px) < FLAT_HW && Math.abs(py) < FLAT_HL) continue;

        // Blend distance: metres from either flat zone
        const dRwy   = Math.max(Math.abs(px) - FLAT_HW, Math.abs(py) - FLAT_HL, 0);
        const dCoast = py + COAST;  // 0 at shore, grows inland

        // Dunes fade in over 500 m from the flat zones (gradual transition)
        const blend = Math.min(Math.min(dRwy, dCoast) / 500, 1);

        pos[vi + 2] = (fbm(px * DUNE_SCALE, py * DUNE_SCALE) - 0.5) * DUNE_HEIGHT * blend;
      }
    }

    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, []);

  const material = useMemo(() => {
    const tex = new THREE.CanvasTexture(makeSandTexture());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // 80 km terrain, tile every ~400 m for visible sand grain
    tex.repeat.set(200, 200);
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.93, metalness: 0 });
  }, []);

  // ── Persian Gulf ─────────────────────────────────────────────────────────────
  //
  //  The Gulf is ~330 km wide (N-S) at this longitude.
  //  Coastline: world Z = +28 000 m  (28 km from runway centre)
  //  Ocean plane extends 400 km northward from the coast.
  //
  //  roughness=0.85 → matte surface, no mirror/building reflections.

  const OCEAN_DEPTH = 400000;   // 400 km of ocean
  const waterZ0     = COAST + OCEAN_DEPTH / 2;

  return (
    <>
      {/* Sandy desert — detailed 80 km mesh with dunes */}
      <mesh geometry={geometry} material={material}
            rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]}
            receiveShadow />

      {/* Persian Gulf — wide matte ocean, no reflections */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}
            position={[0, groundY + 0.04, waterZ0]}>
        <planeGeometry args={[WORLD_SIZE + OCEAN_DEPTH, OCEAN_DEPTH]} />
        <meshStandardMaterial color="#1a6e96" roughness={0.85} metalness={0} />
      </mesh>
    </>
  );
}
