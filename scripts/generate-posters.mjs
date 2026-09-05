import { readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_TEACHER_ID, TEACHERS, teacherDescription } from "../src/lib/classroom-config.ts";

// Optional teacher: node scripts/generate-posters.mjs [monokuma|monomi]
const teacherId = process.argv[2] ?? DEFAULT_TEACHER_ID;
if (!Object.hasOwn(TEACHERS, teacherId)) throw new Error("Choose monokuma or monomi.");
const teacher = TEACHERS[teacherId];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error("OPENAI_API_KEY missing");
const spritePath = teacher.portraits.standing.src;
const sprite = readFileSync(new URL(`../public${spritePath}`, import.meta.url));
const spriteType = spritePath.endsWith(".webp") ? "image/webp" : "image/png";
const STYLE = "vintage 1970s American classroom wall poster, screen-printed look with flat inks, slightly faded paper, muted mustard, rust, avocado, cream and teal palette, bold friendly typography";

async function generate(name, prompt, reference) {
  const t = Date.now();
  let response;
  if (reference) {
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("image[]", new File([sprite], `${teacherId}.${spriteType.split("/")[1]}`, { type: spriteType }));
    form.append("prompt", prompt);
    form.append("size", "1024x1536");
    form.append("quality", "medium");
    response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "gpt-image-2", prompt, size: "1024x1536", quality: "medium" }),
    });
  }
  if (!response.ok) return `${name}: FAILED ${response.status} ${(await response.text()).slice(0, 160)}`;
  const b64 = (await response.json()).data?.[0]?.b64_json;
  writeFileSync(new URL(`../public/posters/${name}.png`, import.meta.url), Buffer.from(b64, "base64"));
  return `${name}: ok in ${Date.now() - t}ms`;
}

const results = await Promise.all([
  generate("read", `${STYLE}. ${teacherDescription(teacherId)}\nUse the attached character as the exact reference for ${teacher.name}, keeping the original character colors. Poster shows ${teacher.name} sitting on a stack of books, happily reading an open book. The single word "READ" in huge bold letters across the top. No other text.`, true),
  generate("hang-in-there", `${STYLE}. A cute cartoon kitten dangling by its front paws from a tree branch, wide-eyed. The words "HANG IN THERE!" in big bold letters across the bottom. No other text.`, false),
  generate("solar-system", `${STYLE}. Educational science chart of the solar system: the Sun at the left and the planets in a row with simple orbit arcs, each planet drawn in flat colors. Title "OUR SOLAR SYSTEM" at the top in bold letters. Small clean planet name labels only: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.`, false),
]);
console.log(results.join("\n"));
