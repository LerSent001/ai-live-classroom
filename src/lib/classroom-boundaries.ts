import { isValidTopic } from "@/lib/lesson-language";
import { CLASSROOM_CONFIG, DEFAULT_TEACHER_ID } from "@/lib/classroom-config";
import type {
  CaptionCue,
  ClassroomApiResponse,
  ClassroomCommand,
  ClassroomMetrics,
  ClassroomPhase,
  ClassroomPolicy,
  ClassroomSessionId,
  ClassroomSnapshot,
  CommandId,
  CommandOutcome,
  EffectId,
  LessonDurationSeconds,
  LessonPlan,
  LessonStep,
  LessonStepId,
  LogEntry,
  PlaylistLessonView,
  PlayableSegment,
  PlaybackReport,
  PlaybackState,
  ProductionState,
  ProgressionRole,
  Prompt,
  SceneId,
  ScenePurpose,
  SceneView,
  ValidatedScenePlan,
  TeacherId,
} from "@/lib/classroom-types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordOf(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function stringOf(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function nonEmptyStringOf(value: unknown, label: string): string {
  const result = stringOf(value, label).trim();
  if (!result) throw new Error(`${label} cannot be empty`);
  return result;
}

function numberOf(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function integerOf(value: unknown, label: string): number {
  const result = numberOf(value, label);
  if (!Number.isInteger(result)) throw new Error(`${label} must be an integer`);
  return result;
}

function booleanOf(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function nullableStringOf(value: unknown, label: string): string | null {
  return value === null ? null : stringOf(value, label);
}

function nullableNumberOf(value: unknown, label: string): number | null {
  return value === null ? null : numberOf(value, label);
}

function arrayOf<T>(
  value: unknown,
  label: string,
  parse: (item: unknown, index: number) => T,
): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map(parse);
}

function brandedString(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 180 || !/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    throw new Error(`${label} is invalid`);
  }
  return trimmed;
}

export function toClassroomSessionId(value: string): ClassroomSessionId {
  return brandedString(value, "session id") as ClassroomSessionId;
}

export function toSceneId(value: string): SceneId {
  return brandedString(value, "scene id") as SceneId;
}

export function toLessonStepId(value: string): LessonStepId {
  return brandedString(value, "lesson step id") as LessonStepId;
}

export function toCommandId(value: string): CommandId {
  return brandedString(value, "command id") as CommandId;
}

export function toEffectId(value: string): EffectId {
  return brandedString(value, "effect id") as EffectId;
}

export function toPrompt(value: string): Prompt {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("prompt cannot be empty");
  return trimmed as Prompt;
}

function durationOf(value: unknown): LessonDurationSeconds {
  if (value !== 10 && value !== 30) throw new Error("durationSeconds must be 10 or 30");
  return value;
}

function topicOf(value: unknown): string {
  const topic = nonEmptyStringOf(value, "topic");
  if (!isValidTopic(topic)) {
    throw new Error("topic must be between 2 and 500 characters");
  }
  return topic;
}

export function parseTeacherId(value: unknown): TeacherId {
  if (value === "monokuma" || value === "monomi") return value;
  throw new Error("Unknown teacherId. Choose monokuma or monomi.");
}

export function parseCreateClassroomRequest(value: unknown): {
  sessionId: ClassroomSessionId;
} {
  const record = recordOf(value, "create request");
  return { sessionId: toClassroomSessionId(stringOf(record.sessionId, "session id")) };
}

function parsePlaybackReport(value: unknown): PlaybackReport {
  const record = recordOf(value, "playback report");
  if (record.kind === "media-ready") {
    return {
      kind: "media-ready",
      sceneId: toSceneId(stringOf(record.sceneId, "scene id")),
      loadStartedAtMs: integerOf(record.loadStartedAtMs, "media load start"),
      atMs: integerOf(record.atMs, "event time"),
    };
  }
  if (record.kind === "started") {
    return {
      kind: "started",
      sceneId: toSceneId(stringOf(record.sceneId, "scene id")),
      atMs: integerOf(record.atMs, "event time"),
    };
  }
  if (record.kind === "advanced") {
    return {
      kind: "advanced",
      finishedSceneId: toSceneId(stringOf(record.finishedSceneId, "finished scene id")),
      startedSceneId: toSceneId(stringOf(record.startedSceneId, "started scene id")),
      atMs: integerOf(record.atMs, "event time"),
    };
  }
  if (record.kind === "drained") {
    return {
      kind: "drained",
      finishedSceneId: toSceneId(stringOf(record.finishedSceneId, "finished scene id")),
      atMs: integerOf(record.atMs, "event time"),
    };
  }
  throw new Error("Unknown playback report kind");
}

