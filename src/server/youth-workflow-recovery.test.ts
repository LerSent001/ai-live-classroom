import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { RecordingStore } from "./recording-store";
import { YouthRuntimeRegistry } from "./youth-classroom-runtime";
import { SavedClassrooms } from "./saved-classrooms";
import { YouthRecordingRecovery } from "./youth-recording-recovery";
import { compileLessonScene, parseInitialLesson } from "./lesson-plan";
import { toClassroomSessionId, toCommandId } from "@/lib/classroom-boundaries";
import type { LessonLedger, LessonDurationSeconds } from "@/lib/classroom-types";

const owner = "a".repeat(64), key = "fake-wallet-key-never-real", teacherId = "youth-mentor-male";
const flush = async (count = 30) => { for (let n = 0; n < count; n++) await new Promise<void>(resolve => setImmediate(resolve)); };
const waitFor = async (condition: () => boolean) => {
  for (let count = 0; count < 600 && !condition(); count++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(condition(), "asynchronous provider/download work must finish within the fixture deadline");
};
const output = (count: number) => JSON.stringify({ title: "彩虹", bigQuestion: "为什么出现？", suggestedTopics: ["折射", "散射", "水滴"], steps: Array.from({ length: count }, () => ({
  role: "mechanism", narration: "阳光进入水滴后发生折射。", concept: "折射", visualAction: "The mentor shows a ray entering a water droplet.",
})) });
function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "youth-recovery-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new RecordingStore(root, "test-no-spend");
  const wallet = { get: () => key, revision: () => 0 };
  // Container-header fixture only; this does not prove that a video decodes.
  const download: typeof fetch = async () => new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]));
  function record(idText: string, topic = "彩虹", durationSeconds: LessonDurationSeconds = 30, accepted = durationSeconds / 5, complete = false) {
    const id = toClassroomSessionId(idText);
    const lesson = parseInitialLesson({ topic, teacherId, durationSeconds, output: output(durationSeconds / 5), latencyMs: 1, preparedBy: "no-spend fixture" });
    store.record(id, "lesson-selection", { playlistId: id, sessionId: id, previousSessionId: null, position: 1, teacherId, durationSeconds, topic, commandId: `start-${id}` });
    store.record(id, "lesson-prepared", { result: { ok: true, lesson } });
    let ledger: LessonLedger = { nextStepIndex: 0, conceptsPlanned: [], recentNarrations: [], recentVisuals: [] };
    for (const [index, step] of lesson.steps.entries()) {
      const number = index + 1;
      const plan = compileLessonScene({ lesson, ledger, sceneNumber: number, purpose: { kind: "lesson", stepId: step.id } });
      ledger = plan.ledgerAfter;
      if (number > accepted) continue;
      const requestId = `paid-${id}-${number}`;
      store.record(id, "video-request", { sceneNumber: number, plan, keyHash: createHash("sha256").update(key).digest("hex") });
      store.record(id, "video-submitted", { sceneNumber: number, requestId });
      if (complete) {
        const result = { providerUrl: `https://example.invalid/${requestId}.mp4`, expandedPrompt: null, timings: { requestId, queueWaitMs: null, inferenceMs: null, totalMs: 1 } };
        store.record(id, "video-completed", { sceneNumber: number, ...result });
        store.saveSceneMetadata({ teacherId, sessionId: id, sceneNumber: number, videoUrl: result.providerUrl, narration: plan.narration, summary: plan.summary, prompt: plan.prompt, expandedPrompt: null, timings: result.timings });
        writeFileSync(join(root, id, `scene-${String(number).padStart(2, "0")}.mp4`), "local-test-media-only");
      }
    }
    return { id, lesson };
  }
  const queries: string[] = [];
  const video: ConstructorParameters<typeof YouthRecordingRecovery>[2] = async input => {
    assert.ok(input.resumeRequestId, "recovery must never submit a new task");
    queries.push(input.resumeRequestId!);
    return { providerUrl: `https://example.invalid/${input.resumeRequestId}.mp4`, expandedPrompt: null, queueLogs: [], timings: { requestId: input.resumeRequestId!, queueWaitMs: null, inferenceMs: null, totalMs: 1 } };
  };
  return { root, store, wallet, download, record, queries, video };
}

