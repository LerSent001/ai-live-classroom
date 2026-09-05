import { randomUUID } from "node:crypto";
import { lessonIsBusy } from "@/lib/classroom-status";
import { CLASSROOM_CONFIG, CLASSROOM_POLICY, DEFAULT_TEACHER_ID } from "@/lib/classroom-config";
import { toEffectId, toSceneId } from "@/lib/classroom-boundaries";
import type { RecordedLesson } from "@/lib/saved-classroom";

import type {
  ClassroomCommand,
  ClassroomMetrics,
  ClassroomSessionId,
  ClassroomSnapshot,
  CommandId,
  CommandOutcome,
  EffectId,
  LessonDurationSeconds,
  LessonLedger,
  LessonPlan,
  LogEntry,
  PlayableSegment,
  PreparationResult,
  ProductionState,
  Prompt,
  RenderResult,
  SceneId,
  ScenePurpose,
  SceneView,
  ValidatedScenePlan,
  TeacherId,
} from "@/lib/classroom-types";

export const SAVED_LESSON_LOADING_MS = 4_500;

type InternalSession = {
  teacherId: TeacherId;
  id: ClassroomSessionId;
  version: number;
  epoch: number;
  topic: string | null;
  lesson: LessonPlan | null;
  ledger: LessonLedger | null;
  production: ProductionState;
  playback: ClassroomSnapshot["playback"];
  hasPlaybackBegun: boolean;
  scenes: SceneView[];
  estimatedSpendCents: number;
  planningLatenciesMs: number[];
  generationLatenciesMs: number[];
  queueWaitLatenciesMs: number[];
  inferenceLatenciesMs: number[];
  browserReadyLatenciesMs: number[];
  bufferUnderruns: number;
  warning: string | null;
  logs: LogEntry[];
  nextLogId: number;
  handledCommands: Map<CommandId, CommandOutcome>;
  pumping: boolean;
};

export type ClassroomRuntimeDependencies = Readonly<{
  configured(): boolean;
  fixture(): boolean;
  prepare(input: {
    teacherId: TeacherId;
    sessionId: ClassroomSessionId;
    topic: string;
    durationSeconds: LessonDurationSeconds;
  }): Promise<PreparationResult>;
  compile(input: {
    lesson: LessonPlan;
    ledger: LessonLedger;
    sceneNumber: number;
    purpose: ScenePurpose;
  }): ValidatedScenePlan;
  render(input: {
    sessionId: ClassroomSessionId;
    sceneId: SceneId;
    plan: ValidatedScenePlan;
  }): Promise<RenderResult>;
  clear(sessionId: ClassroomSessionId): Promise<void>;
}>;

function newSceneId(number: number): SceneId {
  return toSceneId(`scene-${number}-${randomUUID()}`);
}

function newEffectId(): EffectId {
  return toEffectId(`effect-${randomUUID()}`);
}

function isLockedFuture(scene: SceneView): boolean {
  return scene.kind === "generating" || scene.kind === "ready";
}

function activeVideoJobs(session: InternalSession): number {
  return session.scenes.filter((scene) => scene.kind === "generating").length;
}

function committedThrough(session: InternalSession): number {
  return Math.max(0, ...session.scenes.map((scene) => scene.number));
}

function readySegments(session: InternalSession): PlayableSegment[] {
  const ready: PlayableSegment[] = [];
  for (const scene of [...session.scenes].sort((left, right) => left.number - right.number)) {
    if (scene.kind === "played" || scene.kind === "playing" || scene.kind === "rejected") {
      continue;
    }
    if (scene.kind !== "ready") {
      break;
    }
    ready.push(scene.segment);
  }
  return ready;
}

function playingSegment(session: InternalSession): PlayableSegment | null {
  const scene = session.scenes.find((candidate) => candidate.kind === "playing");
  return scene?.kind === "playing" ? scene.segment : null;
}

function phaseFor(session: InternalSession): ClassroomSnapshot["phase"] {
  if (session.production.kind === "idle") return "idle";
  if (session.production.kind === "preparing") return "preparing";
  if (session.production.kind === "closed" || session.playback.kind === "ended") return "complete";
  if (session.playback.kind === "playing") return "live";
  if (session.playback.kind === "buffering") return "buffering";
  if (session.production.kind === "draining") return "draining";
  return "priming";
}