export function parseClassroomCommand(value: unknown): ClassroomCommand {
  const record = recordOf(value, "classroom command");
  const id = toCommandId(stringOf(record.id, "command id"));
  if (record.kind === "start") {
    return {
      kind: "start",
      // Older clients omit the new option; invalid explicit IDs must fail.
      teacherId: record.teacherId === undefined ? DEFAULT_TEACHER_ID : parseTeacherId(record.teacherId),
      id,
      topic: topicOf(record.topic),
      durationSeconds: durationOf(record.durationSeconds),
      atMs: integerOf(record.atMs, "command time"),
    };
  }
  if (record.kind === "queue-lesson") {
    return {
      kind: "queue-lesson",
      id,
      topic: topicOf(record.topic),
      atMs: integerOf(record.atMs, "command time"),
    };
  }
  if (record.kind === "stop-after-committed") {
    return { kind: "stop-after-committed", id, atMs: integerOf(record.atMs, "command time") };
  }
  if (record.kind === "report-playback") {
    return { kind: "report-playback", id, report: parsePlaybackReport(record.report) };
  }
  throw new Error("Unknown classroom command kind");
}

function parseRole(value: unknown): ProgressionRole {
  const role = stringOf(value, "progression role");
  if (
    role === "hook" ||
    role === "foundation" ||
    role === "mechanism" ||
    role === "example" ||
    role === "connection" ||
    role === "misconception" ||
    role === "application" ||
    role === "transition" ||
    role === "synthesis" ||
    role === "recap"
  ) {
    return role;
  }
  throw new Error("Unknown progression role");
}

function parseStep(value: unknown): LessonStep {
  const record = recordOf(value, "lesson step");
  return {
    id: toLessonStepId(stringOf(record.id, "lesson step id")),
    position: integerOf(record.position, "lesson step position"),
    role: parseRole(record.role),
    title: nonEmptyStringOf(record.title, "lesson step title"),
    teachingGoal: nonEmptyStringOf(record.teachingGoal, "teaching goal"),
    narration: nonEmptyStringOf(record.narration, "lesson step narration"),
    concept: nonEmptyStringOf(record.concept, "lesson step concept"),
    summary: nonEmptyStringOf(record.summary, "lesson step summary"),
    visualAction: nonEmptyStringOf(record.visualAction, "lesson step visual action"),
    required: booleanOf(record.required, "required flag"),
  };
}

export function parseLessonPlan(value: unknown): LessonPlan {
  const record = recordOf(value, "lesson plan");
  const durationSeconds = durationOf(record.durationSeconds);
  const targetSceneCount = integerOf(record.targetSceneCount, "target scene count");
  if (targetSceneCount !== 2 && targetSceneCount !== 6) {
    throw new Error("target scene count must be 2 or 6");
  }
  if (targetSceneCount * CLASSROOM_CONFIG.clipDurationSeconds !== durationSeconds) {
    throw new Error("scene count must match the lesson duration");
  }
  return {
    topic: nonEmptyStringOf(record.topic, "lesson topic"),
    teacherId: parseTeacherId(record.teacherId),
    title: nonEmptyStringOf(record.title, "lesson title"),
    bigQuestion: nonEmptyStringOf(record.bigQuestion, "big question"),
    durationSeconds,
    targetSceneCount,
    steps: arrayOf(record.steps, "lesson steps", parseStep),
    preparedBy: nonEmptyStringOf(record.preparedBy, "planner model"),
    preparationLatencyMs: numberOf(record.preparationLatencyMs, "preparation latency"),
    suggestedTopics: parseSuggestedTopics(record.suggestedTopics),
  };
}

function parseSuggestedTopics(value: unknown): [string, string, string] {
  const topics = arrayOf(value, "suggested topics", (item) => topicOf(item));
  if (topics.length !== 3) throw new Error("suggested topics must contain exactly three topics");
  return [topics[0]!, topics[1]!, topics[2]!];
}

function parsePurpose(value: unknown): ScenePurpose {
  const record = recordOf(value, "scene purpose");
  if (record.kind !== "lesson") throw new Error("Unknown scene purpose");
  return {
    kind: "lesson",
    stepId: toLessonStepId(stringOf(record.stepId, "step id")),
  };
}

