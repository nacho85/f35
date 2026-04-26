import { NodeIO } from "@gltf-transform/core";
import { writeFileSync } from "fs";

const io = new NodeIO();
const doc = await io.read("public/mig-29-clean.glb");
doc.getRoot().listTextures().forEach((t, i) => {
  const name = `public/tex_${i}_${t.getName()}.png`;
  writeFileSync(name, t.getImage());
  console.log("saved", name);
});
