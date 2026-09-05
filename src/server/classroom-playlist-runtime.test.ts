import assert from "node:assert/strict";
import test from "node:test";
import {
  toClassroomSessionId,
  toCommandId,
  toLessonStepId,
  toPrompt,
  toSceneId,
} from "@/lib/classroom-boundaries";
import { CLASSROOM_POLICY, sceneCountForDuration } from "@/lib/classroom-config";
import type {
  ClassroomCommand,
  ClassroomMetrics,
  ClassroomSessionId,
  ClassroomSnapshot,
  CommandOutcome,
  LessonPlan,
  TeacherId,
  LessonDurationSeconds,
  PlayableSegment,
  SceneView,
} from "@/lib/classroom-types";
import {
  ClassroomPlaylistRuntime,
  type ClassroomWorkerRuntime,
  type LessonSelection,
} from "@/server/classroom-playlist-runtime";

const EMPTY_METRICS: ClassroomMetrics = {
  readyScenes: 0,
  activeVideoJobs: 0,
  generatedScenes: 0,
  skippedScenes: 0,
  generatedSeconds: 0,
  estimatedSpendCents: 0,
  latestPlanningMs: null,
  latestGenerationMs: null,
  averageGenerationMs: null,
  latestQueueWaitMs: null,
  latestInferenceMs: null,
  latestBrowserReadyMs: null,
  averageBrowserReadyMs: null,
  bufferUnderruns: 0,
};

function testLesson(topic: string, durationSeconds: LessonDurationSeconds, teacherId: TeacherId): LessonPlan {
  const targetSceneCount = sceneCountForDuration(durationSeconds);
  return {
    teacherId,
    topic,
    title: "A test lesson",
    bigQuestion: topic,
    durationSeconds,
    targetSceneCount,
    steps: Array.from({ length: targetSceneCount }, (_, index) => ({
      id: toLessonStepId(`test-step-${index + 1}`),
      position: index + 1,
      role: index === 0 ? "hook" : index === targetSceneCount - 1 ? "recap" : "mechanism",
      title: `Beat ${index + 1}`,
      teachingGoal: `Goal ${index + 1}`,
      narration: `Narration ${index + 1}`,
      concept: `Concept ${index + 1}`,
      summary: `Summary ${index + 1}`,
      visualAction: `Visual ${index + 1}`,
      required: true,
    })),
    preparedBy: "test",
    preparationLatencyMs: 1,
    suggestedTopics: [
      "What related idea should we learn next?",
      "How does this idea work in daily life?",
      "What misconception about this topic matters?",
    ],
  };
}

function idleSnapshot(sessionId: ClassroomSessionId): ClassroomSnapshot {
  return {
    id: sessionId,
    teacherId: "monokuma",
    version: 0,
    epoch: 0,
    configured: true,
    fixture: true,
    phase: "idle",
    topic: null,
    lesson: null,
    production: { kind: "idle" },
    playback: { kind: "idle" },
    hasPlaybackBegun: false,
    committedThrough: 0,
    scenes: [],
    ready: [],
    playing: null,
    currentPrompt: null,
    nextPrompt: null,
    policy: CLASSROOM_POLICY,
    metrics: EMPTY_METRICS,
    warning: null,
    logs: [],
    playlist: [
      {
        kind: "waiting",
        sessionId,
        position: 1,
        topic: "Waiting for a lesson topic",
      },
    ],
  };
}

