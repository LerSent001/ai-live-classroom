// Explicitly authorized, text-only single-variable probe. No runtime/video imports.
// Dry run by default; --run-paid submits at most the three saved baseline topics.
import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LESSON_PLANNER_CONFIG, PLANNER_SYSTEM_PROMPT, preparationPrompt } from "../src/lib/classroom-config.ts";
import { YOUTH_TEACHER_ID } from "../src/lib/youth-classroom.ts";
import { parseInitialLesson } from "../src/server/lesson-plan.ts";

const baselineDirectory = "output/planner-comparison/2026-09-22T08-42-25-869Z";
const model = "deepseek-v4.1-flash";
const baselines = [1, 2, 3].map((index) => {
  const saved = JSON.parse(readFileSync(join(baselineDirectory, `${index}-${model}-request.json`), "utf8"));
  const result = JSON.parse(readFileSync(join(baselineDirectory, `${index}-${model}-result.json`), "utf8"));
  assert.equal(saved.model, model);
  assert.equal(saved.body.model, LESSON_PLANNER_CONFIG.tokenDanceModel);
  assert.deepEqual(saved.body.messages, [
    { role: "system", content: PLANNER_SYSTEM_PROMPT },
    { role: "user", content: preparationPrompt(saved.topic, 6, YOUTH_TEACHER_ID) },
  ], "The production prompt must still match the historical baseline");
  assert.equal(saved.body.temperature, LESSON_PLANNER_CONFIG.temperature);
  assert.equal(saved.body.max_tokens, LESSON_PLANNER_CONFIG.preparationMaxTokens);
  assert.equal(saved.body.thinking, undefined);
  return { index, topic: saved.topic, baselineLatencyMs: result.latencyMs,
    body: { ...saved.body, thinking: { type: "disabled" } } };
});
const plan = { model, maxTextRequests: 3, videoRequests: 0, retries: 0,
  changedFields: ["thinking.type=disabled"], baselineDirectory,
  topics: baselines.map(({ topic }) => topic), targetCompleteLatencyMs: 10_000 };
if (!process.argv.includes("--run-paid")) {
  console.log(JSON.stringify({ dryRun: true, ...plan }, null, 2));
  process.exit(0);
}

