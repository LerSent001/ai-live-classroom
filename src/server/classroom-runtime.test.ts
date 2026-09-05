import assert from "node:assert/strict";
import test from "node:test";
import {
  toClassroomSessionId,
  toCommandId,
  toLessonStepId,
  toPrompt,
} from "@/lib/classroom-boundaries";
import { CLASSROOM_CONFIG, TEACHERS, quoteForDuration, sceneCountForDuration } from "@/lib/classroom-config";
import type { ClassroomRuntimeDependencies } from "@/server/classroom-runtime";
import { ClassroomPlaylistRuntime } from "@/server/classroom-playlist-runtime";
import { ClassroomRuntime } from "@/server/classroom-runtime";
import type {
  LessonDurationSeconds,
  LessonLedger,
  LessonPlan,
  TeacherId,
  PreparationResult,
  RenderResult,
  ScenePurpose,
  ValidatedScenePlan,
} from "@/lib/classroom-types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out waiting for classroom state");
}

function lesson(durationSeconds: LessonDurationSeconds = 30, teacherId: TeacherId = "monokuma"): LessonPlan {
  const targetSceneCount = sceneCountForDuration(durationSeconds);
  return {
    teacherId,
    topic: "Why does the Moon have phases?",
    title: "Moon Shapes",
    bigQuestion: "Why does the Moon look different through the month?",
    durationSeconds,
    targetSceneCount,
    steps: Array.from({ length: targetSceneCount }, (_, index) => ({
      id: toLessonStepId(`step-${index + 1}`),
      position: index + 1,
      role: index === 0 ? "hook" : index === targetSceneCount - 1 ? "recap" : index === 3 ? "transition" : "mechanism",
      title: `Beat ${index + 1}`,
      teachingGoal: `Teach distinct fact ${index + 1}`,
      narration: `Lesson fact ${index + 1} moves forward.`,
      concept: `Distinct fact ${index + 1}`,
      summary: `Summary ${index + 1}`,
      visualAction: `${TEACHERS[teacherId].name} demonstrates scene ${index + 1}.`,
      required: true,
    })),
    preparedBy: "test-planner",
    preparationLatencyMs: 2,
    suggestedTopics: [
      "How are eclipses different from Moon phases?",
      "Why does the Moon always show us one face?",
      "How do Moon phases affect ocean tides?",
    ],
  };
}

function initialLedger(): LessonLedger {
  return {
    nextStepIndex: 0,
    conceptsPlanned: [],
    recentNarrations: [],
    recentVisuals: [],
  };
}

function planFor(
  sceneNumber: number,
  purpose: ScenePurpose,
  ledger: LessonLedger,
): ValidatedScenePlan {
  const narration = `Lesson fact ${ledger.nextStepIndex + 1} moves forward.`;
  return {
    validation: "validated", teacherId: "monokuma",
    sceneNumber,
    purpose,
    prompt: toPrompt(`H3 prompt for scene ${sceneNumber}`),
    narration,
    captions: [{ startSeconds: 0.2, endSeconds: 4.8, text: narration }],
    concept: narration,
    summary: narration,
    visualAction: `${TEACHERS.monokuma.name} demonstrates scene ${sceneNumber}.`,
    ledgerAfter: {
      nextStepIndex: ledger.nextStepIndex + 1,
      conceptsPlanned: [...ledger.conceptsPlanned, narration],
      recentNarrations: [...ledger.recentNarrations, narration].slice(-4),
      recentVisuals: [...ledger.recentVisuals, `visual-${sceneNumber}`].slice(-4),
    },
  };
}