function providerCompleteSnapshot(
  source: ClassroomSnapshot,
): ClassroomSnapshot {
  const lesson = source.lesson;
  assert.ok(lesson);
  const topic = lesson.topic;
  const scenes: SceneView[] = lesson.steps.map((step, index) => {
    const id = toSceneId(`${source.id}-scene-${index + 1}`);
    const segment: PlayableSegment = {
      kind: "generated",
      id,
      number: index + 1,
      durationSeconds: 5,
      purpose: { kind: "lesson", stepId: step.id },
      prompt: toPrompt(`Prompt ${index + 1}`),
      summary: step.summary,
      captions: [],
      videoUrl: `https://example.com/${id}.mp4`,
      providerUrl: `https://example.com/${id}.mp4`,
      expandedPrompt: null,
      timings: { requestId: id, queueWaitMs: 0, inferenceMs: 1, totalMs: 1 },
    };
    return {
      kind: "ready",
      id,
      number: index + 1,
      plan: {
        validation: "validated", teacherId: lesson.teacherId,
        sceneNumber: index + 1,
        purpose: segment.purpose,
        prompt: segment.prompt,
        narration: step.narration,
        captions: [],
        concept: step.concept,
        summary: step.summary,
        visualAction: step.visualAction,
        ledgerAfter: {
          nextStepIndex: index + 1,
          conceptsPlanned: [],
          recentNarrations: [],
          recentVisuals: [],
        },
      },
      segment,
      generationTimeMs: 1,
    };
  });
  return {
    ...source,
    version: source.version + 1,
    phase: "draining",
    topic,
    lesson,
    production: { kind: "draining", reason: "lesson-complete" },
    playback: { kind: "priming" },
    committedThrough: lesson.targetSceneCount,
    scenes,
    ready: scenes.map((scene) => {
      if (scene.kind !== "ready") throw new Error("fixture scene is not ready");
      return scene.segment;
    }),
    metrics: { ...source.metrics, readyScenes: lesson.targetSceneCount },
  };
}

class FakeWorker implements ClassroomWorkerRuntime {
  replay(): ClassroomSnapshot { throw new Error("This fixture does not load saved videos."); }
  readonly calls: Array<Readonly<{ sessionId: ClassroomSessionId; command: ClassroomCommand }>> = [];
  private readonly snapshots = new Map<ClassroomSessionId, ClassroomSnapshot>();

  create(input: { sessionId: ClassroomSessionId }): ClassroomSnapshot {
    const existing = this.snapshots.get(input.sessionId);
    if (existing) return existing;
    const snapshot = idleSnapshot(input.sessionId);
    this.snapshots.set(input.sessionId, snapshot);
    return snapshot;
  }

  view(sessionId: ClassroomSessionId): ClassroomSnapshot | null {
    return this.snapshots.get(sessionId) ?? null;
  }

  command(
    sessionId: ClassroomSessionId,
    command: ClassroomCommand,
  ): CommandOutcome | null {
    const snapshot = this.snapshots.get(sessionId);
    if (!snapshot) return null;
    this.calls.push({ sessionId, command });
    if (command.kind === "start") {
      this.snapshots.set(sessionId, {
        ...snapshot,
        version: snapshot.version + 1,
        epoch: snapshot.epoch + 1,
        phase: "preparing",
        topic: command.topic,
        teacherId: command.teacherId,
        lesson: testLesson(command.topic, command.durationSeconds, command.teacherId),
        production: { kind: "preparing" },
        playback: { kind: "priming" },
      });
    }
    return { kind: "snapshot", snapshot: this.snapshots.get(sessionId)! };
  }

  async clear(sessionId: ClassroomSessionId): Promise<boolean> {
    this.snapshots.delete(sessionId);
    return true;
  }

  complete(sessionId: ClassroomSessionId): void {
    const snapshot = this.snapshots.get(sessionId);
    if (!snapshot) throw new Error("fixture session is missing");
    this.snapshots.set(sessionId, providerCompleteSnapshot(snapshot));
  }

  finish(sessionId: ClassroomSessionId): void {
    const snapshot = this.snapshots.get(sessionId);
    if (!snapshot) throw new Error("fixture session is missing");
    this.snapshots.set(sessionId, {
      ...snapshot,
      version: snapshot.version + 1,
      phase: "complete",
      production: { kind: "closed" },
      playback: { kind: "ended", finalSceneNumber: snapshot.committedThrough },
    });
  }
}

test("suggestions never create paid work until queue-lesson is explicit", () => {
  const worker = new FakeWorker();
  const runtime = new ClassroomPlaylistRuntime(worker);
  const sessionId = toClassroomSessionId("playlist-explicit-authorization");
  runtime.create({ sessionId });
  runtime.command(sessionId, {
    kind: "start", teacherId: "monokuma",
    id: toCommandId("start-primary"),
    topic: "Why does the Moon appear to change shape?",
    durationSeconds: 30,
    atMs: 1,
  });
  assert.equal(worker.calls.filter((call) => call.command.kind === "start").length, 1);
  assert.equal(runtime.view(sessionId)?.playlist.length, 1);
});

