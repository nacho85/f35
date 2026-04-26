"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinnedScene } from "three/examples/jsm/utils/SkeletonUtils.js";

const ENGINE_NOZZLE_NODE_NAME = "Object_21";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createCenteredPivot(object) {
  if (!object?.parent || !object.geometry) {
    return object;
  }

  const pivotName = `${object.name}_steerPivot`;

  if (object.parent.name === pivotName) {
    return object.parent;
  }

  const existingPivot = object.parent.children.find((child) => child.name === pivotName);
  if (existingPivot) {
    return existingPivot;
  }

  object.geometry.computeBoundingBox();
  const boundingBox = object.geometry.boundingBox;

  if (!boundingBox) {
    return object;
  }

  const center = boundingBox.getCenter(new THREE.Vector3());
  const worldCenter = object.localToWorld(center.clone());
  const parent = object.parent;
  const pivotPosition = parent.worldToLocal(worldCenter.clone());
  const pivot = new THREE.Group();

  pivot.name = pivotName;
  pivot.position.copy(pivotPosition);
  pivot.quaternion.copy(object.quaternion);
  pivot.scale.copy(object.scale);

  parent.add(pivot);
  pivot.attach(object);

  object.position.copy(center.multiplyScalar(-1));
  object.rotation.set(0, 0, 0);
  object.quaternion.identity();
  object.scale.set(1, 1, 1);
  object.updateMatrixWorld(true);

  return pivot;
}

function cloneWheelOverlayMaterial(sourceMaterial, fallbackTone = null) {
  const baseMaterial = Array.isArray(sourceMaterial) ? sourceMaterial[0] : sourceMaterial;

  // The original mesh is hidden after the overlay is created, so the overlay
  // can be fully opaque and write to the depth buffer — no transparency tricks needed.
  // FrontSide only: with the original hidden we don't need DoubleSide, and
  // using FrontSide prevents open cut-edges from rendering their back faces
  // (which appear bright/white due to inverted lighting at the boundary).
  if (!baseMaterial) {
    return new THREE.MeshStandardMaterial({
      color: fallbackTone?.color ?? "#2f2f2f",
      roughness: 0.82,
      metalness: 0.12,
      side: THREE.FrontSide,
    });
  }

  const material = baseMaterial.clone();

  if (fallbackTone?.color) {
    material.color = new THREE.Color(fallbackTone.color);
  }

  if ("emissive" in material) {
    material.emissive = new THREE.Color(0x000000);
    material.emissiveIntensity = 0;
  }

  material.side        = THREE.FrontSide;
  material.transparent = false;
  material.opacity     = 1;
  material.depthWrite  = true;

  return material;
}

function buildPlaneBasis(normal) {
  const safeNormal = normal.clone().normalize();
  const tangentSeed =
    Math.abs(safeNormal.z) < 0.9
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(tangentSeed, safeNormal).normalize();
  const v = new THREE.Vector3().crossVectors(safeNormal, u).normalize();
  return { u, v };
}

function createComponentDebugOverlays(target, tones) {
  const sourceGeometry = target?.geometry;
  const positionAttr = sourceGeometry?.getAttribute("position");

  if (!target?.parent || !sourceGeometry || !positionAttr) {
    return [];
  }

  const geometry = sourceGeometry.clone().toNonIndexed();
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const vertexCount = positions.count;
  const quantize = (value) => Math.round(value * 1000);
  const keyFor = (index) =>
    `${quantize(positions.getX(index))}:${quantize(positions.getY(index))}:${quantize(positions.getZ(index))}`;
  const triangles = [];
  const triangleBuckets = new Map();

  for (let i = 0; i < vertexCount; i += 3) {
    const triangleIndex = triangles.length;
    const indices = [i, i + 1, i + 2];
    const keys = indices.map((index) => keyFor(index));

    triangles.push({ indices, keys });

    for (const key of keys) {
      if (!triangleBuckets.has(key)) {
        triangleBuckets.set(key, []);
      }

      triangleBuckets.get(key).push(triangleIndex);
    }
  }

  const adjacency = triangles.map(() => new Set());

  triangles.forEach((triangle, triangleIndex) => {
    for (const key of triangle.keys) {
      for (const neighbor of triangleBuckets.get(key) || []) {
        if (neighbor !== triangleIndex) {
          adjacency[triangleIndex].add(neighbor);
        }
      }
    }
  });

  const visited = new Array(triangles.length).fill(false);
  const components = [];

  for (let i = 0; i < triangles.length; i += 1) {
    if (visited[i]) {
      continue;
    }

    const stack = [i];
    const componentTriangles = [];
    visited[i] = true;

    while (stack.length) {
      const current = stack.pop();
      const triangle = triangles[current];
      componentTriangles.push(triangle.indices);

      for (const neighbor of adjacency[current]) {
        if (!visited[neighbor]) {
          visited[neighbor] = true;
          stack.push(neighbor);
        }
      }
    }

    components.push(componentTriangles);
  }

  geometry.dispose();

  return components
    .sort((a, b) => b.length - a.length)
    .map((componentTriangles, index) => {
      const tone = tones[index % tones.length];
      const selectedPositions = [];
      const selectedNormals = [];

      for (const triangle of componentTriangles) {
        for (const vertexIndex of triangle) {
          selectedPositions.push(
            positions.getX(vertexIndex),
            positions.getY(vertexIndex),
            positions.getZ(vertexIndex)
          );

          if (normals) {
            selectedNormals.push(
              normals.getX(vertexIndex),
              normals.getY(vertexIndex),
              normals.getZ(vertexIndex)
            );
          }
        }
      }

      const overlayGeometry = new THREE.BufferGeometry();
      overlayGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(selectedPositions, 3)
      );

      if (selectedNormals.length) {
        overlayGeometry.setAttribute(
          "normal",
          new THREE.Float32BufferAttribute(selectedNormals, 3)
        );
      } else {
        overlayGeometry.computeVertexNormals();
      }

      const overlay = new THREE.Mesh(
        overlayGeometry,
        new THREE.MeshStandardMaterial({
          color: tone.color,
          emissive: tone.emissive,
          emissiveIntensity: 0.72,
          roughness: 0.45,
          metalness: 0.08,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
          side: THREE.DoubleSide,
        })
      );

      overlay.name = `${target.name}_componentOverlay_${index}`;
      return overlay;
    });
}