test("process reconstruction collects six original IDs and reconstructs playable owner-scoped media", async t => {
  const h = fixture(t); const { id } = h.record("restart-opening");
  const providers = { plan: async () => { throw new Error("A planner POST is forbidden"); }, video: h.video!, download: h.download };
  const registry = new YouthRuntimeRegistry(h.wallet, () => h.store, providers);
  const runtime = registry.get(owner);
  assert.equal(registry.recoveryAction(owner, id), null, "all known IDs remain automatically recoverable");
  assert.ok(runtime.view(id));
  await registry.repair(owner, id); await flush();
  const state = runtime.view(id)!;
  assert.equal(h.queries.length, 6);
  assert.equal(state.ready.length, 6);
  assert.ok(state.ready.every(scene => scene.kind === "generated" && scene.videoUrl.startsWith("/api/youth/saved-video/")));
  assert.equal(new SavedClassrooms(h.root).load(id).lessons[0]?.scenes.length, 6);
  const baseline = readFileSync(join(h.root, id, "events.jsonl"), "utf8");
  const again = new YouthRuntimeRegistry(h.wallet, () => h.store, providers).get(owner);
  await flush();
  assert.equal(again.view(id)?.ready.length, 6);
  assert.equal(h.queries.length, 6, "complete local recordings do not even query a provider");
  assert.equal(readFileSync(join(h.root, id, "events.jsonl"), "utf8"), baseline, "completed historical logs are left untouched");
});

test("a queued command receipt survives restart and cannot buy another follow-up", async t => {
  const h = fixture(t), { id } = h.record("restart-command-root", "彩虹", 30, 6, true);
  const child = h.record("restart-command-child", "折射", 10, 2, true);
  h.store.record(id, "lesson-selection", { playlistId: id, sessionId: child.id, previousSessionId: id, position: 2,
    teacherId, topic: "折射", durationSeconds: 10, commandId: "queue-ack-lost" });
  let plans = 0;
  const registry = new YouthRuntimeRegistry(h.wallet, () => h.store, { plan: async () => { plans++; return output(2); }, video: h.video!, download: h.download });
  const runtime = registry.get(owner); await flush();
  const before = runtime.view(id)!;
  runtime.command(id, { kind: "queue-lesson", id: toCommandId("queue-ack-lost"), topic: "折射", atMs: 1 });
  await flush();
  assert.equal(runtime.view(id)!.playlist.length, before.playlist.length);
  assert.equal(runtime.view(id)!.warning, null, "a duplicate acknowledgement must not report an error");
  assert.equal(plans, 0);
});
test("unsubmitted shots and unknown receipts remain explicit gaps, never replacement purchases", async t => {
  const h = fixture(t); const { id } = h.record("partial-opening", "彩虹", 30, 2);
  const registry = new YouthRuntimeRegistry(h.wallet, () => h.store, { plan: async () => { throw new Error("no planner"); }, video: h.video!, download: h.download });
  const runtime = registry.get(owner); await registry.repair(owner, id); await flush();
  assert.match(registry.recoveryAction(owner, id)!, /尚未提交/, "unrecoverable gaps must not be described as an endless recovery");
  assert.equal(h.queries.length, 2);
  assert.equal(runtime.view(id)?.metrics.generatedScenes, 2);
  assert.equal(runtime.view(id)?.metrics.skippedScenes, 4);
  assert.deepEqual(await registry.repair(owner, id), { recovered: 2, pending: 4 });
  assert.equal(h.queries.length, 2);
  assert.equal(new SavedClassrooms(h.root, "/api/youth/saved-video", true).find("彩虹", teacherId)?.available, false);
});
test("recovery cannot use another wallet key for a bound receipt", async t => {
  const h = fixture(t); const { id } = h.record("bound-opening");
  const recovery = new YouthRecordingRecovery(h.store, () => "different-wallet", h.video!, h.download);
  const results = await Promise.all(recovery.jobs(id).jobs.map(job => job.collect()));
  assert.equal(h.queries.length, 0);
  assert.ok(results.every(result => !result.ok && /原钱包/.test(result.message)));
});
test("an incomplete child no longer blocks reuse of the fully saved opening", t => {
  const h = fixture(t); const { id } = h.record("full-opening", "彩虹", 30, 6, true);
  const child = h.record("incomplete-child", "折射", 10, 1);
  h.store.record(id, "lesson-selection", { playlistId: id, sessionId: child.id, previousSessionId: id, position: 2, teacherId, topic: "折射", durationSeconds: 10 });
  const saved = new SavedClassrooms(h.root, "/api/youth/saved-video", true);
  assert.equal(saved.find("彩虹", teacherId)?.available, true);
  assert.equal(saved.load(id).lessons.length, 1);
  assert.throws(() => saved.findLesson("折射", teacherId, 10), /已有未完成/);
});

