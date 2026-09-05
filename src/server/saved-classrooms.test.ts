import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseClassroomApiResponse, parseClassroomCommand, toClassroomSessionId, toCommandId } from "@/lib/classroom-boundaries";
import { recordingTopicKey } from "@/lib/saved-classroom";
import type { LessonDurationSeconds, LessonLedger, TeacherId } from "@/lib/classroom-types";
import { compileLessonScene, parseInitialLesson } from "@/server/lesson-plan";
import { RecordingStore } from "@/server/recording-store";
import { SavedClassrooms } from "@/server/saved-classrooms";
import { ClassroomRuntime, SAVED_LESSON_LOADING_MS } from "@/server/classroom-runtime";
import { ClassroomPlaylistRuntime } from "@/server/classroom-playlist-runtime";
import { recordedVideoResponse } from "@/server/recording-media";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "saved-classroom-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new RecordingStore(root);
  const id = toClassroomSessionId("saved-gravity");
  const topics = ["测试重力原理", "测试失去重力", "测试大气层"];
  const ids = [id, toClassroomSessionId("saved-child-one"), toClassroomSessionId("saved-child-two")];
  for (const [index, sessionId] of ids.entries()) {
    const durationSeconds: LessonDurationSeconds = index === 0 ? 30 : 10;
    const teacherId: TeacherId = "monokuma";
    const topic = topics[index]!;
    const lesson = parseInitialLesson({ topic, teacherId, durationSeconds, latencyMs: 1, preparedBy: "fixture", output: JSON.stringify({
      title: topic, bigQuestion: topic, suggestedTopics: ["测试失去重力", "测试大气层", "未保存的问题"],
      steps: Array.from({ length: durationSeconds / 5 }, () => ({ role: "mechanism", narration: "小球落到了地面。", concept: "引力", visualAction: "Monokuma releases a ball." })),
    }) });
    store.record(id, "lesson-selection", { playlistId: id, sessionId, previousSessionId: index === 0 ? null : ids[index - 1], position: index + 1, topic, durationSeconds, teacherId });
    store.record(sessionId, "lesson-prepared", { result: { ok: true, lesson } });
    let ledger: LessonLedger = { nextStepIndex: 0, conceptsPlanned: [], recentNarrations: [], recentVisuals: [] };
    for (const step of lesson.steps) {
      const plan = compileLessonScene({ lesson, ledger, sceneNumber: step.position, purpose: { kind: "lesson", stepId: step.id } });
      ledger = plan.ledgerAfter;
      const videoUrl = `https://example.com/${sessionId}-${step.position}.mp4`;
      const timings = { requestId: `fixture-${sessionId}-${step.position}`, queueWaitMs: 1, inferenceMs: 2, totalMs: 3 };
      store.record(sessionId, "video-request", { sceneNumber: step.position, plan });
      store.record(sessionId, "video-completed", { sceneNumber: step.position, providerUrl: videoUrl, timings });
      store.saveSceneMetadata({ teacherId, sessionId, sceneNumber: step.position, videoUrl, narration: plan.narration, summary: plan.summary, prompt: plan.prompt, expandedPrompt: null, timings });
      writeFileSync(join(root, sessionId, `scene-${String(step.position).padStart(2, "0")}.mp4`), Buffer.from("0123456789abcdef"));
    }
  }
  const saved = new SavedClassrooms(root);
  return { root, id, ids, topics, saved };
}

function runtime() {
  const providerCalls: string[] = [];
  const worker = new ClassroomRuntime({
    configured: () => false, fixture: () => true,
    prepare: async () => { providerCalls.push("prepare"); throw new Error("No planner may run"); },
    compile: () => { providerCalls.push("compile"); throw new Error("No scene may be recompiled"); },
    render: async () => { providerCalls.push("render"); throw new Error("No video may be generated"); },
    clear: async () => {},
  });
  const playlist = new ClassroomPlaylistRuntime(worker, () => { providerCalls.push("paid-selection-record"); });
  return { worker, playlist, providerCalls };
}

test("the same topic and teacher select the complete saved 30/10/10 path with local videos", (t) => {
  const { saved, id, topics } = fixture(t);
  assert.equal(saved.find(`  ${topics[0]}  `, "monokuma")!.recordingId, id);
  assert.equal(saved.find(topics[0]!, "monomi"), null);
  assert.equal(saved.find("另一个问题", "monokuma"), null);
  assert.equal(recordingTopicKey(" Gravity   原理 "), recordingTopicKey("gravity 原理"));
  const course = saved.load(id);
  assert.deepEqual(course.lessons.map((lesson) => lesson.scenes.length), [6, 2, 2]);
  assert.equal(course.lessons[0]!.scenes[0]!.segment.videoUrl, `/api/saved-video/${id}/1`);
  assert.equal(course.lessons[0]!.scenes[0]!.segment.captions[0]!.text, "小球落到了地面。");
});

test("missing and mismatched saved clips stay matched and fail instead of permitting new generation", (t) => {
  const { saved, root, id, topics } = fixture(t);
  const metadata = join(root, id, "scene-01.json");
  const original = readFileSync(metadata, "utf8");
  writeFileSync(metadata, JSON.stringify({ ...JSON.parse(original), teacherId: "monomi" }));
  assert.equal(saved.find(topics[0]!, "monokuma")!.available, false);
  assert.throws(() => saved.load(id), /does not match/);
  writeFileSync(metadata, original);
  rmSync(join(root, id, "scene-01.mp4"));
  assert.equal(saved.find(topics[0]!, "monokuma")!.available, false);
  assert.throws(() => saved.load(id), /ENOENT/);
});

