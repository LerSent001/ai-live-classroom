import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";

const source = "output/youth-bake/", destination = "public/youth/";
const image = await sharp(source + "lighting.png").removeAlpha().webp({ quality: 94, effort: 6 }).toBuffer();
const uv = await fs.readFile(source + "lighting-uv.bin");
const manifest = JSON.parse(await fs.readFile(source + "lighting.json", "utf8"));
manifest.lightmapBytes = image.length;
manifest.lightmapSha256 = crypto.createHash("sha256").update(image).digest("hex");
manifest.uvSha256 = crypto.createHash("sha256").update(uv).digest("hex");
await fs.writeFile(destination + "lighting.webp", image);
await fs.writeFile(destination + "lighting-uv.bin", uv);
await fs.writeFile(destination + "lighting.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ imageBytes: image.length, uvBytes: uv.length, meshes: manifest.meshes.length }));