function metricsFor(session: InternalSession): ClassroomMetrics {
  const generated = session.scenes.filter(
    (scene) =>
      (scene.kind === "ready" || scene.kind === "playing" || scene.kind === "played") &&
      scene.segment.kind === "generated",
  ).length;
  const skipped = session.scenes.filter(
    (scene) =>
      (scene.kind === "ready" || scene.kind === "playing" || scene.kind === "played") &&
      scene.segment.kind === "skipped",
  ).length;
  const averageGenerationMs = session.generationLatenciesMs.length
    ? session.generationLatenciesMs.reduce((sum, value) => sum + value, 0) /
      session.generationLatenciesMs.length
    : null;
  return {
    readyScenes: readySegments(session).length,
    activeVideoJobs: activeVideoJobs(session),
    generatedScenes: generated,
    skippedScenes: skipped,
    generatedSeconds: generated * CLASSROOM_CONFIG.clipDurationSeconds,
    estimatedSpendCents: session.estimatedSpendCents,
    latestPlanningMs: session.planningLatenciesMs.at(-1) ?? null,
    latestGenerationMs: session.generationLatenciesMs.at(-1) ?? null,
    averageGenerationMs,
    latestQueueWaitMs: session.queueWaitLatenciesMs.at(-1) ?? null,
    latestInferenceMs: session.inferenceLatenciesMs.at(-1) ?? null,
    latestBrowserReadyMs: session.browserReadyLatenciesMs.at(-1) ?? null,
    averageBrowserReadyMs: session.browserReadyLatenciesMs.length
      ? session.browserReadyLatenciesMs.reduce((sum, value) => sum + value, 0) /
        session.browserReadyLatenciesMs.length
      : null,
    bufferUnderruns: session.bufferUnderruns,
  };
}

function promptOf(scene: SceneView | undefined): Prompt | null {
  if (
    scene?.kind === "generating" ||
    scene?.kind === "ready" ||
    scene?.kind === "playing" ||
    scene?.kind === "played"
  ) {
    return scene.plan.prompt;
  }
  return null;
}

export class ClassroomRuntime {
  private readonly sessions = new Map<ClassroomSessionId, InternalSession>();

  constructor(private readonly dependencies: ClassroomRuntimeDependencies) {}

  create(input: { sessionId: ClassroomSessionId }): ClassroomSnapshot {
    const existing = this.sessions.get(input.sessionId);
    if (existing) return this.snapshot(existing);
    const session: InternalSession = {
      teacherId: DEFAULT_TEACHER_ID,
      id: input.sessionId,
      version: 0,
      epoch: 0,
      topic: null,
      lesson: null,
      ledger: null,
      production: { kind: "idle" },
      playback: { kind: "idle" },
      hasPlaybackBegun: false,
      scenes: [],
      estimatedSpendCents: 0,
      planningLatenciesMs: [],
      generationLatenciesMs: [],
      queueWaitLatenciesMs: [],
      inferenceLatenciesMs: [],
      browserReadyLatenciesMs: [],
      bufferUnderruns: 0,
      warning: null,
      logs: [],
      nextLogId: 1,
      handledCommands: new Map(),
      pumping: false,
    };
    this.sessions.set(input.sessionId, session);
    return this.snapshot(session);
  }

  view(sessionId: ClassroomSessionId): ClassroomSnapshot | null {
    const session = this.sessions.get(sessionId);
    return session ? this.snapshot(session) : null;
  }

  replay(sessionId: ClassroomSessionId, recording: RecordedLesson): ClassroomSnapshot {
    const session = this.sessions.get(sessionId);
    if (!session || session.production.kind !== "idle") throw new Error("请先返回新课堂，再开始播放。");
    session.epoch += 1;
    session.topic = recording.lesson.topic;
    session.teacherId = recording.lesson.teacherId;
    session.production = { kind: "preparing" };
    session.playback = { kind: "priming" };
    // Preserve the classroom's loading beat without calling either provider.
    const epoch = session.epoch;
    setTimeout(() => {
      const current = this.sessions.get(sessionId);
      if (current !== session || current.epoch !== epoch || current.production.kind !== "preparing") return;
      current.lesson = recording.lesson;
      current.scenes = recording.scenes.map(({ plan, segment }) => {
        const id = newSceneId(segment.number);
        return { kind: "ready", id, number: segment.number, plan, segment: { ...segment, id }, generationTimeMs: 0 };
      });
      current.production = { kind: "draining", reason: "lesson-complete" };
      this.touch(current);
    }, SAVED_LESSON_LOADING_MS);
    this.log(session, "info", "Loading saved classroom media.", Date.now());
    this.touch(session);
    return this.snapshot(session);
  }

