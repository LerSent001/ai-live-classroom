// Public CC0 geometry only. No account, provider API or paid generation.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const destination = path.resolve("output/youth-props/source");
const sources = [
  ["monstera-plant", "e425b03e-f073-405b-82f8-a8854d7233c9", "https://poly.pizza/m/s9Nocqk1Ge"],
  ["pothos", "4bf8e504-7647-46e2-8e8f-87ee4c663f55", "https://poly.pizza/m/QqbCvErL93"],
  ["books", "dfbb9f38-a5de-41d7-bcbf-0a0929f3c53d", "https://poly.pizza/m/dxt7dETAy9"],
];
await fs.mkdir(destination, { recursive: true });
const report = [];
for (const [name, id, source] of sources) {
  const url = `https://static.poly.pizza/${id}.glb`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error(`${name}: invalid GLB`);
  await fs.writeFile(path.join(destination, name + ".glb"), bytes);
  report.push({ name, url, source, license: "CC0-1.0", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await fs.writeFile(path.join(destination, "download-manifest.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