const walletRoot = ".youth-tokenpay";
const files = readdirSync(walletRoot).filter((name) => /^[a-f0-9]{64}\.enc$/.test(name));
assert.equal(files.length, 1, "Expected exactly one previously authorized wallet; never choose between owners");
const encrypted = readFileSync(join(walletRoot, files[0]));
const decipher = createDecipheriv("aes-256-gcm", readFileSync(join(walletRoot, "encryption-key")), encrypted.subarray(0, 12));
decipher.setAAD(Buffer.from(files[0].slice(0, -4)));
decipher.setAuthTag(encrypted.subarray(12, 28));
const apiKey = Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString("utf8");
assert.ok(apiKey.trim() && !/fake|mock|fixture|placeholder/i.test(apiKey));
const balance = async () => {
  const response = await fetch("https://tokendance.space/portal/api/v1/user/balance", {
    headers: { Authorization: `Bearer ${apiKey}` }, redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Balance HTTP ${response.status}`);
  const data = await response.json();
  if (!Number.isFinite(data?.balance?.balance)) throw new Error("Invalid balance response");
  return data.balance.balance / 1e6;
};
const catalogResponse = await fetch("https://tokendance.space/gateway/v1/models", { signal: AbortSignal.timeout(15_000) });
if (!catalogResponse.ok || !(await catalogResponse.json()).data?.some((entry) => entry.id === model)) {
  throw new Error("Requested model is not in the live catalog");
}
const before = await balance();
assert.ok(before > 0, "A positive balance is required");
const directory = join("output", "deepseek-fast-planner", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(directory, { recursive: true, mode: 0o700 });
const save = (name, data) => writeFileSync(join(directory, name), JSON.stringify(data, null, 2).replaceAll(apiKey, "[REDACTED]"), { mode: 0o600 });
save("plan.json", { ...plan, startedAt: new Date().toISOString(), balanceBeforeYuan: before });
console.log(JSON.stringify({ directory, plannedRequests: 3, balanceBeforeYuan: before }));
const results = [];
for (const { index, topic, body, baselineLatencyMs } of baselines) {
  save(`${index}-request.json`, { model, topic, body, submittedAt: new Date().toISOString() });
  const started = performance.now();
  const result = { model, topic, baselineLatencyMs, status: "pending", actualBilledCost: null };
  try {
    const response = await fetch("https://tokendance.space/gateway/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}`, "X-App-URL": "https://github.com/LerSent001/ai-live-classroom" },
      body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(90_000),
    });
    result.httpStatus = response.status;
    if (!response.ok) result.status = "http-error-no-retry";
    else {
      const data = await response.json();
      result.fullResponseLatencyMs = Math.round(performance.now() - started);
      result.requestId = typeof data.id === "string" ? data.id : null;
      result.returnedModel = data.model;
      result.finishReason = data.choices?.[0]?.finish_reason;
      result.usage = Object.fromEntries(Object.entries(data.usage ?? {}).filter(([, value]) => typeof value === "number"));
      result.reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? null;
      // Record only whether reasoning was returned, never its private text.
      result.reasoningCharacters = typeof data.choices?.[0]?.message?.reasoning_content === "string" ? data.choices[0].message.reasoning_content.length : 0;
      result.output = data.choices?.[0]?.message?.content;
      const raw = JSON.parse(result.output);
      const lesson = parseInitialLesson({ teacherId: YOUTH_TEACHER_ID, topic, durationSeconds: 30,
        output: result.output, latencyMs: result.fullResponseLatencyMs, preparedBy: model });
      result.strictJson = true;
      result.validSuggestions = Array.isArray(raw.suggestedTopics) && raw.suggestedTopics.length === 3
        && raw.suggestedTopics.every((item) => typeof item === "string" && /\p{Script=Han}/u.test(item))
        && new Set(raw.suggestedTopics).size === 3;
      result.narrationHanCounts = lesson.steps.map((step) => (step.narration.match(/\p{Script=Han}/gu) ?? []).length);
      result.lesson = lesson;
      result.status = result.finishReason !== "stop" ? "incomplete-response"
        : result.reasoningTokens > 0 || result.reasoningCharacters > 0 ? "thinking-not-disabled"
        : result.validSuggestions ? "ok" : "invalid-suggestions";
    }
  } catch {
    result.status = "transport-or-invalid-response-no-retry";
  }
  result.completeLatencyMs = Math.round(performance.now() - started);
  result.underTenSeconds = result.status === "ok" && result.completeLatencyMs < 10_000;
  results.push(result);
  save(`${index}-result.json`, result);
  save("results.json", results);
  console.log(JSON.stringify({ topic, status: result.status, completeLatencyMs: result.completeLatencyMs,
    reasoningTokens: result.reasoningTokens, reasoningCharacters: result.reasoningCharacters, underTenSeconds: result.underTenSeconds }));
  if (result.status !== "ok") break;
  if (before - await balance() > 1) { console.log("Stopped at the account-delta safety guard; no retries"); break; }
}
let after = null;
try { after = await balance(); } catch { /* Unavailable is not a zero balance. */ }
const complete = results.filter((result) => result.status === "ok");
const summary = { ...plan, completedAt: new Date().toISOString(), textRequests: results.length,
  validScripts: complete.length, underTenSeconds: complete.filter((result) => result.underTenSeconds).length,
  latenciesMs: results.map((result) => result.completeLatencyMs),
  meanCompleteLatencyMs: complete.length ? Math.round(complete.reduce((sum, result) => sum + result.completeLatencyMs, 0) / complete.length) : null,
  balanceBeforeYuan: before, balanceAfterYuan: after, accountBalanceDeltaYuan: after === null ? null : Number((before - after).toFixed(6)),
  costCaveat: "Account delta is not an itemized invoice and may include other activity or delayed charges.",
};
save("summary.json", summary);
console.log(JSON.stringify({ directory, ...summary }, null, 2));