// Jacobi eigenvalue decomposition for 3×3 symmetric matrices.
// Returns [{val, vec:[x,y,z]}, ...] sorted by eigenvalue ascending.
// The eigenvector with the SMALLEST eigenvalue = normal of the flattest axis
// (= wheel axle for any disc/torus shape regardless of coordinate orientation).
function jacobiEigen3x3(a00, a01, a02, a11, a12, a22) {
  const A = [[a00, a01, a02], [a01, a11, a12], [a02, a12, a22]];
  // V columns are the accumulated eigenvectors (start = identity)
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  for (let iter = 0; iter < 40; iter++) {
    // Largest off-diagonal element
    let maxVal = 0, p = 0, q = 1;
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        if (Math.abs(A[i][j]) > maxVal) { maxVal = Math.abs(A[i][j]); p = i; q = j; }
      }
    }
    if (maxVal < 1e-12) break;

    // Rotation angle that zeroes A[p][q]
    const theta = 0.5 * Math.atan2(2 * A[p][q], A[p][p] - A[q][q]);
    const c = Math.cos(theta), s = Math.sin(theta);
    const app = A[p][p], aqq = A[q][q], apq = A[p][q];

    // Update diagonal
    A[p][p] = c * c * app + 2 * s * c * apq + s * s * aqq;
    A[q][q] = s * s * app - 2 * s * c * apq + c * c * aqq;
    A[p][q] = A[q][p] = 0;

    // Update off-diagonal row/col r (r ≠ p, q)
    for (let r = 0; r < 3; r++) {
      if (r === p || r === q) continue;
      const arp = A[r][p], arq = A[r][q];
      A[r][p] = A[p][r] = c * arp + s * arq;
      A[r][q] = A[q][r] = -s * arp + c * arq;
    }

    // Accumulate rotation in V (V = V * G)
    for (let i = 0; i < 3; i++) {
      const vip = V[i][p], viq = V[i][q];
      V[i][p] = c * vip + s * viq;
      V[i][q] = -s * vip + c * viq;
    }
  }

  const pairs = [0, 1, 2].map((i) => ({
    val: A[i][i],
    vec: [V[0][i], V[1][i], V[2][i]],
  }));
  pairs.sort((a, b) => a.val - b.val);
  return pairs;
}

// Splits a mesh's geometry into 2 sub-geometries using a custom classifier.
// classifyFn(avgX, avgY, avgZ) => true → 'below', false → 'above'
// Returns { below, above } — each a BufferGeometry — or null on failure.
export function splitMeshByCallback(mesh, classifyFn) {
  const sourceGeo = mesh?.geometry;
  if (!sourceGeo) return null;
  const geo = sourceGeo.clone().toNonIndexed();
  const positions = geo.getAttribute('position');
  const normals   = geo.getAttribute('normal');
  const uvs       = geo.getAttribute('uv');
  const vertexCount = positions.count;
  const quantize = v => Math.round(v * 1000);
  const keyFor = i => `${quantize(positions.getX(i))}:${quantize(positions.getY(i))}:${quantize(positions.getZ(i))}`;
  const triangles = []; const triangleBuckets = new Map();
  for (let i = 0; i < vertexCount; i += 3) {
    const ti = triangles.length; const indices = [i,i+1,i+2]; const keys = indices.map(keyFor);
    triangles.push({ indices, keys });
    for (const key of keys) { if (!triangleBuckets.has(key)) triangleBuckets.set(key,[]); triangleBuckets.get(key).push(ti); }
  }
  const adjacency = triangles.map(() => new Set());
  triangles.forEach((tri, ti) => { for (const key of tri.keys) for (const nb of triangleBuckets.get(key)||[]) { if (nb!==ti) adjacency[ti].add(nb); } });
  const visited = new Array(triangles.length).fill(false); const components = [];
  for (let i = 0; i < triangles.length; i++) {
    if (visited[i]) continue;
    const stack=[i]; const comp=[]; visited[i]=true;
    while (stack.length) { const cur=stack.pop(); comp.push(triangles[cur].indices); for (const nb of adjacency[cur]) { if (!visited[nb]) { visited[nb]=true; stack.push(nb); } } }
    components.push(comp);
  }
  const groups = { below: [], above: [] };
  for (const comp of components) {
    let sx=0,sy=0,sz=0,n=0;
    for (const tri of comp) for (const vi of tri) { sx+=positions.getX(vi); sy+=positions.getY(vi); sz+=positions.getZ(vi); n++; }
    groups[classifyFn(sx/n, sy/n, sz/n) ? 'below' : 'above'].push(...comp);
  }
  const buildGeo = (triList) => {
    const pos=[],nor=[],uv=[];
    for (const tri of triList) for (const vi of tri) { pos.push(positions.getX(vi),positions.getY(vi),positions.getZ(vi)); if(normals)nor.push(normals.getX(vi),normals.getY(vi),normals.getZ(vi)); if(uvs)uv.push(uvs.getX(vi),uvs.getY(vi)); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    if(nor.length)g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3)); else g.computeVertexNormals();
    if(uv.length)g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); return g;
  };
  geo.dispose();
  return { below: buildGeo(groups.below), above: buildGeo(groups.above) };
}

