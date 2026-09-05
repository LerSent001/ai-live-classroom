import assert from "node:assert/strict";
import test from "node:test";
import { requestGeminiPlan } from "@/server/gemini-planner";

const input = { apiKey: "test-key", prompt: "Explain lunar phases", systemPrompt: "Return JSON" };

test("planning sends one JSON request to Gemini and joins non-thinking text", async () => {
  let calls = 0;
  const output = await requestGeminiPlan(input, async (url, init) => {
    calls += 1;
    assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-key");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: "minimal" });
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    return Response.json({ candidates: [{ content: { parts: [
      { thought: true, text: "private reasoning" },
      { text: '{"title":' }, { text: '"Moon"}' },
    ] } }] });
  });
  assert.equal(calls, 1);
  assert.equal(output, '{"title":"Moon"}');
});

test("a rejected Gemini request stops without another provider attempt", async () => {
  let calls = 0;
  await assert.rejects(requestGeminiPlan(input, async () => {
    calls += 1;
    return new Response("unavailable", { status: 429 });
  }), /status 429/);
  assert.equal(calls, 1);
});

test("missing Gemini key and empty provider output fail explicitly", async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls += 1; return Response.json({ candidates: [] }); };
  await assert.rejects(requestGeminiPlan({ ...input, apiKey: "" }, request), /GEMINI_API_KEY/);
  assert.equal(calls, 0);
  await assert.rejects(requestGeminiPlan(input, request), /invalid planner response/);
  assert.equal(calls, 1);
});
