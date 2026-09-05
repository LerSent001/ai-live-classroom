// Runs ONE paid Gemini planning request using the same prompt as the app.
// Usage: node --experimental-strip-types scripts/probe-planner-narration.mjs "topic" [monokuma|monomi]
import { readFileSync } from "node:fs";
import { DEFAULT_TEACHER_ID, TEACHERS, LESSON_PLANNER_CONFIG, PLANNER_SYSTEM_PROMPT, preparationPrompt } from "../src/lib/classroom-config.ts";
const topic = process.argv[2] ?? "讲讲重力的原理";
const teacherId = process.argv[3] ?? DEFAULT_TEACHER_ID;
if (teacherId !== "monokuma" && teacherId !== "monomi") throw new Error("Unknown teacher ID");
const teacherName = TEACHERS[teacherId].name;
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error("GEMINI_API_KEY missing from .env.local");
const prompt = preparationPrompt(topic, 6, teacherId);
const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${LESSON_PLANNER_CONFIG.geminiModel}:generateContent`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-goog-api-key": key },
  body: JSON.stringify({
    systemInstruction: { parts: [{ text: PLANNER_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.35, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "minimal" } },
  }),
});
if (!response.ok) throw new Error(`gemini ${response.status}: ${(await response.text()).slice(0, 200)}`);
const payload = await response.json();
const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
const plan = JSON.parse(text);
let flagged = 0;
for (const [i, step] of plan.steps.entries()) {
  const bad = new RegExp(`\\b${teacherName}\\b`).test(step.narration) || /this (video|show|classroom|lesson|channel)|\bI (made|created|generated)\b/i.test(step.narration);
  if (bad) flagged += 1;
  console.log(`${String(i + 1).padStart(2)}. ${step.narration}${bad ? "   <-- FLAG" : ""}`);
  console.log(`    visual: ${step.visualAction}`);
}
console.log(`\nflagged narration lines: ${flagged}/${plan.steps.length}`);