test("recorded selections link only explicit choices and remain unique across duplicate clicks", () => {
  const worker = new FakeWorker();
  const selections: LessonSelection[] = [];
  const runtime = new ClassroomPlaylistRuntime(worker, (selection) => selections.push(selection));
  const sessionId = toClassroomSessionId("recorded-playlist");
  runtime.create({ sessionId });
  assert.equal(selections.length, 0);
  const start = { kind: "start", teacherId: "monokuma", id: toCommandId("recorded-start"), topic: "重力", durationSeconds: 30, atMs: 1 } as const;
  runtime.command(sessionId, start);
  runtime.command(sessionId, start);
  runtime.view(sessionId);
  assert.equal(selections.length, 1);
  const choice = { kind: "queue-lesson", id: toCommandId("recorded-choice"), topic: "月球", atMs: 2 } as const;
  runtime.command(sessionId, choice);
  runtime.command(sessionId, choice);
  assert.equal(selections.length, 2);
  assert.equal(selections[1]!.playlistId, sessionId);
  assert.equal(selections[1]!.previousSessionId, sessionId);
  assert.equal(selections[1]!.sessionId, runtime.view(sessionId)!.playlist[1]!.sessionId);
  assert.deepEqual(selections.map((s) => [s.position, s.topic, s.durationSeconds]), [[1, "重力", 30], [2, "月球", 10]]);
});

test("a failed selection record prevents the worker from receiving a start", () => {
  const worker = new FakeWorker();
  const runtime = new ClassroomPlaylistRuntime(worker, () => { throw new Error("recording unavailable"); });
  const sessionId = toClassroomSessionId("unrecordable-playlist");
  runtime.create({ sessionId });
  assert.throws(() => runtime.command(sessionId, { kind: "start", teacherId: "monokuma", id: toCommandId("unrecordable-start"), topic: "重力", durationSeconds: 30, atMs: 1 }), /recording unavailable/);
  assert.equal(worker.calls.length, 0);
});

test("both selected follow-ups and their records retain the opening teacher", () => {
  const worker = new FakeWorker();
  const selections: LessonSelection[] = [];
  const runtime = new ClassroomPlaylistRuntime(worker, (selection) => selections.push(selection));
  const sessionId = toClassroomSessionId("monomi-followups");
  runtime.create({ sessionId });
  runtime.command(sessionId, { kind: "start", teacherId: "monomi", id: toCommandId("monomi-start"), topic: "重力", durationSeconds: 30, atMs: 1 });
  runtime.command(sessionId, { kind: "queue-lesson", id: toCommandId("monomi-followup-1"), topic: "月球", atMs: 2 });
  worker.complete(sessionId);
  const firstFollowup = runtime.view(sessionId)!.playlist[1]!.sessionId;
  worker.finish(sessionId);
  worker.complete(firstFollowup);
  runtime.command(sessionId, { kind: "queue-lesson", id: toCommandId("monomi-followup-2"), topic: "失重", atMs: 3 });
  const current = runtime.view(sessionId)!;
  const starts = worker.calls.filter((call) => call.command.kind === "start").map((call) => call.command);
  assert.equal(starts.length, 3);
  assert.ok(starts.every((command) => command.kind === "start" && command.teacherId === "monomi"));
  assert.deepEqual(selections.map(({ teacherId, durationSeconds }) => [teacherId, durationSeconds]), [["monomi", 30], ["monomi", 10], ["monomi", 10]]);
  assert.equal(current.teacherId, "monomi");
});

