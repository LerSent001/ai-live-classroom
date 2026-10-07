import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { campusMaterials } from "@/components/youth/campus-material";
import { classroomWindowGlass } from "@/components/youth/window-glass";

type Asset = { file: string; source: string; triangles: number; trianglesBefore: number; bytes: number };
const directory = new URL("../../public/youth/models/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8")) as Asset[];

test("CC0 classroom furniture stays small and has no PBR downloads, skins or animation", () => {
  assert.equal(manifest.length, 2);
  let totalBytes = 0, setTriangles = 0;
  for (const asset of manifest) {
    const bytes = readFileSync(new URL(asset.file, directory));
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert.equal(json.images?.length ?? 0, 0);
    assert.equal(json.textures?.length ?? 0, 0);
    assert.equal(json.skins?.length ?? 0, 0);
    assert.equal(json.animations?.length ?? 0, 0);
    assert.ok(json.nodes.some((node: { extras?: { license?: string; author?: string } }) => node.extras?.license === "CC0-1.0" && node.extras.author === "Ethan Place"));
    let triangles = 0;
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      assert.ok(primitive.attributes.COLOR_0 !== undefined, "Offline campus palette is retained");
      assert.equal(primitive.attributes.TEXCOORD_0, undefined);
      triangles += json.accessors[primitive.indices].count / 3;
    }
    assert.equal(triangles, asset.triangles);
    assert.ok(triangles < 3000);
    assert.ok(triangles < asset.trianglesBefore);
    assert.equal(bytes.length, asset.bytes);
    totalBytes += bytes.length; setTriangles += triangles;
  }
  assert.ok(totalBytes < 180000);
  assert.ok(setTriangles * 6 < 30000);
});

test("surface atlas adds wall/wood detail without exceeding the former chalkboard texture budget", () => {
  const root = new URL("../../public/youth/", import.meta.url);
  const surfaces = JSON.parse(readFileSync(new URL("surfaces.json", root), "utf8"));
  const image = readFileSync(new URL("surfaces.webp", root));
  assert.equal(image.subarray(0, 4).toString(), "RIFF");
  assert.equal(image.subarray(8, 12).toString(), "WEBP");
  assert.equal(image.length, surfaces.bytes);
  assert.ok(image.length < 90790, "Below the old blackboard's network bytes");
  assert.equal(surfaces.width * surfaces.height, surfaces.baseTexels);
  assert.ok(surfaces.baseTexels < surfaces.previousBaseTexels);
  for (const region of Object.values(surfaces.regions) as number[][]) {
    const [x, y, width, height] = region;
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
    assert.ok(x + width <= surfaces.width && y + height <= surfaces.height);
  }
});

test("environment materials are continuous, opaque and have no toon ramp / refraction", () => {
  const palette = campusMaterials(), wall = palette.material("#ffffff"), glass = palette.glass("#aabbcc");
  assert.equal(wall.type, "MeshLambertMaterial");
  assert.equal(glass.type, "MeshPhongMaterial");
  assert.equal(wall.envMap, null);
  assert.equal(glass.envMap, null);
  assert.equal(glass.transparent, false);
  assert.equal(glass.opacity, 1);
  assert.ok(!("gradientMap" in wall));
  wall.dispose(); glass.dispose();
});

test("authored CC0 plants and books retain vertex colours without runtime texture sets", () => {
  const props = JSON.parse(readFileSync(new URL("props-manifest.json", directory), "utf8")) as (Asset & { license: string })[];
  assert.equal(props.length, 3);
  assert.ok(props.reduce((total, asset) => total + asset.bytes, 0) < 210000);
  for (const asset of props) {
    assert.equal(asset.license, "CC0-1.0");
    assert.ok(asset.source.startsWith("https://poly.pizza/m/"));
    const bytes = readFileSync(new URL(asset.file, directory));
    assert.equal(bytes.length, asset.bytes);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert.equal(json.images?.length ?? 0, 0);
    assert.equal(json.textures?.length ?? 0, 0);
    assert.equal(json.animations?.length ?? 0, 0);
    assert.equal(json.skins?.length ?? 0, 0);
    let count = 0;
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      assert.ok(primitive.attributes.COLOR_0 !== undefined);
      count += json.accessors[primitive.indices].count / 3;
    }
    assert.equal(count, asset.triangles);
    assert.ok(count < 3000);
  }
});

test("window glass uses one transparent pass and analytic reflection, not transmission", () => {
  const glass = classroomWindowGlass();
  assert.equal(glass.transparent, true);
  assert.equal(glass.depthWrite, false);
  assert.equal(glass.forceSinglePass, true);
  assert.equal(glass.uniforms.uOpacity.value, .14);
  assert.ok(!glass.fragmentShader.includes("sampler2D"));
  assert.ok(!glass.fragmentShader.includes("transmission"));
  assert.ok(glass.fragmentShader.includes("colorspace_fragment"));
  assert.ok(!("time" in glass.uniforms));
  glass.dispose();
});