test("a refreshed signed video URL remains replayable instead of being stuck in recovery", t => {
  const h = fixture(t), { id } = h.record("rotated-video-url", "彩虹", 30, 6, true);
  const metadata = h.store.sceneMetadata(id, 1) as Parameters<RecordingStore["saveSceneMetadata"]>[0];
  const refreshedUrl = "https://example.invalid/fresh-signed-url.mp4";
  h.store.record(id, "video-completed", { sceneNumber: 1, providerUrl: refreshedUrl, expandedPrompt: null, timings: metadata.timings });
  h.store.saveSceneMetadata({ ...metadata, videoUrl: refreshedUrl });
  assert.equal(new SavedClassrooms(h.root, "/api/youth/saved-video", true).find("彩虹", teacherId)?.available, true);
});

test("a torn final log append preserves earlier receipts and complete saved video lookup", t => {
  const h = fixture(t), { id } = h.record("torn-last-log", "彩虹", 30, 6, true);
  appendFileSync(join(h.root, id, "events.jsonl"), '{"kind":"unfinished');
  assert.equal(h.store.events(id).filter(e => e.kind === "video-submitted").length, 6);
  assert.equal(new SavedClassrooms(h.root, "/api/youth/saved-video", true).find("彩虹", teacherId)?.available, true);
});

test("a saved planner response closes the crash gap before lesson-prepared, with no planner POST", async t => {
  const h = fixture(t), { id } = h.record("stored-planner-response", "彩虹", 30, 6);
  const events = readFileSync(join(h.root, id, "events.jsonl"), "utf8").trim().split("\n").filter(line => JSON.parse(line).kind !== "lesson-prepared");
  writeFileSync(join(h.root, id, "events.jsonl"), events.join("\n") + "\n");
  h.store.record(id, "lesson-request", { topic: "彩虹", durationSeconds: 30, teacherId });
  h.store.record(id, "planner-response", { output: output(6) });
  const registry = new YouthRuntimeRegistry(h.wallet, () => h.store, { plan: async () => { throw new Error("A second planner POST is forbidden"); }, video: h.video!, download: h.download });
  const runtime = registry.get(owner); await registry.repair(owner, id); await flush();
  assert.equal(runtime.view(id)?.ready.length, 6); assert.equal(h.queries.length, 6);
  assert.equal(registry.recoveryAction(owner, id), null);
});
test("whole selected 30/10/10 path generates without browser playback, within two jobs", async t => {
  const h = fixture(t); const gate = Promise.withResolvers<string>();
  let planned = 0, rendered = 0, active = 0, maxActive = 0;
  const registry = new YouthRuntimeRegistry(h.wallet, () => h.store, {
    plan: async () => { planned++; return planned === 1 ? gate.promise : output(2); },
    video: async input => {
      assert.equal(input.resumeRequestId, undefined);
      rendered++; active++; maxActive = Math.max(active, maxActive);
      const requestId = `mock-new-${rendered}`; input.onSubmitted?.(requestId);
      await new Promise<void>(resolve => setImmediate(resolve)); active--;
      return { providerUrl: `https://example.invalid/${requestId}.mp4`, expandedPrompt: null, queueLogs: [], timings: { requestId, queueWaitMs: null, inferenceMs: null, totalMs: 1 } };
    }, download: h.download,
  });
  const runtime = registry.get(owner), id = toClassroomSessionId("background-course");
  runtime.create({ sessionId: id });
  runtime.command(id, { kind: "start", id: toCommandId("new-start"), teacherId, topic: "彩虹", durationSeconds: 30, atMs: 1 });
  runtime.command(id, { kind: "queue-lesson", id: toCommandId("q1"), topic: "折射", atMs: 1 });
  runtime.command(id, { kind: "queue-lesson", id: toCommandId("q2"), topic: "散射", atMs: 1 });
  gate.resolve(output(6));
  await waitFor(() => rendered === 10); // No polling, playback report, or view call is needed to schedule children.
  await waitFor(() => h.store.sessions().filter(id => h.store.events(id).filter(e => e.kind === "video-saved").length === 2).length === 2);
  assert.equal(planned, 3); assert.equal(rendered, 10); assert.equal(maxActive, 2);
  assert.equal(runtime.view(id)?.ready.length, 10);
  await runtime.clear(id, true);
});
test("preflight rejection creates no planner/video request and can be retried after fixing funds", async t => {
  const h = fixture(t); let plans = 0;
  const registry = new YouthRuntimeRegistry(h.wallet, () => h.store, {
    preflight: async () => { throw new Error("余额不足，未提交付费请求。"); },
    plan: async () => { plans++; return output(6); }, video: h.video!, download: h.download,
  });
  const runtime = registry.get(owner), id = toClassroomSessionId("low-balance");
  runtime.create({ sessionId: id }); runtime.command(id, { kind: "start", id: toCommandId("try-low"), teacherId, topic: "彩虹", durationSeconds: 30, atMs: 1 });
  await flush();
  assert.equal(plans, 0); assert.equal(h.queries.length, 0);
  assert.equal(runtime.view(id)?.phase, "complete");
  assert.equal(new SavedClassrooms(h.root, "/api/youth/saved-video", true).find("彩虹", teacherId), null, "no-spend preflight failures must not poison the recording cache");
});
test("exit during planning stops new submissions, but preserves the received script", async t => {
  const h = fixture(t), gate = Promise.withResolvers<string>(); let videos = 0;
  const registry = new YouthRuntimeRegistry(h.wallet, () => h.store, {
    plan: async () => gate.promise, video: async () => { videos++; throw new Error("no new videos after exit"); }, download: h.download,
  });
  const runtime = registry.get(owner), id = toClassroomSessionId("abandon-planning");
  runtime.create({ sessionId: id }); runtime.command(id, { kind: "start", id: toCommandId("begin-abandon"), teacherId, topic: "彩虹", durationSeconds: 30, atMs: 1 });
  await flush(2); assert.equal(await runtime.clear(id, true), true);
  gate.resolve(output(6)); await flush();
  assert.equal(videos, 0); assert.equal(runtime.view(id), null);
  assert.ok(h.store.events(id).some(event => event.kind === "lesson-prepared"));
});

