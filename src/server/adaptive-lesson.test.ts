import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparationPrompt } from "@/lib/classroom-config";
import { parseLessonPlan, toClassroomSessionId, toCommandId } from "@/lib/classroom-boundaries";
import { parseInitialLesson } from "./lesson-plan";
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