  command(sessionId: ClassroomSessionId, command: ClassroomCommand): CommandOutcome | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const duplicate = session.handledCommands.get(command.id);
    if (duplicate) return duplicate;

    let outcome: CommandOutcome;
    switch (command.kind) {
      case "start":
        outcome = this.start(session, command.topic, command.durationSeconds, command.teacherId, command.atMs);
        break;
      case "queue-lesson":
        outcome = { kind: "snapshot", snapshot: this.snapshot(session) };
        break;
      case "stop-after-committed":
        outcome = this.stop(session, command.atMs);
        break;
      case "report-playback":
        this.reportPlayback(session, command.report);
        outcome = { kind: "snapshot", snapshot: this.snapshot(session) };
        break;
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
    session.handledCommands.set(command.id, outcome);
    return outcome;
  }

  async clear(sessionId: ClassroomSessionId): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return true;
    if (lessonIsBusy(session)) return false;
    session.epoch += 1;
    this.sessions.delete(sessionId);
    await this.dependencies.clear(sessionId);
    return true;
  }

  private start(
    session: InternalSession,
    topic: string,
    durationSeconds: LessonDurationSeconds,
    teacherId: TeacherId,
    atMs: number,
  ): CommandOutcome {
    if (session.production.kind !== "idle") {
      session.warning = "This lesson has already started. Choose New lesson for another topic.";
      this.touch(session);
      return { kind: "snapshot", snapshot: this.snapshot(session) };
    }
    if (!this.dependencies.configured()) {
      session.warning = "TOKENDANCE_API_KEY and GEMINI_API_KEY are required. Add both to .env.local and restart the app.";
      this.log(session, "error", session.warning, atMs);
      this.touch(session);
      return { kind: "snapshot", snapshot: this.snapshot(session) };
    }
    session.epoch += 1;
    session.topic = topic;
    session.teacherId = teacherId;
    session.production = { kind: "preparing" };
    session.playback = { kind: "priming" };
    session.warning = null;
    session.estimatedSpendCents =
      CLASSROOM_CONFIG.maxPlannerAttempts * CLASSROOM_CONFIG.planningAttemptCostCents;
    this.log(
      session,
      "info",
      `Preparing a ${durationSeconds}-second lesson about “${topic}”.`,
      atMs,
    );
    this.touch(session);
    const epoch = session.epoch;
    void this.prepare(session.id, epoch, topic, durationSeconds, teacherId);
    return { kind: "snapshot", snapshot: this.snapshot(session) };
  }

  private stop(session: InternalSession, atMs: number): CommandOutcome {
    if (session.production.kind === "preparing" || session.production.kind === "teaching") {
      session.production = { kind: "draining", reason: "user-stop" };
      this.log(session, "warning", "Stopping after work already committed to providers.", atMs);
      this.touch(session);
      this.maybeClose(session);
    }
    return { kind: "snapshot", snapshot: this.snapshot(session) };
  }

  private reportPlayback(
    session: InternalSession,
    report: Extract<ClassroomCommand, { kind: "report-playback" }>["report"],
  ): void {
    switch (report.kind) {
      case "media-ready": {
        const latencyMs = Math.max(0, report.atMs - report.loadStartedAtMs);
        session.browserReadyLatenciesMs.push(latencyMs);
        this.log(
          session,
          "info",
          `Scene media decoded in ${(latencyMs / 1_000).toFixed(1)}s.`,
          report.atMs,
        );
        this.touch(session);
        break;
      }
      case "started":
        this.startPlaying(session, report.sceneId, report.atMs);
        break;
      case "advanced":
        this.finishPlaying(session, report.finishedSceneId, report.atMs);
        this.startPlaying(session, report.startedSceneId, report.atMs);
        break;
      case "drained":
        this.finishPlaying(session, report.finishedSceneId, report.atMs);
        if (this.hasOutstandingPlayback(session)) {
          session.playback = { kind: "buffering" };
          session.bufferUnderruns += 1;
          this.log(session, "warning", "Playback runway emptied; rebuilding the next scene.", report.atMs);
        } else {
          const finalSceneNumber = session.scenes
            .filter((scene) => scene.kind === "played")
            .at(-1)?.number ?? null;
          session.playback = { kind: "ended", finalSceneNumber };
          session.production = { kind: "closed" };
          this.log(session, "info", "Lesson complete.", report.atMs);
        }
        this.touch(session);
        this.kick(session);
        break;
      default: {
        const exhaustive: never = report;
        return exhaustive;
      }
    }
  }

  private startPlaying(session: InternalSession, sceneId: SceneId, atMs: number): void {
    const scene = session.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene || scene.kind !== "ready") return;
    this.replaceScene(session, scene.id, { ...scene, kind: "playing", startedAtMs: atMs });
    session.playback = { kind: "playing", sceneNumber: scene.number };
    session.hasPlaybackBegun = true;
    this.log(session, "info", `Scene ${scene.number} is playing.`, atMs);
    this.touch(session);
    this.kick(session);
  }

  private finishPlaying(session: InternalSession, sceneId: SceneId, atMs: number): void {
    const scene = session.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene || scene.kind !== "playing") return;
    this.replaceScene(session, scene.id, { ...scene, kind: "played", endedAtMs: atMs });
  }

  private async prepare(
    sessionId: ClassroomSessionId,
    epoch: number,
    topic: string,
    durationSeconds: LessonDurationSeconds,
    teacherId: TeacherId,
  ): Promise<void> {
    let result: PreparationResult;
    try {
      result = await this.dependencies.prepare({ sessionId, topic, durationSeconds, teacherId });
      if (result.ok && result.lesson.teacherId !== teacherId) {
        throw new Error("The prepared lesson changed the selected teacher.");
      }
    } catch (error) {
      result = {
        ok: false,
        message: error instanceof Error ? error.message : "Lesson preparation failed.",
        plannerAttemptsUsed: 1,
      };
    }
    const session = this.sessions.get(sessionId);
    if (!session || session.epoch !== epoch || session.production.kind !== "preparing") return;
    session.estimatedSpendCents -=
      (CLASSROOM_CONFIG.maxPlannerAttempts - result.plannerAttemptsUsed) *
      CLASSROOM_CONFIG.planningAttemptCostCents;
    if (!result.ok) {
      session.production = { kind: "draining", reason: "planning-failed" };
      session.playback = { kind: "ended", finalSceneNumber: null };
      session.warning = `The lesson could not be prepared: ${result.message}`;
      this.log(session, "error", session.warning, Date.now());
      this.touch(session);
      return;
    }
    session.lesson = result.lesson;
    session.ledger = result.ledger;
    session.production = { kind: "teaching" };
    session.planningLatenciesMs.push(result.lesson.preparationLatencyMs);
    this.log(
      session,
      "info",
      `${result.lesson.targetSceneCount}-beat lesson map ready: ${result.lesson.title}.`,
      Date.now(),
    );
    this.touch(session);
    this.kick(session);
  }

  private kick(session: InternalSession): void {
    if (!session.pumping) void this.pump(session.id, session.epoch);
  }

  private async pump(sessionId: ClassroomSessionId, epoch: number): Promise<void> {
    const initial = this.sessions.get(sessionId);
    if (!initial || initial.pumping) return;
    initial.pumping = true;
    try {
      while (true) {
        const session = this.sessions.get(sessionId);
        if (
          !session ||
          session.epoch !== epoch ||
          session.production.kind !== "teaching" ||
          !session.lesson ||
          !session.ledger
        ) {
          return;
        }

        const target = session.hasPlaybackBegun
          ? session.playback.kind === "buffering"
            ? CLASSROOM_CONFIG.recoveryRunwayScenes
            : CLASSROOM_CONFIG.steadyRunwayScenes
          : CLASSROOM_CONFIG.startupProductionRunwayScenes;
        const locked = session.scenes.filter(isLockedFuture).length;
        if (locked >= target || activeVideoJobs(session) >= CLASSROOM_CONFIG.videoConcurrency) return;

        if (session.ledger.nextStepIndex >= session.lesson.steps.length) {
          session.production = { kind: "draining", reason: "lesson-complete" };
          this.log(session, "info", "All lesson beats are committed.", Date.now());
          this.touch(session);
          this.maybeClose(session);
          return;
        }

        const step = session.lesson.steps[session.ledger.nextStepIndex];
        if (!step) return;
        const sceneNumber = committedThrough(session) + 1;
        const sceneId = newSceneId(sceneNumber);
        const purpose: ScenePurpose = { kind: "lesson", stepId: step.id };
        const attemptEstimate = CLASSROOM_CONFIG.videoAttemptCostCents;
        if (session.estimatedSpendCents + attemptEstimate > CLASSROOM_CONFIG.localCeilingCents) {
          session.production = { kind: "draining", reason: "user-stop" };
          session.warning = "The private local generation ceiling was reached.";
          this.log(session, "warning", session.warning, Date.now());
          this.touch(session);
          return;
        }
        let plan: ValidatedScenePlan;
        try {
          plan = this.dependencies.compile({
            lesson: session.lesson,
            ledger: session.ledger,
            sceneNumber,
            purpose,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Scene compilation failed.";
          session.scenes.push({
            kind: "rejected",
            id: sceneId,
            number: sceneNumber,
            purpose,
            message,
          });
          session.production = { kind: "draining", reason: "planning-failed" };
          session.warning = `Scene ${sceneNumber} was rejected before H3: ${message}`;
          this.log(session, "error", session.warning, Date.now());
          this.touch(session);
          return;
        }
        session.estimatedSpendCents += attemptEstimate;
        session.ledger = plan.ledgerAfter;
        const renderEffectId = newEffectId();
        session.scenes.push({
          kind: "generating",
          id: sceneId,
          number: sceneNumber,
          plan,
          effectId: renderEffectId,
          startedAtMs: Date.now(),
        });
        this.log(session, "info", `Scene ${sceneNumber} sent directly to H3 Max.`, Date.now());
        this.touch(session);
        void this.render(sessionId, epoch, sceneId, renderEffectId, plan);
      }
    } finally {
      const session = this.sessions.get(sessionId);
      if (session && session.epoch === epoch) session.pumping = false;
    }
  }

  private async render(
    sessionId: ClassroomSessionId,
    epoch: number,
    sceneId: SceneId,
    effectId: EffectId,
    plan: ValidatedScenePlan,
  ): Promise<void> {
    const startedAtMs = Date.now();
    let result: RenderResult;
    try {
      result = await this.dependencies.render({ sessionId, sceneId, plan });
    } catch (error) {
      result = {
        ok: false,
        reason: "render-failed",
        message: error instanceof Error ? error.message : "H3 generation failed.",
      };
    }
    const session = this.sessions.get(sessionId);
    const scene = session?.scenes.find((candidate) => candidate.id === sceneId);
    if (
      !session ||
      session.epoch !== epoch ||
      scene?.kind !== "generating" ||
      scene.effectId !== effectId
    ) {
      return;
    }
    const generationTimeMs = result.ok ? result.timings.totalMs : Date.now() - startedAtMs;
    const segment: PlayableSegment = result.ok
      ? {
          kind: "generated",
          id: sceneId,
          number: scene.number,
          durationSeconds: CLASSROOM_CONFIG.clipDurationSeconds,
          purpose: plan.purpose,
          prompt: plan.prompt,
          summary: plan.summary,
          captions: plan.captions,
          videoUrl: result.videoUrl,
          providerUrl: result.providerUrl,
          expandedPrompt: result.expandedPrompt,
          timings: result.timings,
        }
      : {
          kind: "skipped",
          id: sceneId,
          number: scene.number,
          durationSeconds: CLASSROOM_CONFIG.clipDurationSeconds,
          purpose: plan.purpose,
          prompt: plan.prompt,
          summary: plan.summary,
          captions: plan.captions,
          reason: result.reason,
          message: result.message,
        };
    this.replaceScene(session, sceneId, {
      kind: "ready",
      id: sceneId,
      number: scene.number,
      plan,
      segment,
      generationTimeMs,
    });
    this.log(
      session,
      result.ok ? "info" : "warning",
      result.ok
        ? `Scene ${scene.number} is ready in ${(generationTimeMs / 1_000).toFixed(1)}s.`
        : `Scene ${scene.number} uses a local lesson card after H3 failed: ${result.message}`,
      Date.now(),
    );
    session.generationLatenciesMs.push(generationTimeMs);
    if (!result.ok) {
      session.production = { kind: "draining", reason: "render-failed" };
      session.warning = `Video generation stopped: ${result.message}`;
    }
    if (result.ok && result.timings.queueWaitMs !== null) {
      session.queueWaitLatenciesMs.push(result.timings.queueWaitMs);
    }
    if (result.ok && result.timings.inferenceMs !== null) {
      session.inferenceLatenciesMs.push(result.timings.inferenceMs);
    }
    this.touch(session);
    this.maybeClose(session);
    this.kick(session);
  }

  private replaceScene(session: InternalSession, sceneId: SceneId, next: SceneView): void {
    const index = session.scenes.findIndex((scene) => scene.id === sceneId);
    if (index >= 0) session.scenes[index] = next;
  }

  private hasOutstandingPlayback(session: InternalSession): boolean {
    return (
      session.scenes.some(
        (scene) => scene.kind === "generating" || scene.kind === "ready",
      ) || session.production.kind === "teaching"
    );
  }

  private maybeClose(session: InternalSession): void {
    if (
      session.production.kind !== "draining" ||
      session.scenes.some(
        (scene) =>
          scene.kind === "generating" ||
          scene.kind === "ready" ||
          scene.kind === "playing",
      )
    ) {
      return;
    }
    session.production = { kind: "closed" };
    session.playback = {
      kind: "ended",
      finalSceneNumber: session.scenes.filter((scene) => scene.kind === "played").at(-1)?.number ?? null,
    };
  }

  private log(
    session: InternalSession,
    level: LogEntry["level"],
    message: string,
    atMs: number,
  ): void {
    session.logs.push({ id: session.nextLogId, atMs, level, message });
    session.nextLogId += 1;
    if (session.logs.length > CLASSROOM_CONFIG.maxLogEntries) {
      session.logs.splice(0, session.logs.length - CLASSROOM_CONFIG.maxLogEntries);
    }
  }

  private touch(session: InternalSession): void {
    session.version += 1;
  }

  private snapshot(session: InternalSession): ClassroomSnapshot {
    const ordered = [...session.scenes].sort((left, right) => left.number - right.number);
    const playingScene = ordered.find((scene) => scene.kind === "playing");
    const nextScene = ordered.find(
      (scene) => scene.kind === "generating" || scene.kind === "ready",
    );
    return {
      id: session.id,
      teacherId: session.teacherId,
      version: session.version,
      epoch: session.epoch,
      configured: this.dependencies.configured(),
      fixture: this.dependencies.fixture(),
      phase: phaseFor(session),
      topic: session.topic,
      lesson: session.lesson,
      production: session.production,
      playback: session.playback,
      hasPlaybackBegun: session.hasPlaybackBegun,
      committedThrough: committedThrough(session),
      scenes: ordered,
      ready: readySegments(session),
      playing: playingSegment(session),
      currentPrompt: promptOf(playingScene),
      nextPrompt: promptOf(nextScene),
      policy: CLASSROOM_POLICY,
      metrics: metricsFor(session),
      warning: session.warning,
      logs: [...session.logs],
      playlist: [
        {
          sessionId: session.id,
          position: 1,
          topic: session.topic ?? "Waiting for a lesson topic",
          kind:
            session.production.kind === "idle"
              ? "waiting"
              : session.production.kind === "preparing"
                ? "preparing"
                : session.playback.kind === "playing"
                  ? "playing"
                  : session.playback.kind === "ended"
                    ? "complete"
                    : "generating",
          ...(session.production.kind !== "idle" &&
          session.production.kind !== "preparing" &&
          session.playback.kind !== "playing" &&
          session.playback.kind !== "ended"
            ? {
                readyScenes: readySegments(session).length,
                targetScenes: session.lesson?.targetSceneCount ?? CLASSROOM_CONFIG.maxLessonScenes,
              }
            : {}),
        } as ClassroomSnapshot["playlist"][number],
      ],
    };
  }
}
