export type ClassroomSessionId = string & { readonly __brand: "ClassroomSessionId" };
export type SceneId = string & { readonly __brand: "SceneId" };
export type LessonStepId = string & { readonly __brand: "LessonStepId" };
export type CommandId = string & { readonly __brand: "CommandId" };
export type EffectId = string & { readonly __brand: "EffectId" };
export type Prompt = string & { readonly __brand: "Prompt" };

export type SceneNumber = number;
export type LessonDurationSeconds = 10 | 30;
export type LessonSceneCount = 2 | 6;
export type TeacherId = "monokuma" | "monomi";

export type CaptionCue = Readonly<{
  startSeconds: number;
  endSeconds: number;
  text: string;
}>;

export type ProgressionRole =
  | "hook"
  | "foundation"
  | "mechanism"
  | "example"
  | "connection"
  | "misconception"
  | "application"
  | "transition"
  | "synthesis"
  | "recap";

export type LessonStep = Readonly<{
  id: LessonStepId;
  position: SceneNumber;
  role: ProgressionRole;
  title: string;
  teachingGoal: string;
  narration: string;
  concept: string;
  summary: string;
  visualAction: string;
  required: boolean;
}>;

export type LessonPlan = Readonly<{
  teacherId: TeacherId;
  topic: string;
  title: string;
  bigQuestion: string;
  durationSeconds: LessonDurationSeconds;
  targetSceneCount: LessonSceneCount;
  steps: readonly LessonStep[];
  preparedBy: string;
  preparationLatencyMs: number;
  suggestedTopics: readonly [string, string, string];
}>;

type PlaylistLessonIdentity = Readonly<{
  sessionId: ClassroomSessionId;
  position: number;
  topic: string;
}>;

export type PlaylistLessonView = PlaylistLessonIdentity &
  (
    | Readonly<{ kind: "waiting" }>
    | Readonly<{ kind: "preparing" }>
    | Readonly<{
        kind: "generating";
        readyScenes: number;
        targetScenes: number;
      }>
    | Readonly<{ kind: "ready" }>
    | Readonly<{ kind: "playing" }>
    | Readonly<{ kind: "complete" }>
    | Readonly<{ kind: "failed"; message: string }>
  );

export type LessonLedger = Readonly<{
  nextStepIndex: number;
  conceptsPlanned: readonly string[];
  recentNarrations: readonly string[];
  recentVisuals: readonly string[];
}>;

export type ScenePurpose = Readonly<{
  kind: "lesson";
  stepId: LessonStepId;
}>;

export type ValidatedScenePlan = Readonly<{
  teacherId: TeacherId;
  validation: "validated";
  sceneNumber: SceneNumber;
  purpose: ScenePurpose;
  prompt: Prompt;
  narration: string;
  captions: readonly CaptionCue[];
  concept: string;
  summary: string;
  visualAction: string;
  ledgerAfter: LessonLedger;
}>;

export type RenderTimings = Readonly<{
  requestId: string;
  queueWaitMs: number | null;
  inferenceMs: number | null;
  totalMs: number;
}>;

type SegmentIdentity = Readonly<{
  id: SceneId;
  number: SceneNumber;
  durationSeconds: number;
  purpose: ScenePurpose;
  prompt: Prompt;
  summary: string;
  captions: readonly CaptionCue[];
}>;

export type GeneratedSegment = SegmentIdentity &
  Readonly<{
    kind: "generated";
    videoUrl: string;
    providerUrl: string;
    expandedPrompt: string | null;
    timings: RenderTimings;
  }>;

export type SkippedSegment = SegmentIdentity &
  Readonly<{
    kind: "skipped";
    reason: "render-failed" | "delivery-failed";
    message: string;
  }>;

export type PlayableSegment = GeneratedSegment | SkippedSegment;

export type ClientPlaybackSegment =
  | (Omit<GeneratedSegment, "providerUrl"> & Readonly<{ videoUrl: string }>)
  | SkippedSegment;

export type SceneView =
  | Readonly<{
      kind: "generating";
      id: SceneId;
      number: SceneNumber;
      plan: ValidatedScenePlan;
      effectId: EffectId;
      startedAtMs: number;
    }>
  | Readonly<{
      kind: "ready";
      id: SceneId;
      number: SceneNumber;
      plan: ValidatedScenePlan;
      segment: PlayableSegment;
      generationTimeMs: number;
    }>
  | Readonly<{
      kind: "playing";
      id: SceneId;
      number: SceneNumber;
      plan: ValidatedScenePlan;
      segment: PlayableSegment;
      generationTimeMs: number;
      startedAtMs: number;
    }>
  | Readonly<{
      kind: "played";
      id: SceneId;
      number: SceneNumber;
      plan: ValidatedScenePlan;
      segment: PlayableSegment;
      generationTimeMs: number;
      startedAtMs: number;
      endedAtMs: number;
    }>
  | Readonly<{
      kind: "rejected";
      id: SceneId;
      number: SceneNumber;
      purpose: ScenePurpose;
      message: string;
    }>;

