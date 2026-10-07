import assert from "node:assert/strict";
import test from "node:test";
import { collectTokenDanceVideo, generateTokenDanceVideo, TokenDanceError, TokenDanceTaskPending } from "./youth-tokenpay-video";

const input = { apiKey: "secret-test-key", prompt: "讲解重力" };
const success = () => Response.json({ task: { status: "succeeded", content: { url: "https://example.com/video.mp4" } } });

test("a slow task crosses several query windows and still produces a video after exactly one POST", async () => {
  let clock = 0, polls = 0, submits = 0;
  const resumptions: string[] = [];
  const result = await collectTokenDanceVideo(input, args => generateTokenDanceVideo(args, {
    timeoutMs: 15000, now: () => clock, sleep: async ms => { clock += ms; },
    request: async (_url, init) => {
      if (init?.method === "POST") { submits++; return Response.json({ task_id: "slow-paid-receipt" }); }
      polls++; return polls < 6 ? Response.json({ task: { status: "running" } }) : success();
    },
  }), { sleep: async () => {}, onPending: id => resumptions.push(id) });
  assert.equal(submits, 1); assert.equal(polls, 6);
  assert.deepEqual(resumptions, ["slow-paid-receipt", "slow-paid-receipt"]);
  assert.equal(result.timings.requestId, "slow-paid-receipt");
});

test("deadline expiry is typed as pending, never as a terminal failed task", async () => {
  let clock = 0;
  await assert.rejects(generateTokenDanceVideo({ ...input, resumeRequestId: "durable-id" }, {
    timeoutMs: 1, now: () => clock, sleep: async ms => { clock += ms; },
    request: async () => Response.json({ task: { status: "running" } }),
  }), e => e instanceof TokenDanceTaskPending && e.requestId === "durable-id");
});

