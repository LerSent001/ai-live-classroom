import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isVideoContainer, readProvider } from "./provider-read";
import { RecordingStore, type RecordedScene } from "./recording-store";

const bytes = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]);

test("read-only JSON recovers from HTTP and malformed responses without sending any POST", async () => {
  let calls = 0;
  const result = await readProvider("https://example.invalid/prices", { label: "unavailable", sleep: async () => {},
    request: async (_url, init) => {
      assert.equal(init?.method, "GET"); calls++;
      return calls === 1 ? new Response("", { status: 503 }) : calls === 2 ? new Response("bad JSON") : Response.json({ valid: true });
    }, read: r => r.json(),
  });
  assert.deepEqual(result, { valid: true }); assert.equal(calls, 3);
});

test("a permanent read rejection is not retried and cannot expose provider payloads", async () => {
  let calls = 0;
  await assert.rejects(readProvider("https://example.invalid/secret-signature", { label: "unavailable", sleep: async () => {},
    request: async () => { calls++; return new Response("private-key-must-not-leak", { status: 401 }); }, read: r => r.json(),
  }), e => e instanceof Error && e.message === "unavailable");
  assert.equal(calls, 1);
});

test("an HTML error page is never saved as a completed video; a later download repairs it without generation", async t => {
  const root = mkdtempSync(join(tmpdir(), "media-retry-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new RecordingStore(root), scene: RecordedScene = { sessionId: "local-fixture", sceneNumber: 1, teacherId: "youth-mentor-male",
    videoUrl: "https://example.invalid/paid-video", narration: "测试", summary: "测试", prompt: "local no-spend test", expandedPrompt: null,
    timings: { requestId: "original-paid-id", queueWaitMs: null, inferenceMs: null, totalMs: 1 } };
  store.saveSceneMetadata(scene); let calls = 0;
  const saved = await store.saveVideo(scene, async (_url, init) => {
    assert.equal(init?.method, "GET"); calls++;
    return new Response(calls === 1 ? "<html>temporary CDN failure</html>" : bytes);
  }, { sleep: async () => {} });
  assert.equal(saved, true); assert.equal(calls, 2);
  assert.deepEqual(readFileSync(join(root, scene.sessionId, "scene-01.mp4")), Buffer.from(bytes));
  assert.equal(isVideoContainer(Buffer.from("<html>error</html>")), false);
  assert.equal(isVideoContainer(new Uint8Array()), false);
});
