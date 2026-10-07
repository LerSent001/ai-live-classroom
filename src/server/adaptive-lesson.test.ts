import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLASSROOM_CONFIG, preparationPrompt } from "@/lib/classroom-config";
import { parseLessonPlan, toClassroomSessionId, toCommandId } from "@/lib/classroom-boundaries";
import { compileLessonScene, parseInitialLesson } from "./lesson-plan";
import { generateTokenDanceVideo } from "./youth-tokenpay-video";
import type { LessonLedger } from "@/lib/classroom-types";
import { RecordingStore } from "./recording-store";
import { SavedClassrooms } from "./saved-classrooms";
import { YouthRuntimeRegistry } from "./youth-classroom-runtime";

const teacherId = "youth-mentor-male" as const, topic = "彩虹为什么出现？", owner = "c".repeat(64);
const output = (durationSeconds: number, count = durationSeconds / 5, narration = "水滴让阳光折射成不同颜色。") => JSON.stringify({
  durationSeconds, durationReason: "只有这些解释是必要的", title: "彩虹的颜色", bigQuestion: topic, suggestedTopics: ["认识折射", "认识散射", "水滴的作用"],
  steps: Array.from({ length: count }, () => ({ role: "mechanism", narration, concept: "折射", visualAction: "The mentor shows a ray entering a droplet." })),
});
const waitFor = async (check: () => boolean) => {
  for (let n = 0; n < 500 && !check(); n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(check(), "local fixture work must settle");
};

for (const duration of [15, 20, 25, 30] as const) test(`a ${duration}-second opening submits exactly ${duration / 5} clips and remains replayable after restart`, async t => {
  const root = mkdtempSync(join(tmpdir(), "adaptive-lesson-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new RecordingStore(root, "no-spend-unit-fixture");
  const wallet = { get: () => "not-a-real-key", revision: () => 0 };
  let plans = 0, clips = 0;
  const quotes: number[] = [];
  const providers = {
    preflight: async (_id: string, _key: string, lesson: { durationSeconds: number }) => { quotes.push(lesson.durationSeconds); return { amountCny: 1, durationSeconds: lesson.durationSeconds, quotedAt: "fixture", videoRateCny: .5 }; },
    plan: async (input: { prompt: string }) => { plans++; assert.match(input.prompt, /shortest sufficient duration/); return output(duration); },
    video: async () => ({ providerUrl: `https://example.invalid/clip-${++clips}.mp4`, expandedPrompt: null, queueLogs: [], timings: { requestId: `fixture-${clips}`, queueWaitMs: null, inferenceMs: null, totalMs: 1 } }),
    // Container signature only; browser tests separately prove decoding of real cached media.
    download: async () => new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0])),
  };
  const registry = new YouthRuntimeRegistry(wallet, () => store, providers);
  const runtime = registry.get(owner), id = toClassroomSessionId(`adaptive-${duration}`);
  runtime.create({ sessionId: id });
  runtime.command(id, { kind: "start", id: toCommandId(`start-${duration}`), topic, teacherId, durationSeconds: 30, atMs: 1 });
  await waitFor(() => runtime.view(id)?.ready.length === duration / 5);
  const state = runtime.view(id)!;
  assert.equal(state.lesson?.durationSeconds, duration); assert.equal(state.lesson?.targetSceneCount, duration / 5);
  assert.equal(parseLessonPlan(state.lesson).durationSeconds, duration);
  assert.equal(plans, 1); assert.equal(clips, duration / 5); assert.equal(state.warning, null);
  assert.deepEqual(quotes, [30, duration], "reserve the ceiling before planning, then shrink to the actual map");
  const saved = new SavedClassrooms(root, "/api/youth/saved-video", true);
  assert.equal(saved.find(topic, teacherId)?.available, true);
  const restored = new YouthRuntimeRegistry(wallet, () => store, { ...providers, plan: async () => { throw new Error("restart must not plan"); }, video: async () => { throw new Error("restart must not regenerate"); } }).get(owner);
  await waitFor(() => restored.view(id)?.ready.length === duration / 5);
  assert.equal(restored.view(id)?.lesson?.durationSeconds, duration);
  const replayId = toClassroomSessionId(`replay-${duration}`); restored.create({ sessionId: replayId });
  restored.replay(replayId, saved.load(id), toCommandId(`replay-start-${duration}`));
  assert.equal(saved.load(replayId).lessons[0]?.lesson.durationSeconds, duration, "a replay-source preserves a short opening");
});