export type ProductionState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "preparing" }>
  | Readonly<{ kind: "teaching" }>
  | Readonly<{
      kind: "draining";
      reason: "lesson-complete" | "user-stop" | "planning-failed" | "render-failed";
    }>
  | Readonly<{ kind: "closed" }>;

export type PlaybackState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "priming" }>
  | Readonly<{ kind: "playing"; sceneNumber: SceneNumber }>
  | Readonly<{ kind: "buffering" }>
  | Readonly<{ kind: "ended"; finalSceneNumber: SceneNumber | null }>;

export type ClassroomPhase =
  | "idle"
  | "preparing"
  | "priming"
  | "live"
  | "buffering"
  | "draining"
  | "complete";

export type PlaybackReport =
  | Readonly<{
      kind: "media-ready";
      sceneId: SceneId;
      loadStartedAtMs: number;
      atMs: number;
    }>
  | Readonly<{ kind: "started"; sceneId: SceneId; atMs: number }>
  | Readonly<{
      kind: "advanced";
      finishedSceneId: SceneId;
      startedSceneId: SceneId;
      atMs: number;
    }>
  | Readonly<{ kind: "drained"; finishedSceneId: SceneId; atMs: number }>;

export type ClassroomCommand =
  | Readonly<{
      kind: "start";
      teacherId: TeacherId;
      id: CommandId;
      topic: string;
      durationSeconds: LessonDurationSeconds;
      atMs: number;
    }>
  | Readonly<{
      kind: "queue-lesson";
      id: CommandId;
      topic: string;
      atMs: number;
    }>
  | Readonly<{ kind: "stop-after-committed"; id: CommandId; atMs: number }>
  | Readonly<{ kind: "report-playback"; id: CommandId; report: PlaybackReport }>;

export type CommandOutcome = Readonly<{ kind: "snapshot"; snapshot: ClassroomSnapshot }>;

export type ClassroomPolicy = Readonly<{
  clipDurationSeconds: number;
  durationOptionsSeconds: readonly LessonDurationSeconds[];
  startupRunwayScenes: number;
  steadyRunwayScenes: number;
  recoveryRunwayScenes: number;
  videoConcurrency: number;
  maxLessonScenes: number;
  maxQueuedLessons: number;
  maxPlannerAttempts: number;
  videoAttemptCostCents: number;
  planningAttemptCostCents: number;
  localCeilingCents: number;
}>;

export type ClassroomMetrics = Readonly<{
  readyScenes: number;
  activeVideoJobs: number;
  generatedScenes: number;
  skippedScenes: number;
  generatedSeconds: number;
  estimatedSpendCents: number;
  latestPlanningMs: number | null;
  latestGenerationMs: number | null;
  averageGenerationMs: number | null;
  latestQueueWaitMs: number | null;
  latestInferenceMs: number | null;
  latestBrowserReadyMs: number | null;
  averageBrowserReadyMs: number | null;
  bufferUnderruns: number;
}>;

export type LogEntry = Readonly<{
  id: number;
  atMs: number;
  level: "info" | "warning" | "error";
  message: string;
}>;

export type ClassroomSnapshot = Readonly<{
  teacherId: TeacherId;
  id: ClassroomSessionId;
  version: number;
  epoch: number;
  configured: boolean;
  fixture: boolean;
  phase: ClassroomPhase;
  topic: string | null;
  lesson: LessonPlan | null;
  production: ProductionState;
  playback: PlaybackState;
  hasPlaybackBegun: boolean;
  committedThrough: SceneNumber;
  scenes: readonly SceneView[];
  ready: readonly PlayableSegment[];
  playing: PlayableSegment | null;
  currentPrompt: Prompt | null;
  nextPrompt: Prompt | null;
  policy: ClassroomPolicy;
  metrics: ClassroomMetrics;
  warning: string | null;
  logs: readonly LogEntry[];
  playlist: readonly PlaylistLessonView[];
}>;

export type ClassroomApiResponse =
  | Readonly<{ ok: true; outcome: CommandOutcome }>
  | Readonly<{ ok: false; error: Readonly<{ code: string; message: string }> }>;

export type PreparationResult =
  | Readonly<{
      ok: true;
      lesson: LessonPlan;
      ledger: LessonLedger;
      plannerAttemptsUsed: 1;
    }>
  | Readonly<{ ok: false; message: string; plannerAttemptsUsed: 1 }>;

export type RenderResult =
  | Readonly<{
      ok: true;
      videoUrl: string;
      providerUrl: string;
      expandedPrompt: string | null;
      timings: RenderTimings;
    }>
  | Readonly<{
      ok: false;
      reason: "render-failed" | "delivery-failed";
      message: string;
    }>;