test("all ten saved scenes play after a 4.5-second loading beat, with no provider work or paid selection records", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { saved, id, topics } = fixture(t);
  const { playlist, providerCalls } = runtime();
  const liveId = toClassroomSessionId("demo-again");
  playlist.create({ sessionId: liveId });
  let commandNumber = 0;
  const command = (body: Record<string, unknown>) => playlist.command(liveId, parseClassroomCommand({ id: `again-${++commandNumber}`, atMs: 1, ...body }))!;
  const begin = toCommandId("saved-start");
  const loading = playlist.replay(liveId, saved.load(id), begin)!;
  assert.equal(loading.snapshot.production.kind, "preparing");
  assert.equal(loading.snapshot.lesson, null, "saved titles and suggestions wait for loading to finish");
  assert.equal(loading.snapshot.ready.length, 0);
  assert.deepEqual(playlist.replay(liveId, saved.load(id), begin), loading);
  let total = 0;
  for (let index = 0; index < topics.length; index += 1) {
    if (index > 0) command({ kind: "queue-lesson", topic: topics[index] });
    t.mock.timers.tick(SAVED_LESSON_LOADING_MS - 1);
    assert.equal(playlist.view(liveId)!.ready.length, 0);
    assert.equal(playlist.view(liveId)!.lesson, null, "every selected lesson hides its metadata during loading");
    t.mock.timers.tick(1);
    assert.equal(playlist.view(liveId)!.lesson!.topic, topics[index]);
    const ready = playlist.view(liveId)!.ready;
    assert.equal(ready.length, index === 0 ? 6 : 2);
    command({ kind: "report-playback", report: { kind: "started", sceneId: ready[0]!.id, atMs: 2 } });
    for (let scene = 1; scene < ready.length; scene += 1) {
      command({ kind: "report-playback", report: { kind: "advanced", finishedSceneId: ready[scene - 1]!.id, startedSceneId: ready[scene]!.id, atMs: 3 + scene } });
    }
    command({ kind: "report-playback", report: { kind: "drained", finishedSceneId: ready.at(-1)!.id, atMs: 20 } });
    const state = playlist.view(liveId)!;
    assert.equal(state.phase, "complete");
    assert.equal(state.metrics.estimatedSpendCents, 0);
    assert.equal(state.metrics.activeVideoJobs, 0);
    assert.ok(parseClassroomApiResponse({ ok: true, outcome: { kind: "snapshot", snapshot: state } }).ok);
    total += ready.length;
    if (index === 0) {
      const rejected = command({ kind: "queue-lesson", topic: "未保存的问题" });
      assert.equal(rejected.snapshot.playlist.length, 1);
      assert.match(rejected.snapshot.warning!, /没有保存/);
    }
  }
  assert.equal(total, 10);
  assert.deepEqual(providerCalls, []);
});

test("stopping during loading cancels delayed media, including after the same ID is recreated", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { saved, id } = fixture(t);
  const { worker, providerCalls } = runtime();
  const liveId = toClassroomSessionId("stop-saved-loading");
  worker.create({ sessionId: liveId });
  worker.replay(liveId, saved.load(id).lessons[0]!);
  worker.command(liveId, parseClassroomCommand({ kind: "stop-after-committed", id: "stop", atMs: 1 }));
  assert.equal(await worker.clear(liveId), true);
  worker.create({ sessionId: liveId });
  t.mock.timers.tick(SAVED_LESSON_LOADING_MS);
  assert.equal(worker.view(liveId)!.production.kind, "idle");
  assert.equal(worker.view(liveId)!.ready.length, 0);
  assert.deepEqual(providerCalls, []);
});

test("saved videos support full responses, byte ranges, suffix ranges, and HEAD", async (t) => {
  const { saved, id } = fixture(t);
  const path = saved.mediaPath(id, 1);
  const full = recordedVideoResponse(path, null);
  assert.equal(full.status, 200);
  assert.equal(await full.text(), "0123456789abcdef");
  const partial = recordedVideoResponse(path, "bytes=2-5");
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 2-5/16");
  assert.equal(await partial.text(), "2345");
  assert.equal(await recordedVideoResponse(path, "bytes=-3").text(), "def");
  const head = recordedVideoResponse(path, null, true);
  assert.equal(head.headers.get("content-length"), "16");
  assert.equal(await head.text(), "");
  for (const invalid of ["bytes=20-30", "bytes=5-2", "bytes=-0", "bytes=", "bytes=0-1,4-5"]) {
    assert.equal(recordedVideoResponse(path, invalid).status, 416);
  }
});

test("media access rejects path traversal, out-of-range scenes, and symlinks", (t) => {
  const { saved, root, id } = fixture(t);
  assert.throws(() => saved.mediaPath("../elsewhere" as typeof id, 1));
  assert.throws(() => saved.mediaPath(id, 7));
  const path = join(root, id, "scene-01.mp4");
  rmSync(path);
  symlinkSync(join(root, id, "scene-02.mp4"), path);
  assert.throws(() => saved.mediaPath(id, 1), /local file/);
});