test("duration, scene count and speech limits are checked before video admission", () => {
  const input = { topic, teacherId, durationSeconds: 30 as const, adaptiveOpening: true, latencyMs: 0, preparedBy: "fixture" };
  for (const invalid of [10, 17, 35]) assert.throws(() => parseInitialLesson({ ...input, output: output(invalid) }), /规划必须/);
  assert.throws(() => parseInitialLesson({ ...input, output: output(15, 4) }), /exactly 3/);
  assert.throws(() => parseInitialLesson({ ...input, output: output(15, 3, "这是一个非常非常非常非常非常非常非常非常非常非常非常长的句子。") }), /台词超过/);
  const legacy = parseInitialLesson({ ...input, adaptiveOpening: false, output: output(30) });
  assert.equal(legacy.durationSeconds, 30); assert.equal(legacy.steps.length, 6);
  assert.match(preparationPrompt(topic, 6, teacherId), /Exactly 6 ordered steps/);
});

for (const duration of [15, 20, 25, 30] as const) {
  test(`${duration}s exposes the first two clips while later renders are still pending`, async () => {
    let plans = 0, jobs = 0, maxJobs = 0;
    const pending: ReturnType<typeof Promise.withResolvers<void>>[] = [];
    const registry = new YouthRuntimeRegistry({ get: () => "not-a-real-key", revision: () => 0 }, () => null, {
      plan: async () => { plans++; return output(duration); },
      video: async () => {
        const receipt = pending.length + 1;
        const deferred = Promise.withResolvers<void>(); pending.push(deferred);
        maxJobs = Math.max(maxJobs, ++jobs);
        await deferred.promise; jobs--;
        return { providerUrl: `https://example.invalid/${receipt}.mp4`, expandedPrompt: null, queueLogs: [], timings: { requestId: `fixture-${receipt}`, queueWaitMs: null, inferenceMs: null, totalMs: 1 } };
      },
    });
    const runtime = registry.get(owner), id = toClassroomSessionId(`streaming-${duration}`);
    runtime.create({ sessionId: id });
    runtime.command(id, { kind: "start", id: toCommandId(`stream-start-${duration}`), topic, teacherId, durationSeconds: 30, atMs: 1 });
    await waitFor(() => pending.length === 2);
    pending[1].resolve(); await waitFor(() => pending.length === 3);
    assert.equal(runtime.view(id)?.ready.length, 0, "out-of-order scene 2 must not skip unfinished scene 1");
    pending[0].resolve(); await waitFor(() => runtime.view(id)?.ready.length === 2);
    const first = runtime.view(id)!;
    assert.equal(first.policy.startupRunwayScenes, 2);
    assert.ok(first.scenes.some(scene => scene.kind === "generating"));
    assert.ok(first.ready.length < first.lesson!.targetSceneCount, "startup must not await the whole map");
    runtime.command(id, { kind: "report-playback", id: toCommandId(`stream-play-${duration}`), report: { kind: "started", sceneId: first.ready[0]!.id, atMs: 10 } });
    assert.equal(runtime.view(id)?.playback.kind, "playing");
    for (let n = 2; n < duration / 5; n++) {
      await waitFor(() => pending.length > n); pending[n].resolve();
    }
    await waitFor(() => runtime.view(id)?.scenes.every(scene => scene.kind !== "generating") === true);
    assert.equal(plans, 1); assert.equal(pending.length, duration / 5);
    assert.equal(maxJobs, CLASSROOM_CONFIG.videoConcurrency);
  });

  test(`${duration}s planned beats arrive verbatim in the actual video POST body`, async () => {
    const lesson = parseInitialLesson({ topic, teacherId, durationSeconds: 30, adaptiveOpening: true, output: output(duration), latencyMs: 0, preparedBy: "local-fixture" });
    let ledger: LessonLedger = { nextStepIndex: 0, conceptsPlanned: [], recentNarrations: [], recentVisuals: [] };
    let submits = 0;
    for (const step of lesson.steps) {
      const scene = compileLessonScene({ lesson, ledger, sceneNumber: step.position, purpose: { kind: "lesson", stepId: step.id } });
      ledger = scene.ledgerAfter;
      await generateTokenDanceVideo({ prompt: scene.prompt, apiKey: "not-a-real-key" }, {
        request: async (_url, init) => {
          if (init?.method === "POST") {
            submits++;
            const body = JSON.parse(String(init.body));
            assert.equal(body.duration, 5);
            assert.equal(body.content[0].text, scene.prompt);
            assert.ok(body.content[0].text.includes(`Five-second 16:9 scene ${step.position}`));
            assert.ok(body.content[0].text.includes(step.visualAction.replace(/\.$/, "")));
            assert.ok(body.content[0].text.includes(`"${step.narration}"`));
            return Response.json({ task_id: `local-receipt-${submits}` });
          }
          return Response.json({ task: { status: "succeeded", content: { url: "https://example.invalid/local.mp4" } } });
        },
      });
    }
    assert.equal(submits, duration / 5);
  });
}