function parseCaption(value: unknown): CaptionCue {
  const record = recordOf(value, "caption cue");
  return {
    startSeconds: numberOf(record.startSeconds, "caption start"),
    endSeconds: numberOf(record.endSeconds, "caption end"),
    text: nonEmptyStringOf(record.text, "caption text"),
  };
}

export function parsePlan(value: unknown): ValidatedScenePlan {
  const record = recordOf(value, "scene plan");
  if (record.validation !== "validated") throw new Error("Scene plan was not validated");
  return {
    validation: "validated",
    teacherId: parseTeacherId(record.teacherId),
    sceneNumber: integerOf(record.sceneNumber, "scene number"),
    purpose: parsePurpose(record.purpose),
    prompt: toPrompt(stringOf(record.prompt, "scene prompt")),
    narration: nonEmptyStringOf(record.narration, "narration"),
    captions: arrayOf(record.captions, "captions", parseCaption),
    concept: nonEmptyStringOf(record.concept, "concept"),
    summary: nonEmptyStringOf(record.summary, "summary"),
    visualAction: nonEmptyStringOf(record.visualAction, "visual action"),
    ledgerAfter: {
      nextStepIndex: integerOf(recordOf(record.ledgerAfter, "lesson ledger").nextStepIndex, "next step"),
      conceptsPlanned: arrayOf(recordOf(record.ledgerAfter, "lesson ledger").conceptsPlanned, "planned concepts", (item) => stringOf(item, "planned concept")),
      recentNarrations: arrayOf(recordOf(record.ledgerAfter, "lesson ledger").recentNarrations, "recent narrations", (item) => stringOf(item, "recent narration")),
      recentVisuals: arrayOf(recordOf(record.ledgerAfter, "lesson ledger").recentVisuals, "recent visuals", (item) => stringOf(item, "recent visual")),
    },
  };
}

function parseRenderTimings(value: unknown) {
  const record = recordOf(value, "render timings");
  return {
    requestId: nonEmptyStringOf(record.requestId, "fal request id"),
    queueWaitMs: nullableNumberOf(record.queueWaitMs, "queue wait"),
    inferenceMs: nullableNumberOf(record.inferenceMs, "inference time"),
    totalMs: numberOf(record.totalMs, "provider total"),
  };
}

export function parseSegment(value: unknown): PlayableSegment {
  const record = recordOf(value, "playable segment");
  const identity = {
    id: toSceneId(stringOf(record.id, "scene id")),
    number: integerOf(record.number, "scene number"),
    durationSeconds: numberOf(record.durationSeconds, "scene duration"),
    purpose: parsePurpose(record.purpose),
    prompt: toPrompt(stringOf(record.prompt, "scene prompt")),
    summary: nonEmptyStringOf(record.summary, "scene summary"),
    captions: arrayOf(record.captions, "captions", parseCaption),
  };
  if (record.kind === "generated") {
    return {
      ...identity,
      kind: "generated",
      videoUrl: nonEmptyStringOf(record.videoUrl, "video URL"),
      providerUrl: nonEmptyStringOf(record.providerUrl, "provider URL"),
      expandedPrompt: nullableStringOf(record.expandedPrompt, "expanded prompt"),
      timings: parseRenderTimings(record.timings),
    };
  }
  if (record.kind === "skipped") {
    const reason = stringOf(record.reason, "skip reason");
    if (reason !== "render-failed" && reason !== "delivery-failed") {
      throw new Error("Unknown skip reason");
    }
    return {
      ...identity,
      kind: "skipped",
      reason,
      message: nonEmptyStringOf(record.message, "skip message"),
    };
  }
  throw new Error("Unknown segment kind");
}

