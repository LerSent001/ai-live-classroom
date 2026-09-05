import assert from "node:assert/strict";
import test from "node:test";
import { submitH3Clip } from "@/server/h3-request";

test("H3 submission uses only the restricted endpoint and returns its queue ID", async () => {
  let calls = 0;
  const id = await submitH3Clip({ apiKey: "test-key", prompt: "Test scene" }, async (url, init) => {
    calls += 1;
    assert.equal(url, "https://queue.fal.run/minimax/h3-max-turbo/image-to-video");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("authorization"), "Key test-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.duration, 5);
    assert.equal(body.resolution, "768P");
    assert.equal("aspect_ratio" in body, false);
    return Response.json({ request_id: "request-test-1" });
  });
  assert.equal(id, "request-test-1");
  assert.equal(calls, 1);
});

for (const status of [401, 403, 429, 503]) {
  test(`H3 HTTP ${status} never resubmits a paid POST`, async () => {
    let calls = 0;
    await assert.rejects(submitH3Clip({ apiKey: "test-key", prompt: "Test" }, async () => {
      calls += 1;
      return Response.json({ detail: "rejected" }, { status });
    }), new RegExp(String(status)));
    assert.equal(calls, 1);
  });
}

test("ambiguous H3 network failures and malformed success do not trigger a second POST", async () => {
  for (const response of [null, {}]) {
    let calls = 0;
    await assert.rejects(submitH3Clip({ apiKey: "test-key", prompt: "Test" }, async () => {
      calls += 1;
      if (response === null) throw new TypeError("fetch failed");
      return Response.json(response);
    }));
    assert.equal(calls, 1);
  }
});
