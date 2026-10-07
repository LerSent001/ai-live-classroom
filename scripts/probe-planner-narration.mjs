// Offline narration inspection only: never reads a key or submits a model request.
// Usage: node --import tsx scripts/probe-planner-narration.mjs <saved-script.json> [monokuma|monomi]
import { readFileSync } from "node:fs";
import { DEFAULT_TEACHER_ID, TEACHERS } from "../src/lib/classroom-config.ts";

const file = process.argv[2];
if (!file || file.startsWith("--")) throw new Error("Provide a saved script JSON file. This tool never generates a new script.");
const teacherId = process.argv[3] ?? DEFAULT_TEACHER_ID;
if (teacherId !== "monokuma" && teacherId !== "monomi") throw new Error("Unknown teacher ID");
const payload = JSON.parse(readFileSync(file, "utf8"));
const plan = typeof payload.output === "string" ? JSON.parse(payload.output) : payload.lesson ?? payload;
if (!Array.isArray(plan.steps)) throw new Error("Saved script has no steps");
const teacherName = TEACHERS[teacherId].name;
let flagged = 0;
for (const [index, step] of plan.steps.entries()) {
  const bad = new RegExp(`\\b${teacherName}\\b`).test(step.narration) || /this (video|show|classroom|lesson|channel)|\bI (made|created|generated)\b/i.test(step.narration);
  if (bad) flagged++;
  console.log(`${String(index + 1).padStart(2)}. ${step.narration}${bad ? "   <-- FLAG" : ""}`);
  console.log(`    visual: ${step.visualAction}`);
}
console.log(`flagged narration lines: ${flagged}/${plan.steps.length}; provider requests: 0`);
