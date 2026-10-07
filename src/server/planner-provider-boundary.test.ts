import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { LESSON_PLANNER_CONFIG } from "@/lib/classroom-config";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file)
      : /\.(?:ts|tsx|mjs|cjs)$/.test(file) && !file.endsWith(".test.ts") ? [file] : [];
  });
}

test("active source and tools cannot call the removed planner provider", () => {
  for (const file of [...sourceFiles("src"), ...sourceFiles("scripts"), ".env.example"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /generativelanguage\.googleapis\.com|GEMINI_API_KEY|requestGeminiPlan|geminiModel/, file);
  }
  assert.equal(Object.hasOwn(LESSON_PLANNER_CONFIG, "geminiModel"), false);
  assert.equal(LESSON_PLANNER_CONFIG.tokenDanceModel, "deepseek-v4.1-flash");
  assert.equal(LESSON_PLANNER_CONFIG.tokenDanceThinking, "disabled");
});

test("both themes share the same script adapter without sharing their credentials", () => {
  const legacy = readFileSync("src/server/lesson-producer.ts", "utf8");
  const youth = readFileSync("src/server/youth-classroom-runtime.ts", "utf8");
  assert.match(legacy, /requestTokenDancePlan/);
  assert.match(youth, /requestTokenDancePlan/);
  assert.doesNotMatch(youth, /TOKENDANCE_API_KEY|process\.env/);
  const legacyRuntime = readFileSync("src/server/classroom-runtime-instance.ts", "utf8");
  assert.match(legacyRuntime, /TOKENDANCE_API_KEY/);
  assert.doesNotMatch(legacyRuntime, /youth-tokenpay-wallet/);
});
