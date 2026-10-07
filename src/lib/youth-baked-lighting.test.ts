import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BoxGeometry, Group, Mesh, Texture } from "three";
import { campusMaterials } from "@/components/youth/campus-material";
import { installYouthBake } from "@/components/youth/baked-lighting";
import { youthGeometryStamp } from "@/components/youth/bake-contract";

test("offline lighting ships complete, bounded UV and image assets", () => {
  const root = new URL("../../public/youth/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("lighting.json", root), "utf8"));
  const uv = readFileSync(new URL("lighting-uv.bin", root));
  const image = readFileSync(new URL("lighting.webp", root));
  assert.equal(createHash("sha256").update(uv).digest("hex"), manifest.uvSha256);
  assert.equal(createHash("sha256").update(image).digest("hex"), manifest.lightmapSha256);
  assert.equal(uv.byteLength, manifest.meshes.reduce((total: number, mesh: { vertices: number }) => total + mesh.vertices * 4, 0));
  assert.equal(image.subarray(8, 12).toString(), "WEBP");
  assert.ok(manifest.width <= 1536 && manifest.height <= 1536);
  assert.ok(image.length + uv.length < 1000000);
});

test("baked paint requires no live lighting and a moved model rejects stale UVs", () => {
  const texture = new Texture();
  const material = campusMaterials(texture).material("#eeeeee");
  assert.equal(material.type, "MeshBasicMaterial");
  assert.equal(material.lightMap, texture);
  const geometry = new BoxGeometry().toNonIndexed();
  const room = new Group();
  room.add(new Mesh(geometry, material));
  const vertices = geometry.getAttribute("position").count;
  const uv = new ArrayBuffer(vertices * 4);
  const manifest = { uvBytes: uv.byteLength, meshes: [{ vertices, stamp: youthGeometryStamp(geometry) }] };
  geometry.translate(.1, 0, 0);
  assert.throws(() => installYouthBake(room, uv, manifest), /needs rebaking/);
  geometry.dispose(); material.dispose(); texture.dispose();
});