// Splits a mesh's geometry into 2 sub-geometries based on connected-island centroid along an axis.
// axis: 'x'|'y'|'z'. threshold: centroid value that divides "below" from "above".
// Returns { below, above } — each a BufferGeometry — or null on failure.
export function splitMeshTwoWay(mesh, axis, threshold) {
  const sourceGeo = mesh?.geometry;
  if (!sourceGeo) return null;

  const geo = sourceGeo.clone().toNonIndexed();
  const positions = geo.getAttribute('position');
  const normals   = geo.getAttribute('normal');
  const uvs       = geo.getAttribute('uv');
  const vertexCount = positions.count;

  const getC = axis === 'x' ? i => positions.getX(i)
             : axis === 'y' ? i => positions.getY(i)
             :                i => positions.getZ(i);

  const quantize = v => Math.round(v * 1000);
  const keyFor = i => `${quantize(positions.getX(i))}:${quantize(positions.getY(i))}:${quantize(positions.getZ(i))}`;

  const triangles = [];
  const triangleBuckets = new Map();
  for (let i = 0; i < vertexCount; i += 3) {
    const ti = triangles.length;
    const indices = [i, i + 1, i + 2];
    const keys = indices.map(keyFor);
    triangles.push({ indices, keys });
    for (const key of keys) {
      if (!triangleBuckets.has(key)) triangleBuckets.set(key, []);
      triangleBuckets.get(key).push(ti);
    }
  }

  const adjacency = triangles.map(() => new Set());
  triangles.forEach((tri, ti) => {
    for (const key of tri.keys) {
      for (const nb of triangleBuckets.get(key) || []) {
        if (nb !== ti) adjacency[ti].add(nb);
      }
    }
  });

  const visited = new Array(triangles.length).fill(false);
  const components = [];
  for (let i = 0; i < triangles.length; i++) {
    if (visited[i]) continue;
    const stack = [i]; const comp = []; visited[i] = true;
    while (stack.length) {
      const cur = stack.pop(); comp.push(triangles[cur].indices);
      for (const nb of adjacency[cur]) { if (!visited[nb]) { visited[nb] = true; stack.push(nb); } }
    }
    components.push(comp);
  }

  const groups = { below: [], above: [] };
  for (const comp of components) {
    let sum = 0, count = 0;
    for (const tri of comp) for (const vi of tri) { sum += getC(vi); count++; }
    const avg = sum / count;
    groups[avg < threshold ? 'below' : 'above'].push(...comp);
  }

  const buildGeo = (triList) => {
    const pos = [], nor = [], uv = [];
    for (const tri of triList) {
      for (const vi of tri) {
        pos.push(positions.getX(vi), positions.getY(vi), positions.getZ(vi));
        if (normals) nor.push(normals.getX(vi), normals.getY(vi), normals.getZ(vi));
        if (uvs)     uv.push(uvs.getX(vi), uvs.getY(vi));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (nor.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    else g.computeVertexNormals();
    if (uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  };

  geo.dispose();
  return { below: buildGeo(groups.below), above: buildGeo(groups.above) };
}

// Splits a mesh's geometry into 3 sub-geometries based on connected-island centroid X.
// leftMax / rightMin: X thresholds in mesh LOCAL space.
// Returns { L, axle, R } — each a BufferGeometry — or null on failure.
// The original mesh is NOT modified. Caller is responsible for creating Meshes and hiding original.
export function splitMeshByIslandX(mesh, { leftMax, rightMin }) {
  const sourceGeo = mesh?.geometry;
  if (!sourceGeo) return null;

  const geo = sourceGeo.clone().toNonIndexed();
  const positions = geo.getAttribute('position');
  const normals   = geo.getAttribute('normal');
  const uvs       = geo.getAttribute('uv');
  const vertexCount = positions.count;

  const quantize = v => Math.round(v * 1000);
  const keyFor = i => `${quantize(positions.getX(i))}:${quantize(positions.getY(i))}:${quantize(positions.getZ(i))}`;

  const triangles = [];
  const triangleBuckets = new Map();
  for (let i = 0; i < vertexCount; i += 3) {
    const ti = triangles.length;
    const indices = [i, i + 1, i + 2];
    const keys = indices.map(keyFor);
    triangles.push({ indices, keys });
    for (const key of keys) {
      if (!triangleBuckets.has(key)) triangleBuckets.set(key, []);
      triangleBuckets.get(key).push(ti);
    }
  }

  const adjacency = triangles.map(() => new Set());
  triangles.forEach((tri, ti) => {
    for (const key of tri.keys) {
      for (const nb of triangleBuckets.get(key) || []) {
        if (nb !== ti) adjacency[ti].add(nb);
      }
    }
  });

  const visited = new Array(triangles.length).fill(false);
  const components = [];
  for (let i = 0; i < triangles.length; i++) {
    if (visited[i]) continue;
    const stack = [i]; const comp = []; visited[i] = true;
    while (stack.length) {
      const cur = stack.pop(); comp.push(triangles[cur].indices);
      for (const nb of adjacency[cur]) { if (!visited[nb]) { visited[nb] = true; stack.push(nb); } }
    }
    components.push(comp);
  }

  const groups = { L: [], axle: [], R: [] };
  for (const comp of components) {
    let sumX = 0, count = 0;
    for (const tri of comp) for (const vi of tri) { sumX += positions.getX(vi); count++; }
    const cx = sumX / count;
    const key = cx < leftMax ? 'L' : cx > rightMin ? 'R' : 'axle';
    groups[key].push(...comp);
  }

  const buildGeo = (triList) => {
    const pos = [], nor = [], uv = [];
    for (const tri of triList) {
      for (const vi of tri) {
        pos.push(positions.getX(vi), positions.getY(vi), positions.getZ(vi));
        if (normals) nor.push(normals.getX(vi), normals.getY(vi), normals.getZ(vi));
        if (uvs)     uv.push(uvs.getX(vi), uvs.getY(vi));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (nor.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    else g.computeVertexNormals();
    if (uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  };

  geo.dispose();
  return { L: buildGeo(groups.L), axle: buildGeo(groups.axle), R: buildGeo(groups.R) };
}

// scoreMode: 'heuristic'   = existing ChatGPT scoring (finds strut/scissors)
//            'circular'    = pure circularity, single best component
//            'allCircular' = all disc-like components combined (full wheel: tread + rim/hub)
// rimTone: optional second color for rim/spoke components (proximity-based, non-disc shapes)
export function createRearWheelHeuristicOverlay(target, tone, scoreMode = 'heuristic', rimTone = null, minSize = 0.5) {
  const sourceGeometry = target?.geometry;
  const positionAttr = sourceGeometry?.getAttribute("position");

  if (!target?.parent || !sourceGeometry || !positionAttr) {
    return null;
  }

  const geometry = sourceGeometry.clone().toNonIndexed();
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const uvs = geometry.getAttribute("uv");
  const vertexCount = positions.count;
  const localPoints = [];
  const triangles = [];
  const triangleBuckets = new Map();
  const quantize = (value) => Math.round(value * 1000);
  const keyFor = (vector) =>
    `${quantize(vector.x)}:${quantize(vector.y)}:${quantize(vector.z)}`;

  for (let i = 0; i < vertexCount; i += 1) {
    const localPoint = new THREE.Vector3(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i)
    );

    localPoints.push(localPoint);
  }

  for (let i = 0; i < vertexCount; i += 3) {
    const triangleIndex = triangles.length;
    const indices = [i, i + 1, i + 2];
    const keys = indices.map((index) => keyFor(localPoints[index]));

    triangles.push({ indices, keys });

    for (const key of keys) {
      if (!triangleBuckets.has(key)) {
        triangleBuckets.set(key, []);
      }

      triangleBuckets.get(key).push(triangleIndex);
    }
  }

  const adjacency = triangles.map(() => new Set());

  triangles.forEach((triangle, triangleIndex) => {
    for (const key of triangle.keys) {
      for (const neighbor of triangleBuckets.get(key) || []) {
        if (neighbor !== triangleIndex) {
          adjacency[triangleIndex].add(neighbor);
        }
      }
    }
  });

  const visited = new Array(triangles.length).fill(false);
  const components = [];

  for (let i = 0; i < triangles.length; i += 1) {
    if (visited[i]) {
      continue;
    }

    const stack = [i];
    const componentTriangles = [];
    const points = [];
    visited[i] = true;

    while (stack.length) {
      const current = stack.pop();
      const triangle = triangles[current];
      componentTriangles.push(triangle.indices);

      for (const index of triangle.indices) {
        points.push(localPoints[index].clone());
      }

      for (const neighbor of adjacency[current]) {
        if (!visited[neighbor]) {
          visited[neighbor] = true;
          stack.push(neighbor);
        }
      }
    }

    const bounds = new THREE.Box3().setFromPoints(points);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const circleRatio = Math.min(size.y, size.z) / Math.max(size.y, size.z, 0.001);
    const widthPenalty = size.x / Math.max(Math.max(size.y, size.z), 0.001);

    // Axis-agnostic disc score: sort dims, check middle≈large (round) and small is thin
    const [d0, d1, d2] = [size.x, size.y, size.z].sort((a, b) => a - b);
    const agnosticCirc  = d1 / (d2 || 0.001); // how circular (middle vs largest)
    const agnosticWidth = d0 / (d2 || 0.001); // how disc-like (smallest vs largest)

    const score = scoreMode === 'circular'
      ? agnosticCirc * 5 - agnosticWidth * 3
      : circleRatio * 3.1 + size.y * size.z - widthPenalty * 0.8 - center.y * 0.08;

    components.push({
      triangles: componentTriangles,
      bounds,
      size,
      center,
      score,
    });
  }

  // Minimum size filter: second-largest axis must have some extent (axis-agnostic)
  const sizedComponents = components.filter((c) => {
    const dims = [c.size.x, c.size.y, c.size.z].sort((a, b) => b - a);
    return dims[1] > 0.08;
  });

  const selectedPositions = [];
  const selectedNormals = [];
  const selectedUvs = [];

  if (scoreMode === 'allCircular') {
    // All disc-shaped components, sorted by bounding-box volume descending.
    const allDiscComps = sizedComponents
      .filter((c) => {
        const [d0, d1, d2] = [c.size.x, c.size.y, c.size.z].sort((a, b) => a - b);
        return d1 / (d2 || 0.001) > 0.60 && d0 / (d2 || 0.001) < 0.68 && d2 > minSize && d1 > minSize * 0.8;
      })
      .sort((a, b) => (b.size.x * b.size.y * b.size.z) - (a.size.x * a.size.y * a.size.z));

    if (!allDiscComps.length) {
      geometry.dispose();
      return null;
    }

    // Split by d0 (thinnest bbox dim = wheel-axis width):
    //   tread cylinder is always WIDER (larger d0) than rim face disk (thinner d0).
    //   threshold = 50% of the maximum d0 among all disc components.
    const getD0 = (c) => Math.min(c.size.x, c.size.y, c.size.z);
    const maxD0 = Math.max(...allDiscComps.map(getD0));
    const treadComps   = allDiscComps.filter((c) => getD0(c) >= maxD0 * 0.50);
    const discRimComps = allDiscComps.filter((c) => getD0(c) <  maxD0 * 0.50);


    // Pre-collect disc rim vertices (before dispose)
    const discRimRaw = discRimComps.map((comp) => {
      const verts = [], norms = [], uvData = [];
      for (const triangle of comp.triangles) {
        for (const index of triangle) {
          verts.push(positions.getX(index), positions.getY(index), positions.getZ(index));
          if (normals) norms.push(normals.getX(index), normals.getY(index), normals.getZ(index));
          if (uvs) uvData.push(uvs.getX(index), uvs.getY(index));
        }
      }
      return { verts, norms, uvData };
    });

    // Collect tread vertex data
    for (const comp of treadComps) {
      for (const triangle of comp.triangles) {
        for (const index of triangle) {
          selectedPositions.push(positions.getX(index), positions.getY(index), positions.getZ(index));
          if (normals) selectedNormals.push(normals.getX(index), normals.getY(index), normals.getZ(index));
          if (uvs) selectedUvs.push(uvs.getX(index), uvs.getY(index));
        }
      }
    }

    geometry.dispose();
    if (!selectedPositions.length) return null;

    const nv = selectedPositions.length / 3;

    // Step 1: centroid of tread vertices.
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < selectedPositions.length; i += 3) {
      cx += selectedPositions[i]; cy += selectedPositions[i + 1]; cz += selectedPositions[i + 2];
    }
    cx /= nv; cy /= nv; cz /= nv;

    // Step 2: covariance matrix.
    let c00 = 0, c01 = 0, c02 = 0, c11 = 0, c12 = 0, c22 = 0;
    for (let i = 0; i < selectedPositions.length; i += 3) {
      const dx = selectedPositions[i] - cx, dy = selectedPositions[i + 1] - cy, dz = selectedPositions[i + 2] - cz;
      c00 += dx*dx; c01 += dx*dy; c02 += dx*dz; c11 += dy*dy; c12 += dy*dz; c22 += dz*dz;
    }
    c00/=nv; c01/=nv; c02/=nv; c11/=nv; c12/=nv; c22/=nv;

    // Step 3: PCA — smallest eigenvector = wheel axle.
    const eigs = jacobiEigen3x3(c00, c01, c02, c11, c12, c22);
    const axleLocal = new THREE.Vector3(...eigs[0].vec).normalize();

    // Step 4: centre tread geometry.
    for (let i = 0; i < selectedPositions.length; i += 3) {
      selectedPositions[i] -= cx; selectedPositions[i+1] -= cy; selectedPositions[i+2] -= cz;
    }

    const { u, v } = buildPlaneBasis(axleLocal);
    let outerRadius = 0;
    for (let i = 0; i < selectedPositions.length; i += 3) {
      const vx = selectedPositions[i];
      const vy = selectedPositions[i + 1];
      const vz = selectedPositions[i + 2];
      const radial = Math.hypot(
        vx * u.x + vy * u.y + vz * u.z,
        vx * v.x + vy * v.y + vz * v.z
      );
      outerRadius = Math.max(outerRadius, radial);
    }

    const tireGeo = new THREE.BufferGeometry();
    tireGeo.setAttribute('position', new THREE.Float32BufferAttribute(selectedPositions, 3));
    if (selectedUvs.length) tireGeo.setAttribute('uv', new THREE.Float32BufferAttribute(selectedUvs, 2));
    // Always recompute normals from the extracted subset — do NOT reuse originals.
    // Original normals at cut-edge vertices were averaged over the full mesh
    // (including adjacent strut geometry), so they point in wrong directions at
    // the open boundary and cause bright/white artifacts under lighting.
    tireGeo.computeVertexNormals();

    const tireMaterial = cloneWheelOverlayMaterial(target.material, tone);
    const tireMesh = new THREE.Mesh(
      tireGeo,
      tireMaterial
    );
    tireMesh.name = `${target.name}_tireOverlay`;

    const pivot = new THREE.Group();
    pivot.name = `${target.name}_tirePivot`;
    pivot.position.set(cx, cy, cz);
    pivot.add(tireMesh);

    const wheelPlane = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      axleLocal
    );

    // Step 6: rim overlay = inner disc parts only (hub caps, rim rings).
    // Non-disc components (spokes, torque links) are excluded — they're
    // geometrically indistinguishable from structural sticks/palitos.
    if (rimTone) {
      const rimPositions = [], rimNormals = [], rimUvs = [];

      for (const { verts, norms, uvData } of discRimRaw) {
        for (let i = 0; i < verts.length; i += 3)
          rimPositions.push(verts[i] - cx, verts[i+1] - cy, verts[i+2] - cz);
        for (const n of norms) rimNormals.push(n);
        for (const uv of uvData) rimUvs.push(uv);
      }

      if (rimPositions.length) {
        const rimGeo = new THREE.BufferGeometry();
        rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(rimPositions, 3));
        if (rimUvs.length) rimGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rimUvs, 2));
        rimGeo.computeVertexNormals(); // same reason as tireGeo — recompute, don't reuse originals
        const rimMaterial = cloneWheelOverlayMaterial(target.material, rimTone);
        const rimMesh = new THREE.Mesh(rimGeo, rimMaterial);
        rimMesh.name = `${target.name}_rimOverlay`;
        pivot.add(rimMesh);

        const cueMaterial = new THREE.MeshBasicMaterial({
          color: "#1c1c1c",
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const cueMesh = new THREE.Mesh(
          new THREE.RingGeometry(
            Math.max(outerRadius * 0.55, 0.01),
            Math.max(outerRadius * 0.82, 0.02),
            24,
            1,
            0.24,
            0.4
          ),
          cueMaterial
        );
        cueMesh.quaternion.copy(wheelPlane);
        cueMesh.position.addScaledVector(axleLocal, 0.002);
        cueMesh.name = `${target.name}_motionCue`;
        pivot.add(cueMesh);
      }
    }

    return { pivot, axleLocal };
  } else {
    const wheelComponent = sizedComponents.sort((a, b) => b.score - a.score)[0];

    if (!wheelComponent) {
      geometry.dispose();
      return null;
    }

    const wheelBounds = wheelComponent.bounds;
    const wheelSize   = wheelComponent.size;
    const wheelCenter = wheelComponent.center;

    if (scoreMode === 'circular') {
      // All triangles of the single best disc component, no axis-biased crop
      for (const triangle of wheelComponent.triangles) {
        for (const index of triangle) {
          selectedPositions.push(
            positions.getX(index),
            positions.getY(index),
            positions.getZ(index)
          );
          if (uvs) {
            selectedUvs.push(uvs.getX(index), uvs.getY(index));
          }
          if (normals) {
            selectedNormals.push(
              normals.getX(index),
              normals.getY(index),
              normals.getZ(index)
            );
          }
        }
      }
    } else {
      // Original heuristic: crop to ring using X as axle axis
      const radiusY      = Math.max(wheelSize.y * 0.56, 0.001);
      const radiusZ      = Math.max(wheelSize.z * 0.56, 0.001);
      const radiusX      = Math.max(wheelSize.x * 0.8, 0.015);
      const lowerRecovery = wheelSize.y * 0.2;

      for (const triangle of wheelComponent.triangles) {
        const centroid = new THREE.Vector3();
        for (const index of triangle) centroid.add(localPoints[index]);
        centroid.multiplyScalar(1 / 3);

        const dy = (centroid.y - wheelCenter.y) / radiusY;
        const dz = (centroid.z - wheelCenter.z) / radiusZ;
        const dx = Math.abs(centroid.x - wheelCenter.x) / radiusX;
        if (dy * dy + dz * dz > 1.2) continue;
        if (dy * dy + dz * dz < 0.08) continue;
        if (dx > 1.25) continue;
        if (centroid.y < wheelBounds.min.y - lowerRecovery) continue;

        for (const index of triangle) {
          selectedPositions.push(
            positions.getX(index),
            positions.getY(index),
            positions.getZ(index)
          );
          if (uvs) {
            selectedUvs.push(uvs.getX(index), uvs.getY(index));
          }
          if (normals) {
            selectedNormals.push(
              normals.getX(index),
              normals.getY(index),
              normals.getZ(index)
            );
          }
        }
      }
    }
  }

  geometry.dispose();

  if (!selectedPositions.length) {
    return null;
  }

  const overlayGeometry = new THREE.BufferGeometry();
  overlayGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(selectedPositions, 3)
  );
  if (selectedUvs.length) {
    overlayGeometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(selectedUvs, 2)
    );
  }

  if (selectedNormals.length) {
    overlayGeometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(selectedNormals, 3)
    );
  } else {
    overlayGeometry.computeVertexNormals();
  }

  const overlay = new THREE.Mesh(
    overlayGeometry,
    cloneWheelOverlayMaterial(target.material, tone)
  );

  overlay.name = `${target.name}_${scoreMode === 'circular' ? 'tireOverlay' : 'rearWheelHeuristic'}`;
  return overlay;
}


export default function F35({
  url = "/f-35a.glb",
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  debug = false,
  highlightRearWheelCandidates = false,
  highlightWheelAssemblies = false,
  highlightRearWheelHeuristic = false,
  playEmbeddedAnimation = true,
  embeddedAnimationTime = null,
  gearDown = undefined,
  noseGearSteer = 0,
  noseGearSteerRef = null,
  taxiSpeed = 0,
  taxiSpeedRef = null,
}) {
  const groupRef = useRef(null);
  const prevGearDownRef = useRef(null);
  const gearSnapDoneRef = useRef(false);
  const [gearReady, setGearReady] = useState(typeof gearDown !== "boolean");
  const noseGearRef = useRef(null);
  const noseGearBaseRotationRef = useRef(0);
  const wheelSpinRef        = useRef([]);
  // Smoothed ground speed fed to wheel spin — simulates rotational inertia.
  // Without this, the wheel snaps from 0 to full omega on the first frame
  // the speed crosses zero, producing the start/stop stutter at low speed.
  const wheelSmoothSpeedRef = useRef(0);

  const { scene, animations } = useGLTF(url);
  const clonedScene = useMemo(() => cloneSkinnedScene(scene), [scene]);
  const { actions } = useAnimations(animations, groupRef);
  const usesControlledGear = typeof gearDown === "boolean";

  useEffect(() => {
    if (!usesControlledGear) {
      setGearReady(true);
      return;
    }

    gearSnapDoneRef.current = false;
    prevGearDownRef.current = null;
    setGearReady(false);
  }, [actions, usesControlledGear]);

  useEffect(() => {
    const noseGearMesh = clonedScene.getObjectByName("Object_47") || null;
    const noseGearPivot = noseGearMesh ? createCenteredPivot(noseGearMesh) : null;

    noseGearRef.current = noseGearPivot;
    noseGearBaseRotationRef.current = noseGearPivot ? noseGearPivot.rotation.z : 0;

    if (debug) {
      console.log("F35 debug:", {
        nozzleNode: ENGINE_NOZZLE_NODE_NAME,
        animationNames: animations.map((animation) => animation.name),
        noseGearNode: noseGearPivot?.name || null,
      });
    }
  }, [animations, clonedScene, debug]);

  useEffect(() => {
    if (!highlightRearWheelCandidates) {
      return;
    }

    const candidates = ["Object_51", "Object_103"]
      .map((name) => clonedScene.getObjectByName(name))
      .filter(Boolean);

    const palette = [
      { color: "#ff3b30", emissive: "#5c120d" },
      { color: "#00c2ff", emissive: "#0d385c" },
    ];

    candidates.forEach((candidate, index) => {
      const tone = palette[index % palette.length];

      candidate.traverse((child) => {
        if ((!child.isMesh && !child.isSkinnedMesh) || !child.material) {
          return;
        }

        const material = new THREE.MeshStandardMaterial({
          color: tone.color,
          emissive: tone.emissive,
          emissiveIntensity: 0.65,
          roughness: 0.42,
          metalness: 0.08,
          side: THREE.DoubleSide,
        });

        if (child.isSkinnedMesh) {
          material.skinning = true;
        }

        child.material = material;
      });
    });
  }, [clonedScene, highlightRearWheelCandidates]);

  useEffect(() => {
    if (!highlightWheelAssemblies) {
      return;
    }

    const groups = [
      {
        names: ["Object_47", "Object_25", "Object_29", "Object_41"],
        tones: [
          { color: "#ff5a36", emissive: "#5c1f12" },
          { color: "#ffbf47", emissive: "#5c4210" },
          { color: "#ff7aa2", emissive: "#5c1a33" },
          { color: "#ffd6a5", emissive: "#5c4127" },
        ],
      },
      {
        names: ["Object_51"],
        tones: [
          { color: "#00b7ff", emissive: "#103a5c" },
          { color: "#7dd3fc", emissive: "#164e63" },
          { color: "#22d3ee", emissive: "#0f3f49" },
          { color: "#67e8f9", emissive: "#155e75" },
        ],
      },
      {
        names: ["Object_103"],
        tones: [
          { color: "#a855f7", emissive: "#3d165c" },
          { color: "#d8b4fe", emissive: "#4c1d95" },
          { color: "#c084fc", emissive: "#581c87" },
          { color: "#e879f9", emissive: "#701a75" },
        ],
      },
    ];

    for (const group of groups) {
      const targets = group.names
        .map((name) => clonedScene.getObjectByName(name))
        .filter(Boolean);

      targets.forEach((target, index) => {
        const tone = group.tones[index % group.tones.length];

        if (target.name === "Object_51" || target.name === "Object_103") {
          const overlays = createComponentDebugOverlays(target, group.tones);

          for (const overlay of overlays) {
            target.add(overlay);
          }

          return;
        }

        target.traverse((child) => {
          if ((!child.isMesh && !child.isSkinnedMesh) || !child.material) {
            return;
          }

          const material = new THREE.MeshStandardMaterial({
            color: tone.color,
            emissive: tone.emissive,
            emissiveIntensity: 0.7,
            roughness: 0.45,
            metalness: 0.08,
            side: THREE.DoubleSide,
          });

          if (child.isSkinnedMesh) {
            material.skinning = true;
          }

          child.material = material;
        });
      });
    }
  }, [clonedScene, highlightWheelAssemblies]);

  useEffect(() => {
    if (!highlightRearWheelHeuristic) {
      return;
    }

    // ── Full wheel overlay + spin pivot (tread + rim/hub combined) ───────────
    const tireTone = null;
    const rimTone  = {};
    const spinGroups = [];

    for (const name of ["Object_47", "Object_51", "Object_103"]) {
      const target = clonedScene.getObjectByName(name);
      if (!target) continue;

      const result = createRearWheelHeuristicOverlay(target, tireTone, 'allCircular', rimTone);
      if (!result) continue;
      target.add(result.pivot);

      // Original mesh stays visible. The overlay renders on top via polygonOffset
      // so it fully replaces the static wheel visually without z-fighting.
      result.pivot.traverse(child => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => {
            m.polygonOffset       = true;
            m.polygonOffsetFactor = -1;
            m.polygonOffsetUnits  = -1;
            m.needsUpdate         = true;
          });
        }
      });

      // Use the geometry-derived axle direction — smallest bounding-box extent
      // of the tire vertices in target's local space. This doesn't depend on
      // target.matrixWorld (which may reflect the rest pose, not gear-down pose).
      spinGroups.push({
        pivot: result.pivot,
        axis: result.axleLocal,
        angle: 0,
      });
    }

    wheelSpinRef.current = spinGroups;
  }, [clonedScene, debug, highlightRearWheelHeuristic]);

  useFrame(() => {
    if (gearSnapDoneRef.current || typeof gearDown !== "boolean" || !actions) {
      return;
    }

    const actionNames = Object.keys(actions);
    if (!actionNames.length) {
      return;
    }

    const firstAction = actions[actionNames[0]];
    if (!firstAction) {
      return;
    }

    const duration = firstAction.getClip().duration;
    if (!duration || duration <= 0) {
      return;
    }

    firstAction.setLoop(THREE.LoopOnce, 1);
    // eslint-disable-next-line react-hooks/immutability
    firstAction.clampWhenFinished = true;
    firstAction.reset();
    firstAction.timeScale = 0;
    firstAction.time = gearDown ? duration : 0;
    firstAction.play();
    firstAction.getMixer().update(0.00001);

    prevGearDownRef.current = gearDown;
    gearSnapDoneRef.current = true;
    setGearReady(true);
  }, -1);

  useEffect(() => {
    if (typeof gearDown !== "boolean" || !actions) {
      return;
    }

    if (!gearSnapDoneRef.current) {
      return;
    }

    if (prevGearDownRef.current === gearDown) {
      return;
    }

    const actionNames = Object.keys(actions);
    if (!actionNames.length) {
      return;
    }

    const firstAction = actions[actionNames[0]];
    if (!firstAction) {
      return;
    }

    prevGearDownRef.current = gearDown;

    const duration = firstAction.getClip().duration;
    if (!duration || duration <= 0) {
      return;
    }

    firstAction.setLoop(THREE.LoopOnce, 1);
    // eslint-disable-next-line react-hooks/immutability
    firstAction.clampWhenFinished = true;

    if (!gearDown) {
      firstAction.timeScale = -1;
      firstAction.time = Math.max(duration - 1.6, 0);
      firstAction.play();
    } else {
      firstAction.timeScale = 1;
      firstAction.time = 0;
      firstAction.play();
    }

    return () => {
      firstAction.stop();
    };
  }, [actions, gearDown]);

  useEffect(() => {
    if (!actions || typeof gearDown === "boolean") {
      return;
    }

    const actionNames = Object.keys(actions);
    if (!actionNames.length) {
      return;
    }

    const firstAction = actions[actionNames[0]];
    if (!firstAction) {
      return;
    }

    if (typeof embeddedAnimationTime === "number") {
      const duration = firstAction.getClip().duration;
      firstAction.reset().play();
      // eslint-disable-next-line react-hooks/immutability
      firstAction.timeScale = 0;
      firstAction.time = Math.min(embeddedAnimationTime, duration);
      firstAction.getMixer().update(0.00001);

      return () => {
        firstAction.stop();
      };
    }

    if (!playEmbeddedAnimation) {
      firstAction.stop();
      return undefined;
    }

    firstAction.reset().play();

    return () => {
      firstAction.stop();
    };
  }, [actions, embeddedAnimationTime, gearDown, playEmbeddedAnimation]);

  useFrame((_state, delta) => {
    const noseGear = noseGearRef.current;
    if (!noseGear) {
      return;
    }

    const liveNoseGearSteer =
      noseGearSteerRef && typeof noseGearSteerRef.current === "number"
        ? noseGearSteerRef.current
        : noseGearSteer;
    const steer = clamp(liveNoseGearSteer, -1, 1);
    const target = noseGearBaseRotationRef.current + THREE.MathUtils.degToRad(36 * steer);
    const smooth = 1 - Math.exp(-10 * delta);

    noseGear.rotation.z = THREE.MathUtils.lerp(noseGear.rotation.z, target, smooth);
  });

  useFrame((_state, delta) => {
    const targetSpeed =
      taxiSpeedRef && typeof taxiSpeedRef.current === "number"
        ? taxiSpeedRef.current
        : taxiSpeed;

    // ── Asymmetric wheel inertia ─────────────────────────────────────────────
    //
    //  Spin-UP   (ground contact): the runway forces the wheel to match aircraft
    //  speed almost instantly — time constant ~40 ms.  No stutter, no lag.
    //
    //  Spin-DOWN (gear retract / brake): the wheel decelerates by its own inertia
    //  — time constant ~1.5 s.  Realistic "tire chirp + coast" after liftoff.
    //
    const vTarget = Math.max(targetSpeed, 0);
    const spinning_up = vTarget >= wheelSmoothSpeedRef.current;
    const k = spinning_up ? 25 : 0.65;          // rad/s — 1/τ for each phase
    wheelSmoothSpeedRef.current = THREE.MathUtils.lerp(
      wheelSmoothSpeedRef.current,
      vTarget,
      1 - Math.exp(-k * delta),
    );

    const v = wheelSmoothSpeedRef.current;
    if (v < 0.01) return;   // below 1 cm/s — no perceptible rotation

    // ── Physical RPM formula: ω = v / r ──────────────────────────────────────
    //
    //  v  : smoothed ground speed (m/s, world units)
    //  r  : wheel radius in world units
    //       GLB main wheel ≈ 1 local unit; group scale = 0.36 → r_world = 0.36 m
    //       (matches F-35A actual main tire: 40 in diameter → 0.508 m real,
    //        rendered at ~70 % scale relative to fuselage — consistent with model)
    //
    const WHEEL_RADIUS = 0.36;   // metres (world units)
    const omega = v / WHEEL_RADIUS;

    for (const item of wheelSpinRef.current) {
      // eslint-disable-next-line react-hooks/immutability
      item.angle += omega * delta;
      // eslint-disable-next-line react-hooks/immutability
      item.pivot.quaternion.setFromAxisAngle(item.axis, item.angle);
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={gearReady}
    >
      <primitive object={clonedScene} />
    </group>
  );
}

useGLTF.preload("/F-35A.glb");
