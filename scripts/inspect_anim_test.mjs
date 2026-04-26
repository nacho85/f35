import { NodeIO } from "@gltf-transform/core";

const io = new NodeIO();
const doc = await io.read("public/mig-29-iran-anim-test.glb");

const root = doc.getRoot();

console.log("\n=== NODOS MESH ===");
root.listNodes().forEach(n => {
  const mesh = n.getMesh();
  if (mesh) console.log(" ", n.getName(), "→ mesh:", mesh.getName());
});

console.log("\n=== ANIMACIONES ===");
root.listAnimations().forEach(anim => {
  const channels = anim.listChannels();
  const samplers = anim.listSamplers();
  console.log(`\nAnim: "${anim.getName()}"  channels=${channels.length}  samplers=${samplers.length}`);
  channels.forEach(ch => {
    const target = ch.getTargetNode();
    const path   = ch.getTargetPath();
    const s      = ch.getSampler();
    const input  = s?.getInput();
    const times  = input ? Array.from(input.getArray()) : [];
    console.log(`  node="${target?.getName()}"  path=${path}  frames=${times.length}  t=[${times[0]?.toFixed(2)}..${times[times.length-1]?.toFixed(2)}]`);
  });
});
