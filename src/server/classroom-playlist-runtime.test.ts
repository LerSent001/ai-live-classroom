import assert from "node:assert/strict";
import test from "node:test";
import { toClassroomSessionId, toCommandId, toLessonStepId, toPrompt, toSceneId } from "@/lib/classroom-boundaries";
import { CLASSROOM_POLICY } from "@/lib/classroom-config";
import type { BranchLessonContext, ClassroomCommand, ClassroomMetrics, ClassroomSessionId, ClassroomSnapshot, CommandOutcome, CourseRole, LessonPlan, PlayableSegment, SceneView, TeacherId } from "@/lib/classroom-types";
import { ClassroomPlaylistRuntime, type ClassroomWorkerRuntime, type LessonSelection } from "@/server/classroom-playlist-runtime";

const EMPTY_METRICS: ClassroomMetrics = {
  readyScenes: 0, activeVideoJobs: 0, generatedScenes: 0, skippedScenes: 0,
  generatedSeconds: 0, estimatedSpendCents: 0, latestPlanningMs: null,
  latestGenerationMs: null, averageGenerationMs: null, latestQueueWaitMs: null,
  latestInferenceMs: null, latestBrowserReadyMs: null, averageBrowserReadyMs: null,
  bufferUnderruns: 0,
};

function lesson(topic: string, teacherId: TeacherId, courseRole: CourseRole, parentContext: BranchLessonContext | null): LessonPlan {
  const targetSceneCount = courseRole === "main" ? 6 : 2;
  return {
    teacherId, topic, courseRole, parentContext,
    title: courseRole === "main" ? "Moon Shapes" : `Question: ${topic}`,
    bigQuestion: topic, durationSeconds: targetSceneCount * 5, targetSceneCount,
    steps: Array.from({ length: targetSceneCount }, (_, index) => ({
      id: toLessonStepId(`${courseRole}-${index + 1}`), position: index + 1,
      role: index === 0 ? "hook" : index === targetSceneCount - 1 ? "recap" : "mechanism",
      title: `Beat ${index + 1}`, teachingGoal: `Goal ${index + 1}`,
      narration: `Narration ${index + 1}`, concept: `Concept ${index + 1}`,
      summary: `Summary ${index + 1}`, visualAction: `Visual ${index + 1}`, required: true,
    })),
    preparedBy: "test", preparationLatencyMs: 1,
    suggestedTopics: [
      "What related idea should we learn next?",
      "How does this work in daily life?",
      "What misconception matters here?",
    ],
  };
}

function idleSnapshot(sessionId: ClassroomSessionId): ClassroomSnapshot {
  return {
    id: sessionId, teacherId: "monokuma", version: 0, epoch: 0, configured: true,
    fixture: true, phase: "idle", topic: null, lesson: null,
    production: { kind: "idle" }, playback: { kind: "idle" }, hasPlaybackBegun: false,
    committedThrough: 0, scenes: [], ready: [], playing: null, currentPrompt: null,
    nextPrompt: null, policy: CLASSROOM_POLICY, metrics: EMPTY_METRICS, warning: null, logs: [],
    playlist: [{ kind: "waiting", sessionId, position: 1, topic: "Waiting", courseRole: "main" }],
    playbackContext: { kind: "main", sessionId, returnTo: null },
    courseDocument: {
      id: `course-document:${sessionId}`, title: "Untitled course", subject: "Untitled course",
      teacherId: "monokuma", main: null, appendices: [], activeSectionId: null, exportReady: false,
    },
  };
}

function generatedScenes(snapshot: ClassroomSnapshot): SceneView[] {
  const plan = snapshot.lesson;
  assert.ok(plan);
  return plan.steps.map((step, index) => {
    const id = toSceneId(`${snapshot.id}-scene-${index + 1}`);
    const segment: PlayableSegment = {
      kind: "generated", id, number: index + 1, durationSeconds: 5,
      purpose: { kind: "lesson", stepId: step.id }, prompt: toPrompt(`Prompt ${index + 1}`),
      summary: step.summary, captions: [], videoUrl: `https://example.com/${id}.mp4`,
      providerUrl: `https://example.com/${id}.mp4`, expandedPrompt: null,
      timings: { requestId: id, queueWaitMs: 0, inferenceMs: 1, totalMs: 1 },
    };
    return {
      kind: "ready", id, number: index + 1,
      plan: {
        validation: "validated", teacherId: plan.teacherId, sceneNumber: index + 1,
        purpose: segment.purpose, prompt: segment.prompt, narration: step.narration,
        captions: [], concept: step.concept, summary: step.summary,
        visualAction: step.visualAction,
        ledgerAfter: { nextStepIndex: index + 1, conceptsPlanned: [], recentNarrations: [], recentVisuals: [] },
      },
      segment, generationTimeMs: 1,
    };
  });
}

class FakeWorker implements ClassroomWorkerRuntime {
  replay(): ClassroomSnapshot { throw new Error("Saved playback is not used in this fixture."); }
  readonly calls: Array<Readonly<{ sessionId: ClassroomSessionId; command: ClassroomCommand }>> = [];
  private readonly snapshots = new Map<ClassroomSessionId, ClassroomSnapshot>();