function parseScene(value: unknown): SceneView {
  const record = recordOf(value, "scene");
  const id = toSceneId(stringOf(record.id, "scene id"));
  const number = integerOf(record.number, "scene number");
  if (record.kind === "generating") {
    return { kind: "generating", id, number, plan: parsePlan(record.plan), effectId: toEffectId(stringOf(record.effectId, "effect id")), startedAtMs: numberOf(record.startedAtMs, "generation start") };
  }
  if (record.kind === "ready") {
    return { kind: "ready", id, number, plan: parsePlan(record.plan), segment: parseSegment(record.segment), generationTimeMs: numberOf(record.generationTimeMs, "generation time") };
  }
  if (record.kind === "playing") {
    return { kind: "playing", id, number, plan: parsePlan(record.plan), segment: parseSegment(record.segment), generationTimeMs: numberOf(record.generationTimeMs, "generation time"), startedAtMs: numberOf(record.startedAtMs, "playback start") };
  }
  if (record.kind === "played") {
    return { kind: "played", id, number, plan: parsePlan(record.plan), segment: parseSegment(record.segment), generationTimeMs: numberOf(record.generationTimeMs, "generation time"), startedAtMs: numberOf(record.startedAtMs, "playback start"), endedAtMs: numberOf(record.endedAtMs, "playback end") };
  }
  if (record.kind === "rejected") {
    return { kind: "rejected", id, number, purpose: parsePurpose(record.purpose), message: nonEmptyStringOf(record.message, "rejection message") };
  }
  throw new Error("Unknown scene kind");
}

function parseProduction(value: unknown): ProductionState {
  const record = recordOf(value, "production state");
  if (record.kind === "idle" || record.kind === "preparing" || record.kind === "teaching" || record.kind === "closed") return { kind: record.kind };
  if (record.kind === "draining") {
    const reason = stringOf(record.reason, "drain reason");
    if (reason === "lesson-complete" || reason === "user-stop" || reason === "planning-failed" || reason === "render-failed") return { kind: "draining", reason };
  }
  throw new Error("Unknown production state");
}

function parsePlayback(value: unknown): PlaybackState {
  const record = recordOf(value, "playback state");
  if (record.kind === "idle" || record.kind === "priming" || record.kind === "buffering") return { kind: record.kind };
  if (record.kind === "playing") return { kind: "playing", sceneNumber: integerOf(record.sceneNumber, "playing scene") };
  if (record.kind === "ended") return { kind: "ended", finalSceneNumber: record.finalSceneNumber === null ? null : integerOf(record.finalSceneNumber, "final scene") };
  throw new Error("Unknown playback state");
}

function parsePhase(value: unknown): ClassroomPhase {
  if (value === "idle" || value === "preparing" || value === "priming" || value === "live" || value === "buffering" || value === "draining" || value === "complete") return value;
  throw new Error("Unknown classroom phase");
}

function parsePolicy(value: unknown): ClassroomPolicy {
  const record = recordOf(value, "classroom policy");
  return {
    clipDurationSeconds: numberOf(record.clipDurationSeconds, "clip duration"),
    durationOptionsSeconds: arrayOf(record.durationOptionsSeconds, "duration options", durationOf),
    startupRunwayScenes: integerOf(record.startupRunwayScenes, "startup runway"),
    steadyRunwayScenes: integerOf(record.steadyRunwayScenes, "steady runway"),
    recoveryRunwayScenes: integerOf(record.recoveryRunwayScenes, "recovery runway"),
    videoConcurrency: integerOf(record.videoConcurrency, "video concurrency"),
    maxLessonScenes: integerOf(record.maxLessonScenes, "max lesson scenes"),
    maxQueuedLessons: integerOf(record.maxQueuedLessons, "max queued lessons"),
    maxPlannerAttempts: integerOf(record.maxPlannerAttempts, "max planner attempts"),
    videoAttemptCostCents: integerOf(record.videoAttemptCostCents, "video estimate"),
    planningAttemptCostCents: integerOf(record.planningAttemptCostCents, "planning estimate"),
    localCeilingCents: integerOf(record.localCeilingCents, "local ceiling"),
  };
}

function parsePlaylistLesson(value: unknown): PlaylistLessonView {
  const record = recordOf(value, "playlist lesson");
  const identity = {
    sessionId: toClassroomSessionId(stringOf(record.sessionId, "playlist session id")),
    position: integerOf(record.position, "playlist position"),
    topic: topicOf(record.topic),
  };
  if (
    record.kind === "waiting" ||
    record.kind === "preparing" ||
    record.kind === "ready" ||
    record.kind === "playing" ||
    record.kind === "complete"
  ) {
    return { ...identity, kind: record.kind };
  }
  if (record.kind === "generating") {
    return {
      ...identity,
      kind: "generating",
      readyScenes: integerOf(record.readyScenes, "ready scene count"),
      targetScenes: integerOf(record.targetScenes, "target scene count"),
    };
  }
  if (record.kind === "failed") {
    return {
      ...identity,
      kind: "failed",
      message: nonEmptyStringOf(record.message, "playlist failure"),
    };
  }
  throw new Error("Unknown playlist lesson state");
}

