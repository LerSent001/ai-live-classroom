import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { generateTokenPayVideo, TokenPayError } from "./tokenpay-video";

const input = { apiKey: "secret-test-key", prompt: "讲解重力" };
const success = () => Response.json({ task: { status: "succeeded", content: { url: "https://example.com/video.mp4" } } });

test("video submits once to TokenDance, attributes the app, and polls only the returned task", async () => {
  const calls: string[] = [];
  let clock = 0;
  let submitted = "";
  const result = await generateTokenPayVideo({ ...input, onSubmitted: (id) => { submitted = id; } }, {
    now: () => clock, sleep: async (ms) => { clock += ms; },
    request: async (url, init) => {
      calls.push(String(url));
      assert.equal(new URL(String(url)).hostname, "tokendance.space");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer secret-test-key");
      assert.equal(headers.get("x-app-url"), "https://github.com/LerSent001/ai-live-classroom");
      assert.equal(init?.redirect, "error");
      if (calls.length === 1) {
        assert.equal(String(url), "https://tokendance.space/gateway/minimax/v2/video_generation");
        assert.equal(init?.method, "POST");
        assert.deepEqual(JSON.parse(String(init?.body)), {
          model: "minimax-h3-max", duration: 5, resolution: "768P", ratio: "16:9", content: [{ type: "text", text: input.prompt }],
        });
        return Response.json({ task_id: "task-123" });
      }
      assert.equal(init?.method, "GET");
      assert.equal(String(url), "https://tokendance.space/gateway/minimax/v2/query/video_generation/task-123");
      return calls.length === 2 ? Response.json({ task: { status: "running" } }) : success();
    },
  });
  assert.equal(submitted, "task-123");
  assert.equal(result.providerUrl, "https://example.com/video.mp4");
  assert.equal(result.expandedPrompt, null);
  assert.equal(calls.length, 3);
});

for (const status of [401, 403, 429, 500, 503]) {
  test(`HTTP ${status} stops without retry or fallback and never echoes provider secrets`, async () => {
    let calls = 0;
    await assert.rejects(generateTokenPayVideo(input, { request: async () => {
      calls++; return Response.json({ message: input.apiKey }, { status });
    } }), (e: unknown) => e instanceof TokenPayError && e.status === status && !e.message.includes(input.apiKey));
    assert.equal(calls, 1);
  });
}

test("missing key, network uncertainty and malformed submission cannot create duplicate tasks", async () => {
  let calls = 0;
  await assert.rejects(generateTokenPayVideo({ ...input, apiKey: " " }, { request: async () => { calls++; return success(); } }), /TOKENDANCE_API_KEY/);
  assert.equal(calls, 0);
  for (const payload of [null, {}, { task_id: "../bad" }]) {
    calls = 0;
    await assert.rejects(generateTokenPayVideo(input, { request: async () => {
      calls++; if (payload === null) throw new Error(input.apiKey); return Response.json(payload);
    } }), (e: unknown) => e instanceof TokenPayError && !e.message.includes(input.apiKey));
    assert.equal(calls, 1);
  }
});

for (const action of ["top_up_balance", "reauthorize_api_key", "api_key_quota"]) {
  test(`recovery action ${action} reaches the caller`, async () => {
    await assert.rejects(generateTokenPayVideo(input, { request: async () => new Response("", {
      status: 403, headers: { "TokenDance-Recovery-Action": action },
    }) }), (e: unknown) => e instanceof TokenPayError && e.recoveryAction === action);
  });
}

for (const status of ["failed", "cancelled", "expired", "unknown"]) {
  test(`task ${status} never resubmits`, async () => {
    let calls = 0;
    await assert.rejects(generateTokenPayVideo(input, { request: async () => {
      calls++; return calls === 1 ? Response.json({ task: { id: "task-1" } }) : Response.json({ task: { status } });
    } }), /TokenPay/);
    assert.equal(calls, 2);
  });
}

test("poll deadline is bounded without retrying creation", async () => {
  let calls = 0; let time = 0;
  await assert.rejects(generateTokenPayVideo(input, {
    timeoutMs: 5_000, now: () => time, sleep: async (ms) => { time += ms; }, request: async () => {
      calls++; return calls === 1 ? Response.json({ task_id: "task-1" }) : Response.json({ task: { status: "queued" } });
    },
  }), /超时/);
  assert.equal(calls, 2);
});

test("runtime is wired to TokenPay and the old SDK is not a dependency", () => {
  const runtime = readFileSync(new URL("./classroom-runtime-instance.ts", import.meta.url), "utf8");
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.match(runtime, /generateTokenPayVideo\(/);
  assert.match(runtime, /wallets.get\(owner\)/);
  assert.equal(Object.keys(pkg.dependencies).some((name) => name.includes("fal-ai")), false);
});
