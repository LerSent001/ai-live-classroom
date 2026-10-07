import test from "node:test";
import assert from "node:assert/strict";
import { requestTokenDancePlan } from "./youth-tokenpay-planner";
import { LESSON_PLANNER_CONFIG } from "@/lib/classroom-config";
const input = { apiKey: "fake-private-key", prompt: "重力", systemPrompt: "Return JSON" };
test("missing TokenDance key fails before submission and empty output fails without retry", async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; return Response.json({ choices: [] }); };
  await assert.rejects(requestTokenDancePlan({ ...input, apiKey: "" }, request), /TokenDance/);
  assert.equal(calls, 0);
  await assert.rejects(requestTokenDancePlan(input, request), /未返回有效课程/);
  assert.equal(calls, 1);
});
test("classroom scripts use the measured DeepSeek model with thinking explicitly disabled", () => {
  assert.equal(LESSON_PLANNER_CONFIG.tokenDanceModel, "deepseek-v4.1-flash");
  assert.equal(LESSON_PLANNER_CONFIG.tokenDanceThinking, "disabled");
});
test("youth planning uses one attributed TokenDance request and keeps keys out of records", async () => {
  const records: unknown[] = [];
  const output = await requestTokenDancePlan({ ...input, record: (kind, data) => records.push({ kind, data }) }, async (url, init) => {
    assert.equal(String(url), "https://tokendance.space/gateway/v1/chat/completions");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${input.apiKey}`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, LESSON_PLANNER_CONFIG.tokenDanceModel); assert.equal(body.response_format.type, "json_object");
    assert.equal(body.temperature, 0.35); assert.equal(body.max_tokens, 8000);
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(body.reasoning_effort, undefined, "Do not override disabled thinking with an effort setting");
    assert.equal(new Headers(init?.headers).get("x-app-url"), "https://github.com/LerSent001/ai-live-classroom");
    return Response.json({ choices: [{ message: { content: '{"title":"重力"}' } }], usage: { total_tokens: 123, completion_tokens_details: { reasoning_tokens: 0 } } });
  });
  assert.equal(output, '{"title":"重力"}');
  assert.ok(!JSON.stringify(records).includes(input.apiKey));
  assert.ok(JSON.stringify(records).includes(LESSON_PLANNER_CONFIG.tokenDanceModel));
  assert.ok(JSON.stringify(records).includes('"reasoning_tokens":0'));
});
test("planner records reported reasoning counts without saving private reasoning or inventing missing usage", async () => {
  for (const count of [undefined, 12]) {
    const records: { kind: string; data: Record<string, unknown> }[] = [];
    await requestTokenDancePlan({ ...input, record: (kind, data) => records.push({ kind, data }) }, async () =>
      Response.json({ choices: [{ message: { content: '{"title":"重力"}', reasoning_content: "private-reasoning-must-not-be-recorded" } }],
        usage: { completion_tokens_details: { reasoning_tokens: count } } }));
    const usage = records.find(({ kind }) => kind === "planner-response")!.data.usage;
    assert.deepEqual(usage, count === undefined ? {} : { reasoning_tokens: count });
    assert.ok(!JSON.stringify(records).includes("private-reasoning-must-not-be-recorded"));
  }
});
test("planner rejects provider/transport/malformed errors without retrying or exposing payloads", async () => {
  for (const mode of ["http", "network", "json"]) {
    let calls = 0;
    await assert.rejects(requestTokenDancePlan(input, async () => {
      calls++;
      if (mode === "network") throw new Error(input.apiKey);
      return new Response(input.apiKey, { status: mode === "http" ? 403 : 200 });
    }), (error: unknown) => error instanceof Error && !error.message.includes(input.apiKey));
    assert.equal(calls, 1);
  }
});