function parseMetrics(value: unknown): ClassroomMetrics {
  const record = recordOf(value, "classroom metrics");
  return {
    readyScenes: integerOf(record.readyScenes, "ready scenes"),
    activeVideoJobs: integerOf(record.activeVideoJobs, "active jobs"),
    generatedScenes: integerOf(record.generatedScenes, "generated scenes"),
    skippedScenes: integerOf(record.skippedScenes, "skipped scenes"),
    generatedSeconds: numberOf(record.generatedSeconds, "generated seconds"),
    estimatedSpendCents: integerOf(record.estimatedSpendCents, "estimated spend"),
    latestPlanningMs: nullableNumberOf(record.latestPlanningMs, "latest planning"),
    latestGenerationMs: nullableNumberOf(record.latestGenerationMs, "latest generation"),
    averageGenerationMs: nullableNumberOf(record.averageGenerationMs, "average generation"),
    latestQueueWaitMs: nullableNumberOf(record.latestQueueWaitMs, "latest queue wait"),
    latestInferenceMs: nullableNumberOf(record.latestInferenceMs, "latest inference"),
    latestBrowserReadyMs: nullableNumberOf(record.latestBrowserReadyMs, "latest browser ready"),
    averageBrowserReadyMs: nullableNumberOf(record.averageBrowserReadyMs, "average browser ready"),
    bufferUnderruns: integerOf(record.bufferUnderruns, "buffer underruns"),
  };
}

function parseSnapshot(value: unknown): ClassroomSnapshot {
  const record = recordOf(value, "classroom snapshot");
  const logs = arrayOf(record.logs, "logs", (entry): LogEntry => {
    const log = recordOf(entry, "log entry");
    const level = stringOf(log.level, "log level");
    if (level !== "info" && level !== "warning" && level !== "error") throw new Error("Unknown log level");
    return { id: integerOf(log.id, "log id"), atMs: numberOf(log.atMs, "log time"), level, message: nonEmptyStringOf(log.message, "log message") };
  });
  return {
    id: toClassroomSessionId(stringOf(record.id, "session id")),
    teacherId: parseTeacherId(record.teacherId),
    version: integerOf(record.version, "snapshot version"),
    epoch: integerOf(record.epoch, "snapshot epoch"),
    configured: booleanOf(record.configured, "configured"),
    fixture: booleanOf(record.fixture, "fixture"),
    phase: parsePhase(record.phase),
    topic: nullableStringOf(record.topic, "topic"),
    lesson: record.lesson === null ? null : parseLessonPlan(record.lesson),
    production: parseProduction(record.production),
    playback: parsePlayback(record.playback),
    hasPlaybackBegun: booleanOf(record.hasPlaybackBegun, "has playback begun"),
    committedThrough: integerOf(record.committedThrough, "committed through"),
    scenes: arrayOf(record.scenes, "scenes", parseScene),
    ready: arrayOf(record.ready, "ready segments", parseSegment),
    playing: record.playing === null ? null : parseSegment(record.playing),
    currentPrompt: record.currentPrompt === null ? null : toPrompt(stringOf(record.currentPrompt, "current prompt")),
    nextPrompt: record.nextPrompt === null ? null : toPrompt(stringOf(record.nextPrompt, "next prompt")),
    policy: parsePolicy(record.policy),
    metrics: parseMetrics(record.metrics),
    warning: nullableStringOf(record.warning, "warning"),
    logs,
    playlist: arrayOf(record.playlist, "playlist", parsePlaylistLesson),
  };
}

function parseOutcome(value: unknown): CommandOutcome {
  const record = recordOf(value, "command outcome");
  if (record.kind === "snapshot") return { kind: "snapshot", snapshot: parseSnapshot(record.snapshot) };
  throw new Error("Unknown command outcome kind");
}

export function parseClassroomApiResponse(value: unknown): ClassroomApiResponse {
  const record = recordOf(value, "API response");
  if (record.ok === true) return { ok: true, outcome: parseOutcome(record.outcome) };
  if (record.ok === false) {
    const error = recordOf(record.error, "API error");
    return { ok: false, error: { code: nonEmptyStringOf(error.code, "error code"), message: nonEmptyStringOf(error.message, "error message") } };
  }
  throw new Error("API response is invalid");
}