function createHarness(input?: {
  preparation?: Promise<PreparationResult>;
  compilationFailure?: string;
}) {
  const prepareCalls: string[] = [];
  const compileCalls: ScenePurpose[] = [];
  const renders: Array<{ result: ReturnType<typeof deferred<RenderResult>> }> = [];
  const dependencies: ClassroomRuntimeDependencies = {
    configured: () => true,
    fixture: () => true,
    prepare: async ({ topic, durationSeconds, teacherId }) => {
      prepareCalls.push(topic);
      return input?.preparation ?? {
        ok: true,
        lesson: lesson(durationSeconds, teacherId),
        ledger: initialLedger(),
        plannerAttemptsUsed: 1,
      };
    },
    compile: ({ sceneNumber, purpose, ledger }) => {
      compileCalls.push(purpose);
      if (input?.compilationFailure) throw new Error(input.compilationFailure);
      return planFor(sceneNumber, purpose, ledger);
    },
    render: async () => {
      const result = deferred<RenderResult>();
      renders.push({ result });
      return result.promise;
    },
    clear: async () => {},
  };
  return {
    runtime: new ClassroomRuntime(dependencies),
    prepareCalls,
    compileCalls,
    renders,
  };
}

function successfulRender(index: number): RenderResult {
  return {
    ok: true,
    videoUrl: `https://example.com/scene-${index}.mp4`,
    providerUrl: `https://example.com/scene-${index}.mp4`,
    expandedPrompt: null,
    timings: {
      requestId: `request-${index}`,
      queueWaitMs: 100,
      inferenceMs: 1_500,
      totalMs: 2_000,
    },
  };
}

test("duration quotes cover the 30 + 10 + 10 second demo", () => {
  assert.deepEqual(quoteForDuration(30), {
    sceneCount: 6,
    expectedCents: 30,
    protectedMaximumCents: 30,
  });
  assert.deepEqual(quoteForDuration(10), {
    sceneCount: 2,
    expectedCents: 10,
    protectedMaximumCents: 10,
  });
});

test("creating and viewing an idle classroom performs no provider work", () => {
  const harness = createHarness();
  const sessionId = toClassroomSessionId("classroom-idle");
  const created = harness.runtime.create({ sessionId });
  assert.equal(created.phase, "idle");
  assert.equal(created.metrics.estimatedSpendCents, 0);
  assert.equal(harness.prepareCalls.length, 0);
  assert.equal(harness.renders.length, 0);
});

test("a local compilation failure sends no request to H3", async () => {
  const harness = createHarness({ compilationFailure: "invalid compiled scene" });
  const sessionId = toClassroomSessionId("classroom-invalid-plan");
  harness.runtime.create({ sessionId });
  harness.runtime.command(sessionId, {
    kind: "start", teacherId: "monokuma",
    id: toCommandId("command-start-invalid"),
    topic: "Why does the Moon have phases?",
    durationSeconds: 30,
    atMs: 1,
  });
  await waitFor(() => harness.runtime.view(sessionId)?.production.kind === "draining");
  assert.equal(harness.renders.length, 0);
  assert.equal(harness.runtime.view(sessionId)?.scenes[0]?.kind, "rejected");
});

test("render completions remain ordered even when the second finishes first", async () => {
  const harness = createHarness();
  const sessionId = toClassroomSessionId("classroom-render-order");
  harness.runtime.create({ sessionId });
  harness.runtime.command(sessionId, {
    kind: "start", teacherId: "monokuma",
    id: toCommandId("command-start-order"),
    topic: "Why does the Moon have phases?",
    durationSeconds: 30,
    atMs: 1,
  });
  await waitFor(() => harness.renders.length === 2);
  harness.renders[1]?.result.resolve(successfulRender(2));
  await waitFor(() => harness.runtime.view(sessionId)?.scenes[1]?.kind === "ready");
  assert.equal(harness.runtime.view(sessionId)?.ready.length, 0);
  harness.renders[0]?.result.resolve(successfulRender(1));
  await waitFor(() => harness.runtime.view(sessionId)?.ready.length === 2);
  assert.deepEqual(harness.runtime.view(sessionId)?.ready.map((segment) => segment.number), [1, 2]);
});

