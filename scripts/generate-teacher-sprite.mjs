import { readFileSync, writeFileSync } from "node:fs";
import { CLASSROOM_STYLE, DEFAULT_TEACHER_ID, TEACHERS, teacherDescription } from "../src/lib/classroom-config.ts";

// Redraws the selected classroom teacher as a transparent cartoon sprite draft.
// Usage: node scripts/generate-teacher-sprite.mjs <reference-image> [monokuma|monomi] [flatten]
// "flatten" keeps the reference drawing as-is and only pushes it toward flat cel shading.
const referencePath = process.argv[2];
const teacherId = process.argv[3] === "flatten" ? DEFAULT_TEACHER_ID : (process.argv[3] ?? DEFAULT_TEACHER_ID);
const flatten = process.argv[3] === "flatten" || process.argv[4] === "flatten";
if (!referencePath) throw new Error("Pass a reference image of the selected teacher.");
if (!Object.hasOwn(TEACHERS, teacherId)) throw new Error("Choose monokuma or monomi.");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error("OPENAI_API_KEY missing from .env.local");

const prompt = [
  teacherDescription(teacherId),
  `Redraw ${TEACHERS[teacherId].name} from the reference as one full-body 2D cartoon sprite. Preserve the selected character's exact colors and compact proportions.`,
  flatten
    ? "Keep the reference pose, expression, and framing exactly."
    : "Pose: standing upright facing the viewer, one rounded paw raised in a friendly wave, no handheld accessories.",
  `Style: ${CLASSROOM_STYLE}.`,
  "Show the entire character with a margin on a fully transparent background. No scenery, floor, drop shadow, or text.",
].join("\n\n");

const reference = readFileSync(referencePath);
const type = referencePath.endsWith(".webp") ? "image/webp" : referencePath.endsWith(".jpg") ? "image/jpeg" : "image/png";

async function generate() {
  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("image[]", new File([reference], `reference.${type.split("/")[1]}`, { type }));
  form.append("prompt", prompt);
  form.append("size", "1024x1536");
  form.append("quality", "medium");
  form.append("background", "transparent");
  return fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
}

const response = await generate();
if (!response.ok) throw new Error(`images/edits failed ${response.status}: ${(await response.text()).slice(0, 300)}`);
const payload = await response.json();
const b64 = payload.data?.[0]?.b64_json;
if (!b64) throw new Error("no image in response");
const outputPath = `public/characters/${teacherId}/generated-standing.png`;
writeFileSync(new URL(`../${outputPath}`, import.meta.url), Buffer.from(b64, "base64"));
console.log(`wrote ${outputPath}`);