  create(input: { sessionId: ClassroomSessionId }): ClassroomSnapshot {
    const snapshot = this.snapshots.get(input.sessionId) ?? idleSnapshot(input.sessionId);
    this.snapshots.set(input.sessionId, snapshot);
    return snapshot;
  }
  view(sessionId: ClassroomSessionId): ClassroomSnapshot | null { return this.snapshots.get(sessionId) ?? null; }
  async clear(sessionId: ClassroomSessionId): Promise<boolean> { this.snapshots.delete(sessionId); return true; }

  command(sessionId: ClassroomSessionId, command: ClassroomCommand): CommandOutcome | null {
    const current = this.snapshots.get(sessionId);
    if (!current) return null;
    this.calls.push({ sessionId, command });
    if (command.kind === "start") {
      const planned = lesson(command.topic, command.teacherId, command.courseRole, command.parentContext);
      this.snapshots.set(sessionId, {
        ...current, version: current.version + 1, phase: "preparing", teacherId: command.teacherId,
        topic: command.topic, lesson: planned, production: { kind: "preparing" }, playback: { kind: "priming" },
        playbackContext: { kind: command.courseRole, sessionId, returnTo: command.parentContext ? {
          sessionId: command.parentContext.parentSessionId, sceneId: command.parentContext.resumeSceneId,
          stepId: command.parentContext.resumeStepId,
        } : null },
      });
    } else if (command.kind === "report-playback" && command.report.kind === "started") {
      const report = command.report;
      const segment = current.ready.find((item) => item.id === report.sceneId) ?? null;
      this.snapshots.set(sessionId, {
        ...current, phase: "live", playback: { kind: "playing", sceneNumber: segment?.number ?? 1 },
        hasPlaybackBegun: true, playing: segment,
        ready: current.ready.filter((item) => item.id !== report.sceneId),
        scenes: current.scenes.map((scene) => scene.id === report.sceneId && scene.kind === "ready" ? { ...scene, kind: "playing" as const, startedAtMs: report.atMs } : scene),
      });
    } else if (command.kind === "report-playback" && command.report.kind === "drained") {
      this.finish(sessionId);
    }
    return { kind: "snapshot", snapshot: this.snapshots.get(sessionId)! };
  }

  complete(sessionId: ClassroomSessionId): void {
    const current = this.snapshots.get(sessionId);
    if (!current) throw new Error("fixture session is missing");
    const scenes = generatedScenes(current);
    this.snapshots.set(sessionId, {
      ...current, version: current.version + 1, phase: "draining",
      production: { kind: "draining", reason: "lesson-complete" }, playback: { kind: "priming" },
      committedThrough: scenes.length, scenes,
      ready: scenes.map((scene) => {
        if (scene.kind !== "ready") throw new Error("Expected ready scene");
        return scene.segment;
      }),
      metrics: { ...current.metrics, readyScenes: scenes.length, generatedScenes: scenes.length },
    });
  }

  fail(sessionId: ClassroomSessionId): void {
    const current = this.snapshots.get(sessionId);
    if (!current) throw new Error("fixture session is missing");
    this.snapshots.set(sessionId, {
      ...current, phase: "complete", production: { kind: "closed" },
      playback: { kind: "ended", finalSceneNumber: null }, warning: "Branch generation failed",
    });
  }

  finish(sessionId: ClassroomSessionId): void {
    const current = this.snapshots.get(sessionId);
    if (!current) throw new Error("fixture session is missing");
    this.snapshots.set(sessionId, {
      ...current, phase: "complete", production: { kind: "closed" },
      playback: { kind: "ended", finalSceneNumber: current.committedThrough },
      scenes: current.scenes.map((scene) => scene.kind === "ready" ? { ...scene, kind: "played" as const, startedAtMs: 1, endedAtMs: 2 } : scene.kind === "playing" ? { ...scene, kind: "played" as const, endedAtMs: 2 } : scene),
      ready: [], playing: null,
    });
  }
}

function start(runtime: ClassroomPlaylistRuntime, sessionId: ClassroomSessionId, teacherId: TeacherId = "monokuma") {
  return runtime.command(sessionId, {
    kind: "start", teacherId, id: toCommandId(`start-${sessionId}`),
    topic: "Why does the Moon have phases?", courseRole: "main", parentContext: null, atMs: 1,
  });
}

test("suggestions never create work until a question is explicit", () => {
  const worker = new FakeWorker();
  const runtime = new ClassroomPlaylistRuntime(worker);
  const sessionId = toClassroomSessionId("explicit-branch");
  runtime.create({ sessionId });
  start(runtime, sessionId);
  assert.equal(worker.calls.filter((call) => call.command.kind === "start").length, 1);
  assert.equal(runtime.view(sessionId)?.playlist.length, 1);
});