test("two H3 slots start immediately while two ready scenes unlock playback", async () => {
  const harness = createHarness();
  const sessionId = toClassroomSessionId("classroom-fast-start");
  harness.runtime.create({ sessionId });
  harness.runtime.command(sessionId, {
    kind: "start", teacherId: "monokuma",
    id: toCommandId("command-fast-start"),
    topic: "How do humans see color?",
    durationSeconds: 30,
    atMs: 1,
  });

  await waitFor(() => harness.renders.length === 2);
  assert.equal(CLASSROOM_CONFIG.startupRunwayScenes, 2);

  harness.renders[0]?.result.resolve(successfulRender(1));
  harness.renders[1]?.result.resolve(successfulRender(2));
  await waitFor(() => harness.runtime.view(sessionId)?.ready.length === 2);
  const firstScene = harness.runtime.view(sessionId)?.ready[0];
  assert.ok(firstScene);

  harness.runtime.command(sessionId, {
    kind: "report-playback",
    id: toCommandId("command-fast-start-playing"),
    report: { kind: "started", sceneId: firstScene.id, atMs: 2 },
  });

  await waitFor(() => harness.renders.length === 4);
  assert.equal(harness.runtime.view(sessionId)?.playback.kind, "playing");
  assert.equal(harness.runtime.view(sessionId)?.committedThrough, 4);

  harness.renders[2]?.result.resolve(successfulRender(3));
  await waitFor(() => harness.renders.length === 5);
  assert.equal(harness.runtime.view(sessionId)?.metrics.activeVideoJobs, 2);
});

test("the complete selected demo makes exactly 6 + 2 + 2 renders and admits no third follow-up", async () => {
  const harness = createHarness();
  const playlist = new ClassroomPlaylistRuntime(harness.runtime);
  const sessionId = toClassroomSessionId("classroom-complete-demo");
  playlist.create({ sessionId });
  playlist.command(sessionId, { kind: "start", teacherId: "monokuma", id: toCommandId("demo-start"), topic: "Why does the Moon have phases?", durationSeconds: 30, atMs: 1 });
  let totalRenders = 0;
  for (const [lessonIndex, clipCount] of [6, 2, 2].entries()) {
    if (lessonIndex > 0) {
      const command = { kind: "queue-lesson" as const, id: toCommandId(`demo-choice-${lessonIndex}`), topic: `Explain related lunar idea ${lessonIndex}`, atMs: 2 };
      playlist.command(sessionId, command);
      playlist.command(sessionId, command); // A duplicate click must not add work.
    }
    for (let index = 0; index < clipCount; index += 1) {
      await waitFor(() => harness.renders.length > totalRenders);
      harness.renders[totalRenders]!.result.resolve(successfulRender(totalRenders + 1));
      totalRenders += 1;
      await waitFor(() => Boolean(playlist.view(sessionId)?.ready.length));
      const scene = playlist.view(sessionId)!.ready[0]!;
      playlist.command(sessionId, { kind: "report-playback", id: toCommandId(`demo-play-${totalRenders}`), report: { kind: "started", sceneId: scene.id, atMs: 3 } });
      playlist.command(sessionId, { kind: "report-playback", id: toCommandId(`demo-end-${totalRenders}`), report: { kind: "drained", finishedSceneId: scene.id, atMs: 4 } });
    }
    await waitFor(() => playlist.view(sessionId)?.phase === "complete");
    assert.equal(harness.renders.length, totalRenders);
    assert.equal(harness.prepareCalls.length, lessonIndex + 1);
    assert.equal(playlist.view(sessionId)?.lesson?.durationSeconds, lessonIndex === 0 ? 30 : 10);
  }
  const denied = playlist.command(sessionId, { kind: "queue-lesson", id: toCommandId("demo-excess-choice"), topic: "An unwanted third follow-up", atMs: 5 });
  assert.equal(denied?.snapshot.playlist.length, 3);
  assert.match(denied!.snapshot.warning!, /limited to 50 seconds/);
  assert.equal(harness.renders.length, 10);
  assert.equal(harness.prepareCalls.length, 3);
  assert.equal(denied?.snapshot.metrics.estimatedSpendCents, 50);
});

