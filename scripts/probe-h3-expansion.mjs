// Renders ONE H3 Max clip (paid: one 768P clip) from a sample beat using the production prompt compiler,
// then prints fal's expanded prompt and which selected character-sheet lines survived the rewrite.
// Usage: node --experimental-strip-types scripts/probe-h3-expansion.mjs ["visual beat"] ["narration"] [monokuma|monomi]
import { readFileSync } from "node:fs";
import { fal } from "@fal-ai/client";
import { DEFAULT_TEACHER_ID, TEACHERS, compileH3ScenePrompt, H3_MAX_CONFIG, h3InputForPrompt } from "../src/lib/classroom-config.ts";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error("FAL_KEY missing from .env.local");

const visualAction = process.argv[2] ?? "A simplified cartoon globe rotates, wrapped in a web of glowing interconnected fiber lines.";
const narration = process.argv[3] ?? "It's a high-speed, light-based highway connecting our world in milliseconds.";
const teacherId = process.argv[4] ?? DEFAULT_TEACHER_ID;
if (teacherId !== "monokuma" && teacherId !== "monomi") throw new Error("Unknown teacher ID");
const prompt = compileH3ScenePrompt({ teacherId, sceneNumber: 7, visualAction, narration });
console.log("===== OUR PROMPT =====\n" + prompt + "\n");

fal.config({ credentials: key });
const startedAt = Date.now();
const result = await fal.subscribe(H3_MAX_CONFIG.endpoint, {
  input: h3InputForPrompt(prompt),
  logs: false,
});
const expanded = result.data?.expanded_prompt ?? "(no expansion returned)";
console.log(`===== EXPANDED (${((Date.now() - startedAt) / 1000).toFixed(1)}s total) =====\n` + expanded + "\n");

console.log("character sheet: " + TEACHERS[teacherId].characterSheet.map((line, index) => `${index + 1}=${expanded.includes(line) ? "exact" : "rewritten"}`).join("  "));
console.log("shots: " + (expanded.match(/\[Shot/g) ?? []).length);
console.log("video: " + result.data?.video?.url);