test("video submits once to TokenDance, attributes the app, and polls only the returned task", async () => {
  const calls: string[] = [];
  let clock = 0;
  let submitted = "";
  const result = await generateTokenDanceVideo({ ...input, onSubmitted: (id) => { submitted = id; } }, {
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

test("transient query failures retry only GET for the same paid task", async () => {
  let clock = 0;
  const methods: string[] = [];
  const retries: Array<{ requestId: string; attempt: number; reason: string }> = [];
  const result = await generateTokenDanceVideo({ ...input, onQueryRetry: event => retries.push(event) }, {
    now: () => clock, sleep: async ms => { clock += ms; },
    request: async (url, init) => {
      methods.push(init?.method ?? "");
      if (methods.length === 1) return Response.json({ task_id: "paid-task-1" });
      assert.equal(String(url), "https://tokendance.space/gateway/minimax/v2/query/video_generation/paid-task-1");
      if (methods.length === 2) throw new Error(input.apiKey);
      if (methods.length === 3) return new Response("", { status: 503 });
      if (methods.length === 4) return new Response("not JSON");
      if (methods.length === 5) return Response.json({ task: { status: "running" } });
      return success();
    },
  });
  assert.equal(result.providerUrl, "https://example.com/video.mp4");
  assert.deepEqual(methods, ["POST", "GET", "GET", "GET", "GET", "GET"]);
  assert.deepEqual(retries, [
    { requestId: "paid-task-1", attempt: 1, reason: "network-or-timeout" },
    { requestId: "paid-task-1", attempt: 2, reason: "HTTP 503" },
    { requestId: "paid-task-1", attempt: 3, reason: "invalid-json" },
  ]);
  assert.equal(clock, 40_000);
  assert.ok(!JSON.stringify(retries).includes(input.apiKey));
});

test("permanent query rejection stops without a second paid submission", async () => {
  for (const response of [
    new Response("", { status: 401 }),
    new Response("", { status: 429, headers: { "TokenDance-Recovery-Action": "api_key_quota" } }),
  ]) {
    const methods: string[] = [];
    await assert.rejects(generateTokenDanceVideo(input, { request: async (_url, init) => {
      methods.push(init?.method ?? "");
      return methods.length === 1 ? Response.json({ task_id: "paid-task-1" }) : response;
    } }), (error: unknown) => error instanceof TokenDanceError && error.status === response.status);
    assert.deepEqual(methods, ["POST", "GET"]);
  }
});

test("query transport failures stop at the deadline but never re-POST", async () => {
  let clock = 0;
  const methods: string[] = [];
  await assert.rejects(generateTokenDanceVideo(input, {
    timeoutMs: 25_000, now: () => clock, sleep: async ms => { clock += ms; },
    request: async (_url, init) => {
      methods.push(init?.method ?? "");
      if (methods.length === 1) return Response.json({ task_id: "paid-task-1" });
      throw new Error("connection dropped");
    },
  }), /等待超时.*network-or-timeout/);
  assert.deepEqual(methods, ["POST", "GET", "GET", "GET"]);
  assert.equal(clock, 25_000);
});

for (const status of [401, 403, 429, 500, 503]) {
  test(`HTTP ${status} stops without retry or fallback and never echoes provider secrets`, async () => {
    let calls = 0;
    await assert.rejects(generateTokenDanceVideo(input, { request: async () => {
      calls++; return Response.json({ message: input.apiKey }, { status });
    } }), (e: unknown) => e instanceof TokenDanceError && e.status === status && !e.message.includes(input.apiKey));
    assert.equal(calls, 1);
  });
}

test("missing key, network uncertainty and malformed submission cannot create duplicate tasks", async () => {
  let calls = 0;
  await assert.rejects(generateTokenDanceVideo({ ...input, apiKey: " " }, { request: async () => { calls++; return success(); } }), /TOKENDANCE_API_KEY/);
  assert.equal(calls, 0);
  for (const payload of [null, {}, { task_id: "../bad" }]) {
    calls = 0;
    await assert.rejects(generateTokenDanceVideo(input, { request: async () => {
      calls++; if (payload === null) throw new Error(input.apiKey); return Response.json(payload);
    } }), (e: unknown) => e instanceof TokenDanceError && !e.message.includes(input.apiKey));
    assert.equal(calls, 1);
  }
});

for (const action of ["top_up_balance", "reauthorize_api_key", "api_key_quota"]) {
  test(`recovery action ${action} reaches the caller`, async () => {
    await assert.rejects(generateTokenDanceVideo(input, { request: async () => new Response("", {
      status: 403, headers: { "TokenDance-Recovery-Action": action },
    }) }), (e: unknown) => e instanceof TokenDanceError && e.recoveryAction === action);
  });
}

for (const status of ["failed", "cancelled", "expired"]) {
  test(`task ${status} never resubmits`, async () => {
    let calls = 0;
    await assert.rejects(generateTokenDanceVideo(input, { request: async () => {
      calls++; return calls === 1 ? Response.json({ task: { id: "task-1" } }) : Response.json({ task: { status } });
    } }), /TokenDance/);
    assert.equal(calls, 2);
  });
}

test("poll deadline is bounded without retrying creation", async () => {
  let calls = 0; let time = 0;
  await assert.rejects(generateTokenDanceVideo(input, {
    timeoutMs: 5_000, now: () => time, sleep: async (ms) => { time += ms; }, request: async () => {
      calls++; return calls === 1 ? Response.json({ task_id: "task-1" }) : Response.json({ task: { status: "queued" } });
    },
  }), /超时/);
  assert.equal(calls, 2);
});

test("valid JSON missing task/status or a result URL keeps querying the same receipt", async () => {
  const responses = [{}, { task: {} }, { task: { status: "succeeded" } }, { task: { status: "unknown" } }, { task: { id: "another-task", status: "succeeded", content: { url: "https://example.com/wrong.mp4" } } }, { task: { status: "running" } }];
  const methods: string[] = [], reasons: string[] = [];
  let clock = 0;
  const result = await generateTokenDanceVideo({ ...input, onQueryRetry: event => reasons.push(event.reason) }, {
    now: () => clock, sleep: async ms => { clock += ms; },
    request: async (_url, init) => {
      methods.push(init!.method!);
      if (init?.method === "POST") return Response.json({ task_id: "accepted-1" });
      return responses.length ? Response.json(responses.shift()) : success();
    },
  });
  assert.equal(result.timings.requestId, "accepted-1");
  assert.equal(methods.filter(method => method === "POST").length, 1);
  assert.deepEqual(reasons, ["incomplete-task-payload", "incomplete-task-payload", "missing-result-url", "unknown-task-status", "mismatched-task-id"]);
});

test("recovery accepts a durable task ID and performs zero POST requests", async () => {
  const methods: string[] = [];
  await generateTokenDanceVideo({ ...input, resumeRequestId: "existing-paid-task" }, {
    request: async (url, init) => { methods.push(init!.method!); assert.match(String(url), /existing-paid-task$/); return success(); },
  });
  assert.deepEqual(methods, ["GET"]);
  await assert.rejects(generateTokenDanceVideo({ ...input, resumeRequestId: "../invalid" }, { request: async () => { throw new Error("must not call"); } }), /无效任务/);
});

test("an incomplete query response stops only at the deadline, without a paid retry", async () => {
  let time = 0; let posts = 0;
  await assert.rejects(generateTokenDanceVideo(input, {
    timeoutMs: 15_000, now: () => time, sleep: async ms => { time += ms; },
    request: async (_url, init) => { if (init?.method === "POST") { posts++; return Response.json({ task_id: "existing" }); } return Response.json({}); },
  }), /等待超时.*incomplete-task-payload/);
  assert.equal(posts, 1);
  assert.equal(time, 15_000);
});