test("provider failure stops new clips and cancels a selected but unstarted follow-up", async () => {
  const harness = createHarness();
  const playlist = new ClassroomPlaylistRuntime(harness.runtime);
  const sessionId = toClassroomSessionId("classroom-stop-after-failure");
  playlist.create({ sessionId });
  playlist.command(sessionId, { kind: "start", teacherId: "monokuma", id: toCommandId("failure-start"), topic: "Why does the Moon have phases?", durationSeconds: 30, atMs: 1 });
  playlist.command(sessionId, { kind: "queue-lesson", id: toCommandId("failure-choice"), topic: "Explain related lunar ideas", atMs: 2 });
  await waitFor(() => harness.renders.length === 2);
  harness.renders[0]!.result.resolve({ ok: false, reason: "render-failed", message: "Unauthorized" });
  harness.renders[1]!.result.resolve(successfulRender(2));
  await waitFor(() => playlist.view(sessionId)?.metrics.activeVideoJobs === 0);
  assert.equal(harness.renders.length, 2);
  assert.equal(harness.prepareCalls.length, 1);
  assert.equal(playlist.view(sessionId)?.playlist[1]?.kind, "failed");
  assert.match(playlist.view(sessionId)!.warning!, /Unauthorized/);
  for (const scene of playlist.view(sessionId)!.ready) {
    playlist.command(sessionId, { kind: "report-playback", id: toCommandId(`failure-play-${scene.number}`), report: { kind: "started", sceneId: scene.id, atMs: 3 } });
    playlist.command(sessionId, { kind: "report-playback", id: toCommandId(`failure-drain-${scene.number}`), report: { kind: "drained", finishedSceneId: scene.id, atMs: 4 } });
  }
  assert.equal(playlist.view(sessionId)?.phase, "complete");
  assert.equal(playlist.view(sessionId)?.playlist[0]?.kind, "failed");
  assert.equal(harness.renders.length, 2);
  assert.equal(harness.prepareCalls.length, 1);
});

test("Gemini preparation failure never admits an H3 clip", async () => {
  const harness = createHarness({ preparation: Promise.resolve({ ok: false, message: "Gemini status 429", plannerAttemptsUsed: 1 }) });
  const sessionId = toClassroomSessionId("classroom-gemini-failure");
  harness.runtime.create({ sessionId });
  harness.runtime.command(sessionId, { kind: "start", teacherId: "monokuma", id: toCommandId("gemini-failure-start"), topic: "Why does the Moon have phases?", durationSeconds: 30, atMs: 1 });
  await waitFor(() => harness.runtime.view(sessionId)?.phase === "complete");
  assert.equal(harness.prepareCalls.length, 1);
  assert.equal(harness.renders.length, 0);
  assert.equal(harness.runtime.view(sessionId)?.metrics.estimatedSpendCents, 0);
});

test("a demo cannot be discarded while planning or rendering still owns paid work", async () => {
  const preparation = deferred<PreparationResult>();
  const harness = createHarness({ preparation: preparation.promise });
  const playlist = new ClassroomPlaylistRuntime(harness.runtime);
  const sessionId = toClassroomSessionId("classroom-busy-reset");
  playlist.create({ sessionId });
  playlist.command(sessionId, { kind: "start", teacherId: "monokuma", id: toCommandId("busy-reset-start"), topic: "Why does the Moon have phases?", durationSeconds: 30, atMs: 1 });
  assert.equal(await playlist.clear(sessionId), false);
  assert.equal(await harness.runtime.clear(sessionId), false);
  preparation.resolve({ ok: true, lesson: lesson(), ledger: initialLedger(), plannerAttemptsUsed: 1 });
  await waitFor(() => harness.renders.length === 2);
  assert.equal(await playlist.clear(sessionId), false);
  assert.equal(playlist.view(sessionId)?.metrics.activeVideoJobs, 2);
});