test("a queued lesson waits for its predecessor's provider work", () => {
  const worker = new FakeWorker();
  const runtime = new ClassroomPlaylistRuntime(worker);
  const sessionId = toClassroomSessionId("playlist-sequential-generation");
  runtime.create({ sessionId });
  runtime.command(sessionId, {
    kind: "start", teacherId: "monokuma",
    id: toCommandId("start-primary-sequential"),
    topic: "Why does the Moon appear to change shape?",
    durationSeconds: 30,
    atMs: 1,
  });
  runtime.command(sessionId, {
    kind: "queue-lesson",
    id: toCommandId("queue-follow-up"),
    topic: "How are eclipses different from Moon phases?",
    atMs: 2,
  });
  assert.equal(worker.calls.filter((call) => call.command.kind === "start").length, 1);
  const queued = runtime.view(sessionId)?.playlist[1];
  assert.equal(queued?.kind, "waiting");

  worker.complete(sessionId);
  const afterGate = runtime.view(sessionId);
  assert.equal(worker.calls.filter((call) => call.command.kind === "start").length, 2);
  assert.equal(afterGate?.playlist[1]?.kind, "preparing");
  runtime.view(sessionId);
  assert.equal(worker.calls.filter((call) => call.command.kind === "start").length, 2);
});

test("cross-lesson playback advances as one server-owned handoff", () => {
  const worker = new FakeWorker();
  const runtime = new ClassroomPlaylistRuntime(worker);
  const sessionId = toClassroomSessionId("playlist-cross-worker-handoff");
  runtime.create({ sessionId });
  runtime.command(sessionId, {
    kind: "start", teacherId: "monokuma",
    id: toCommandId("start-cross-worker"),
    topic: "Why does the Moon appear to change shape?",
    durationSeconds: 30,
    atMs: 1,
  });
  runtime.command(sessionId, {
    kind: "queue-lesson",
    id: toCommandId("queue-cross-worker"),
    topic: "How are eclipses different from Moon phases?",
    atMs: 2,
  });
  worker.complete(sessionId);
  const scheduled = runtime.view(sessionId);
  const childId = scheduled?.playlist[1]?.sessionId;
  if (!childId) throw new Error("queued child was not created");
  worker.complete(childId);
  const combined = runtime.view(sessionId);
  assert.equal(combined?.ready.length, 8);
  const finishedSceneId = combined?.ready[5]?.id;
  const startedSceneId = combined?.ready[6]?.id;
  if (!finishedSceneId || !startedSceneId) throw new Error("fixture handoff scenes are missing");

  runtime.command(sessionId, {
    kind: "report-playback",
    id: toCommandId("cross-worker-advance"),
    report: {
      kind: "advanced",
      finishedSceneId,
      startedSceneId,
      atMs: 3,
    },
  });
  const reports = worker.calls
    .map((call) => call.command)
    .filter((command) => command.kind === "report-playback");
  assert.deepEqual(
    reports.map((command) => command.report.kind),
    ["drained", "started"],
  );
});

test("watched history releases capacity for another queued lesson", () => {
  const worker = new FakeWorker();
  const runtime = new ClassroomPlaylistRuntime(worker);
  const sessionId = toClassroomSessionId("playlist-history-releases-capacity");
  runtime.create({ sessionId });
  runtime.command(sessionId, {
    kind: "start", teacherId: "monokuma",
    id: toCommandId("start-history"),
    topic: "Why does the Moon appear to change shape?",
    durationSeconds: 30,
    atMs: 1,
  });
  worker.complete(sessionId);
  worker.finish(sessionId);
  const queued = runtime.command(sessionId, {
    kind: "queue-lesson",
    id: toCommandId("queue-after-history"),
    topic: "How are eclipses different from Moon phases?",
    atMs: 2,
  });
  assert.equal(queued?.snapshot.playlist.length, 2);
  assert.equal(queued?.snapshot.playlist[0]?.kind, "complete");
  assert.equal(queued?.snapshot.playlist[1]?.kind, "preparing");
});

test("the initial demo cannot be started with a follow-up duration", () => {
  const worker = new FakeWorker();
  const runtime = new ClassroomPlaylistRuntime(worker);
  const sessionId = toClassroomSessionId("playlist-initial-duration");
  runtime.create({ sessionId });
  const result = runtime.command(sessionId, { kind: "start", teacherId: "monokuma", id: toCommandId("invalid-start-duration"), topic: "Why does the Moon have phases?", durationSeconds: 10, atMs: 1 });
  assert.equal(result?.snapshot.production.kind, "idle");
  assert.equal(worker.calls.length, 0);
});
