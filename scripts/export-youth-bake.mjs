// Geometry-only export for offline lighting. No renderer, network or provider calls.
// node --import tsx scripts/export-youth-bake.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createYouthRoom } from "../src/components/youth/room-model.ts";
import { youthGeometryStamp } from "../src/components/youth/bake-contract.ts";
// tsx resolves this project's TS through CommonJS. Match its Mesh constructor
// when adapting GLTFLoader's ESM meshes (the model uses instanceof Mesh).
const { Texture, Mesh, Group } = createRequire(import.meta.url)("three");

// The only DOM resource in the model is a static clock face. The bake exports
// geometry/irradiance only; its real canvas is still drawn by the browser.
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {} }) }) };
const loader = new GLTFLoader();
async function model(file) {
  const bytes = await fs.readFile(path.resolve("public/youth/models", file));
  const scene = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")).scene;
  scene.updateMatrixWorld(true);
  const group = new Group();
  scene.traverse(object => {
    if (object.isMesh) {
      const mesh = new Mesh(object.geometry, object.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(object.matrixWorld);
      group.add(mesh);
    }
  });
  return group;
}
const built = createYouthRoom(new Texture(), await model("school-desk.glb"), await model("school-chair.glb"), undefined, {
  monstera: await model("monstera-plant.glb"), pothos: await model("pothos.glb"), books: await model("books.glb"),
});
const meshes = built.room.children.map((mesh, index) => ({
  index, stamp: youthGeometryStamp(mesh.geometry), casts: mesh.castShadow,
  positions: Array.from(mesh.geometry.getAttribute("position").array),
  normals: Array.from(mesh.geometry.getAttribute("normal").array),
}));
const out = path.resolve("output/youth-bake");
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, "source.json"), JSON.stringify({ meshes }));
console.log(JSON.stringify({ meshes: meshes.length, triangles: meshes.reduce((sum, m) => sum + m.positions.length / 9, 0), output: path.join(out, "source.json") }));
built.dispose();