test("exit while a read-only budget check is pending cannot submit a paid planner afterwards", async t => {
  const h = fixture(t), quote = Promise.withResolvers<{ amountCny: number; durationSeconds: number; quotedAt: string; videoRateCny: number }>();
  let plans = 0, closed = 0;
  const registry = new YouthRuntimeRegistry(h.wallet, () => h.store, {
    preflight: async () => quote.promise,
    plan: async () => { plans++; return output(6); }, video: h.video!, download: h.download,
    budget: { begin() {}, finish() {}, complete() {}, uncertain() {}, restore() {}, close() { closed++; } },
  });
  const runtime = registry.get(owner), id = toClassroomSessionId("exit-during-preflight");
  runtime.create({ sessionId: id }); runtime.command(id, { kind: "start", id: toCommandId("submit-and-exit"), teacherId, topic: "彩虹", durationSeconds: 30, atMs: 1 });
  await flush(2); await runtime.clear(id, true);
  quote.resolve({ amountCny: 17, durationSeconds: 30, quotedAt: "fixture", videoRateCny: .5 });
  await flush(); assert.equal(plans, 0); assert.equal(h.queries.length, 0); assert.ok(closed >= 2, "late reservation is released too");
});

test("a saved opening can grow a manually selected new branch without rebuying the opening", async t => {
  const h = fixture(t), source = h.record("saved-original", "彩虹", 30, 6, true);
  const baseline = readFileSync(join(h.root, source.id, "events.jsonl"), "utf8");
  let plans = 0, videos = 0, preflights = 0;
  const registry = new YouthRuntimeRegistry(h.wallet, () => h.store, {
    preflight: async (_id, _key, input) => { preflights++; assert.equal(input.durationSeconds, 10); return { amountCny: 6, videoRateCny: .5, durationSeconds: 10, quotedAt: new Date().toISOString() }; },
    plan: async () => { plans++; return output(2); },
    video: async input => { videos++; const requestId = `new-branch-${videos}`; input.onSubmitted?.(requestId); return { providerUrl: `https://example.invalid/${requestId}.mp4`, expandedPrompt: null, queueLogs: [], timings: { requestId, totalMs: 1, queueWaitMs: null, inferenceMs: null } }; },
    download: h.download,
  });
  const runtime = registry.get(owner), id = toClassroomSessionId("replayed-new-path");
  runtime.create({ sessionId: id });
  runtime.replay(id, new SavedClassrooms(h.root).load(source.id), toCommandId("replay-command"));
  const command = { kind: "queue-lesson", id: toCommandId("new-branch-choice"), topic: "新分支", atMs: 1 } as const;
  runtime.command(id, command); runtime.command(id, command);
  await waitFor(() => videos === 2);
  await waitFor(() => h.store.sessions().some(sessionId => sessionId.startsWith("playlist-child") && h.store.events(sessionId).filter(event => event.kind === "video-saved").length === 2));
  assert.equal(preflights, 1); assert.equal(plans, 1); assert.equal(videos, 2);
  const path = new SavedClassrooms(h.root).load(id);
  assert.equal(path.lessons.length, 2); assert.equal(path.lessons[0]?.scenes.length, 6);
  assert.equal(readFileSync(join(h.root, source.id, "events.jsonl"), "utf8"), baseline);
  await runtime.clear(id, true);
});
