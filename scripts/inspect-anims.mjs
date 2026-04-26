// Parsea el GLB y muestra qué meshes controla cada animación
import { readFileSync } from "fs";

const glb      = readFileSync("public/F-35C.glb");
const jsonLen  = glb.readUInt32LE(12);
const gltf     = JSON.parse(glb.slice(20, 20 + jsonLen).toString("utf8"));

const nodes  = gltf.nodes  ?? [];
const meshes = gltf.meshes ?? [];
const skins  = gltf.skins  ?? [];

// Mapea nodeIndex → nombre
const nodeName = (i) => nodes[i]?.name ?? `node#${i}`;

// Para cada nodo que sea un skin, recoge los meshes que lo referencian
// Un mesh usa un skin si el nodo que lo contiene tiene .skin
const skinToMeshNames = {};
nodes.forEach((n) => {
  if (n.skin !== undefined && n.mesh !== undefined) {
    const meshName = meshes[n.mesh]?.name ?? `mesh#${n.mesh}`;
    (skinToMeshNames[n.skin] ??= []).push(meshName);
  }
});

// Para cada animación, recoge los nodos únicos animados y busca
// a qué skin/armature pertenece (los bones de ese skin)
gltf.animations?.forEach((anim) => {
  const animatedNodes = new Set((anim.channels ?? []).map(ch => ch.target?.node));

  // ¿Estos nodos son joints de algún skin?
  const relatedSkins = new Set();
  skins.forEach((skin, si) => {
    const joints = new Set(skin.joints ?? []);
    for (const n of animatedNodes) {
      if (joints.has(n)) { relatedSkins.add(si); break; }
    }
  });

  // Meshes que usan esos skins
  const meshNames = [...relatedSkins].flatMap(si => skinToMeshNames[si] ?? [`skin#${si}`]);

  // También nodos directamente animados que son meshes
  const directMeshes = [...animatedNodes]
    .filter(n => nodes[n]?.mesh !== undefined)
    .map(n => meshes[nodes[n].mesh]?.name ?? `mesh#${nodes[n].mesh}`);

  const allMeshes = [...new Set([...meshNames, ...directMeshes])];

  const nodeNames = [...animatedNodes].map(nodeName).join(", ");
  const meshStr   = allMeshes.length ? allMeshes.join(", ") : "(sin mesh directo)";
  console.log(`[${anim.name}]\n  bones/nodes: ${nodeNames}\n  meshes:      ${meshStr}\n`);
});
