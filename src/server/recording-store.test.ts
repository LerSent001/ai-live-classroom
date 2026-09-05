import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RecordingStore, type RecordedScene } from "@/server/recording-store";
import { requestGeminiPlan } from "@/server/gemini-planner";

const scene: RecordedScene = {
  teacherId: "monomi",
  sessionId: "mock-session", sceneNumber: 1, videoUrl: "https://example.invalid/clip.mp4",
  narration: "地球吸引小球。", summary: "引力", prompt: "mock prompt", expandedPrompt: "mock expansion",
  timings: { requestId: "mock-request-1", queueWaitMs: 10, inferenceMs: 20, totalMs: 30 },
};

test("actual request and public response survive a new store instance without auth or thoughts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "classroom-recording-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new RecordingStore(root);
  const order: string[] = [];
  await requestGeminiPlan({ apiKey: "secret-test-key", prompt: "重力", systemPrompt: "JSON", record: (kind, data) => {
    order.push(kind); store.record(scene.sessionId, kind, data);
  } }, async () => {
    assert.deepEqual(order, ["planner-request"]);
    return Response.json({ usageMetadata: { totalTokenCount: 42 }, candidates: [{ content: { parts: [
      { thought: true, text: "private-thought" }, { text: '{"title":"重力"}' },
    ] } }] });
  });
  new RecordingStore(root).record(scene.sessionId, "video-failed", { requestId: "mock-request-1", message: "HTTP 503", actualBilledCost: null });
  const text = await readFile(join(root, scene.sessionId, "events.jsonl"), "utf8");
  const events = text.trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(events.map((e) => e.kind), ["planner-request", "planner-response", "video-failed"]);
  assert.equal(events[1].data.usage.totalTokenCount, 42);
  assert.equal(events[2].data.actualBilledCost, null);
  assert.doesNotMatch(text, /secret-test-key|private-thought|x-goog-api-key/);
});

test("download failure retains scene metadata and records the failure; success saves actual bytes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "classroom-recording-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new RecordingStore(root);
  store.saveSceneMetadata(scene);
  const logs: string[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args.join(" ")));
  await store.saveVideo(scene, async () => new Response("gone", { status: 503 }));
  const metadata = JSON.parse(await readFile(join(root, scene.sessionId, "scene-01.json"), "utf8"));
  assert.equal(metadata.timings.requestId, "mock-request-1");
  assert.equal(metadata.prompt, scene.prompt);
  assert.equal(metadata.teacherId, "monomi");
  assert.equal(metadata.actualBilledCost, null);
  assert.match(await readFile(join(root, scene.sessionId, "events.jsonl"), "utf8"), /video-save-failed/);
  assert.ok(logs.some((line) => line.includes("503")));
  await assert.rejects(readFile(join(root, scene.sessionId, "scene-01.mp4")), /ENOENT/);
  await store.saveVideo(scene, async () => new Response("mock-video-bytes"));
  assert.equal(await readFile(join(root, scene.sessionId, "scene-01.mp4"), "utf8"), "mock-video-bytes");
});

test("unwritable recording boundary blocks the provider before any call", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "classroom-recording-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const blocked = join(root, "file-not-directory");
  await writeFile(blocked, "file");
  const store = new RecordingStore(blocked);
  let calls = 0;
  await assert.rejects(requestGeminiPlan({ apiKey: "mock", prompt: "重力", systemPrompt: "JSON", record: (kind, data) => store.record(scene.sessionId, kind, data) }, async () => {
    calls += 1; throw new Error("must not call");
  }), /Cannot save/);
  assert.equal(calls, 0);
  assert.throws(() => new RecordingStore(root).record("../escape", "test", {}), /Invalid recording/);
});