test("a question starts an immediate contextual branch and duplicate clicks stay idempotent", () => {
  const worker = new FakeWorker();
  const selections: LessonSelection[] = [];
  const runtime = new ClassroomPlaylistRuntime(worker, (selection) => selections.push(selection));
  const sessionId = toClassroomSessionId("contextual-branch");
  runtime.create({ sessionId });
  start(runtime, sessionId);
  worker.complete(sessionId);
  const mainScene = runtime.view(sessionId)!.ready[0]!;
  runtime.command(sessionId, { kind: "report-playback", id: toCommandId("main-started"), report: { kind: "started", sceneId: mainScene.id, atMs: 2 } });
  const question = { kind: "queue-lesson" as const, id: toCommandId("ask-eclipse"), topic: "How are eclipses different from Moon phases?", atMs: 3 };
  runtime.command(sessionId, question);
  runtime.command(sessionId, question);
  const snapshot = runtime.view(sessionId)!;
  const branch = snapshot.playlist[1]!;
  assert.equal(branch.kind, "preparing");
  assert.equal(snapshot.playbackContext.kind, "branch");
  assert.equal(snapshot.playbackContext.returnTo?.sceneId, mainScene.id);
  assert.equal(selections.length, 2);
  assert.equal(selections[1]!.courseRole, "branch");
  assert.equal(selections[1]!.parentContext?.currentConcept, "Concept 1");
  const branchStart = worker.calls.find((call) => call.sessionId === branch.sessionId && call.command.kind === "start")?.command;
  assert.ok(branchStart?.kind === "start");
  assert.equal(branchStart.parentContext?.resumeSceneId, mainScene.id);
});

test("finishing a branch restores main playback and records an appendix", () => {
  const worker = new FakeWorker();
  const runtime = new ClassroomPlaylistRuntime(worker);
  const sessionId = toClassroomSessionId("resume-main");
  runtime.create({ sessionId });
  start(runtime, sessionId);
  worker.complete(sessionId);
  const mainScene = runtime.view(sessionId)!.ready[0]!;
  runtime.command(sessionId, { kind: "report-playback", id: toCommandId("resume-main-start"), report: { kind: "started", sceneId: mainScene.id, atMs: 2 } });
  runtime.command(sessionId, { kind: "queue-lesson", id: toCommandId("resume-main-question"), topic: "What blocks the Moon during an eclipse?", atMs: 3 });
  const branchId = runtime.view(sessionId)!.playlist[1]!.sessionId;
  worker.complete(branchId);
  assert.equal(runtime.view(sessionId)!.ready.length, 2);
  worker.finish(branchId);
  const resumed = runtime.view(sessionId)!;
  assert.equal(resumed.playbackContext.kind, "main");
  assert.equal(resumed.playing?.id, mainScene.id);
  assert.equal(resumed.courseDocument.appendices.length, 1);
  assert.equal(resumed.courseDocument.activeSectionId, `course-section:${sessionId}`);
});

test("the teacher is retained and only two completed branches are admitted", () => {
  const worker = new FakeWorker();
  const runtime = new ClassroomPlaylistRuntime(worker);
  const sessionId = toClassroomSessionId("branch-limit");
  runtime.create({ sessionId });
  start(runtime, sessionId, "monomi");
  worker.complete(sessionId);
  for (const [index, topic] of ["Question one", "Question two"].entries()) {
    runtime.command(sessionId, { kind: "queue-lesson", id: toCommandId(`question-${index}`), topic, atMs: index + 2 });
    const branchId = runtime.view(sessionId)!.playlist.at(-1)!.sessionId;
    worker.complete(branchId);
    worker.finish(branchId);
  }
  const denied = runtime.command(sessionId, { kind: "queue-lesson", id: toCommandId("question-three"), topic: "Question three", atMs: 5 })!.snapshot;
  const starts = worker.calls.map((call) => call.command).filter((command) => command.kind === "start");
  assert.equal(starts.length, 3);
  assert.ok(starts.every((command) => command.teacherId === "monomi"));
  assert.equal(denied.playlist.length, 3);
  assert.match(denied.warning!, /2 question branches/);
});

test("a terminal branch failure returns control to the playing main lesson", () => {
  const worker = new FakeWorker();
  const runtime = new ClassroomPlaylistRuntime(worker);
  const sessionId = toClassroomSessionId("failed-branch-resume");
  runtime.create({ sessionId });
  start(runtime, sessionId);
  worker.complete(sessionId);
  const mainScene = runtime.view(sessionId)!.ready[0]!;
  runtime.command(sessionId, { kind: "report-playback", id: toCommandId("failed-main-start"), report: { kind: "started", sceneId: mainScene.id, atMs: 2 } });
  runtime.command(sessionId, { kind: "queue-lesson", id: toCommandId("failed-question"), topic: "A difficult question", atMs: 3 });
  const branchId = runtime.view(sessionId)!.playlist[1]!.sessionId;
  worker.fail(branchId);
  const resumed = runtime.view(sessionId)!;
  assert.equal(resumed.playbackContext.kind, "main");
  assert.equal(resumed.playing?.id, mainScene.id);
});
