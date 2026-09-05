import { test } from "node:test";
import assert from "node:assert/strict";
import { requestTokenPayPlan } from "./tokenpay-planner";
test("planner uses the connected key on TokenDance only and does not record secrets", async () => {
  const records: unknown[] = [];
  const result = await requestTokenPayPlan({ apiKey: "private-test-key", prompt: "topic", systemPrompt: "JSON", record: (_, data) => records.push(data) }, async (url, init) => {
    assert.equal(String(url), "https://tokendance.space/gateway/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer private-test-key");
    assert.equal(init?.redirect, "error");
    return Response.json({ choices: [{ message: { content: '{"lesson":true}' } }] });
  });
  assert.equal(result, '{"lesson":true}');
  assert.equal(JSON.stringify(records).includes("private-test-key"), false);
});
test("planner rejects missing key before networking and never retries errors", async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; return new Response(null, { status: 402 }); };
  await assert.rejects(requestTokenPayPlan({ apiKey: "", prompt: "", systemPrompt: "" }, request));
  assert.equal(calls, 0);
  await assert.rejects(requestTokenPayPlan({ apiKey: "fake", prompt: "", systemPrompt: "" }, request));
  assert.equal(calls, 1);
});
