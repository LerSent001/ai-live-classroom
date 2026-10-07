// Prints fal's rewritten ("expanded") H3 prompt for every scene of a session still held by the dev server,
// plus which numbered lines of the selected teacher's sheet survived unchanged.
// Usage: node scripts/expanded-prompts.mjs <sessionId> [port]
import { TEACHERS } from "../src/lib/classroom-config.ts";
const [sessionId, port = "3000"] = process.argv.slice(2);
if (!sessionId) throw new Error("usage: node scripts/expanded-prompts.mjs <sessionId> [port]");

const response = await fetch(`http://localhost:${port}/api/classroom/${sessionId}`);
if (!response.ok) throw new Error(`session fetch failed ${response.status}`);
const payload = await response.json();
const snapshot = payload.outcome?.snapshot;
if (!snapshot || !Object.hasOwn(TEACHERS, snapshot.teacherId) || !Array.isArray(snapshot.scenes)) {
  throw new Error("Expected a classroom snapshot with a valid teacher and scene list.");
}
const scenes = snapshot.scenes;
if (scenes.length === 0) throw new Error(payload.error ?? "no scenes in this session (restarted server?)");

const teacher = TEACHERS[snapshot.teacherId];
const features = teacher.characterSheet;
console.log(`${teacher.name}: exact numbered character-sheet matches`);
const header = ["scene", "shots", ...features.map((_, index) => `line ${index + 1}`)].join(" | ");
console.log(header);
for (const [index, scene] of scenes.entries()) {
  const text = scene.segment?.expandedPrompt ?? "";
  const shots = (text.match(/\[Shot/g) ?? []).length;
  const row = features.map((line) => (text.includes(line) ? "Y" : "-"));
  console.log([String(index + 1).padStart(5), String(shots).padStart(5), ...row].join(" | "));
}
console.log();
for (const [index, scene] of scenes.entries()) {
  console.log(`===== scene ${index + 1} =====`);
  console.log(scene.segment?.expandedPrompt ?? "(no expansion returned)");
  console.log();
}
