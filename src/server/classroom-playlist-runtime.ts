import { randomUUID } from "node:crypto";
import {
  toClassroomSessionId,
  toCommandId,
} from "@/lib/classroom-boundaries";
import { CLASSROOM_CONFIG, DEMO_CONFIG, sceneCountForDuration } from "@/lib/classroom-config";
import { lessonHasFailed, lessonIsBusy } from "@/lib/classroom-status";
import { recordingTopicKey, type RecordedClassroom, type RecordedLesson } from "@/lib/saved-classroom";
import type {
  ClassroomCommand,
  ClassroomMetrics,
  ClassroomSessionId,
  ClassroomSnapshot,
  CommandId,
  CommandOutcome,
  PlaylistLessonView,
  LessonDurationSeconds,
  SceneId,
  TeacherId,
} from "@/lib/classroom-types";

export type ClassroomWorkerRuntime = Readonly<{
  replay(sessionId: ClassroomSessionId, recording: RecordedLesson): ClassroomSnapshot;
  create(input: { sessionId: ClassroomSessionId }): ClassroomSnapshot;
  view(sessionId: ClassroomSessionId): ClassroomSnapshot | null;
  command(
    sessionId: ClassroomSessionId,
    command: ClassroomCommand,
  ): CommandOutcome | null;
  clear(sessionId: ClassroomSessionId): Promise<boolean>;
}>;

type PlaylistEntry = {
  sessionId: ClassroomSessionId;
  topic: string | null;
  startCommandId: CommandId;
  started: boolean;
  cancelledMessage: string | null;
};

export type LessonSelection = Readonly<{
  teacherId: TeacherId;
  playlistId: ClassroomSessionId;
  sessionId: ClassroomSessionId;
  previousSessionId: ClassroomSessionId | null;
  position: number;
  topic: string;
  durationSeconds: LessonDurationSeconds;
  commandId: CommandId;
}>;

type PlaylistSession = {
  replay: RecordedClassroom | null;
  id: ClassroomSessionId;
  entries: PlaylistEntry[];
  version: number;
  stopped: boolean;
  warning: string | null;
  handledCommands: Map<CommandId, CommandOutcome>;
};

function childCommandId(commandId: CommandId, suffix: string): CommandId {
  return toCommandId(`${suffix}:${commandId}`.slice(0, 180));
}

function providerComplete(snapshot: ClassroomSnapshot): boolean {
  return (
    snapshot.lesson !== null &&
    snapshot.scenes.length === snapshot.lesson.targetSceneCount &&
    snapshot.scenes.every(
      (scene) =>
        scene.kind === "ready" ||
        scene.kind === "playing" ||
        scene.kind === "played",
    )
  );
}

function terminalFailure(snapshot: ClassroomSnapshot): boolean {
  return (
    lessonHasFailed(snapshot) &&
    !snapshot.scenes.some((scene) => scene.kind === "generating" || scene.kind === "ready" || scene.kind === "playing")
  );
}

function playlistView(
  entry: PlaylistEntry,
  snapshot: ClassroomSnapshot,
  position: number,
): PlaylistLessonView {
  const identity = {
    sessionId: entry.sessionId,
    position,
    topic: entry.topic ?? snapshot.topic ?? "Waiting for a lesson topic",
  };
  if (entry.cancelledMessage) {
    return { ...identity, kind: "failed", message: entry.cancelledMessage };
  }
  if (!entry.started || snapshot.production.kind === "idle") {
    return { ...identity, kind: "waiting" };
  }
  if (terminalFailure(snapshot)) {
    return {
      ...identity,
      kind: "failed",
      message: snapshot.warning ?? "The lesson could not be prepared.",
    };
  }
  if (snapshot.playback.kind === "playing") {
    return { ...identity, kind: "playing" };
  }
  if (snapshot.playback.kind === "ended" || snapshot.production.kind === "closed") {
    return { ...identity, kind: "complete" };
  }
  if (snapshot.production.kind === "preparing") {
    return { ...identity, kind: "preparing" };
  }
  if (providerComplete(snapshot)) {
    return { ...identity, kind: "ready" };
  }
  return {
    ...identity,
    kind: "generating",
    readyScenes: snapshot.scenes.filter(
      (scene) => scene.kind === "ready" || scene.kind === "playing" || scene.kind === "played",
    ).length,
    targetScenes: snapshot.lesson?.targetSceneCount ?? sceneCountForDuration(
      position === 1 ? DEMO_CONFIG.initialDurationSeconds : DEMO_CONFIG.followupDurationSeconds,
    ),
  };
}

function aggregateMetrics(
  active: ClassroomMetrics,
  snapshots: readonly ClassroomSnapshot[],
  readyScenes: number,
): ClassroomMetrics {
  return {
    ...active,
    readyScenes,
    activeVideoJobs: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.metrics.activeVideoJobs,
      0,
    ),
    generatedScenes: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.metrics.generatedScenes,
      0,
    ),
    skippedScenes: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.metrics.skippedScenes,
      0,
    ),
    generatedSeconds: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.metrics.generatedSeconds,
      0,
    ),
    estimatedSpendCents: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.metrics.estimatedSpendCents,
      0,
    ),
    bufferUnderruns: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.metrics.bufferUnderruns,
      0,
    ),
  };
}

export class ClassroomPlaylistRuntime {
  private readonly sessions = new Map<ClassroomSessionId, PlaylistSession>();

  constructor(
    private readonly worker: ClassroomWorkerRuntime,
    private readonly recordSelection?: (selection: LessonSelection) => void,
  ) {}

  create(input: { sessionId: ClassroomSessionId }): ClassroomSnapshot {
    const existing = this.sessions.get(input.sessionId);
    if (existing) return this.snapshot(existing);
    this.worker.create(input);
    const session: PlaylistSession = {
      replay: null,
      id: input.sessionId,
      entries: [
        {
          sessionId: input.sessionId,
          topic: null,
          startCommandId: toCommandId(`playlist-start-${randomUUID()}`),
          started: false,
          cancelledMessage: null,
        },
      ],
      version: 0,
      stopped: false,
      warning: null,
      handledCommands: new Map(),
    };
    this.sessions.set(input.sessionId, session);
    return this.snapshot(session);
  }

  view(sessionId: ClassroomSessionId): ClassroomSnapshot | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    this.schedule(session);
    return this.snapshot(session);
  }

  replay(sessionId: ClassroomSessionId, recording: RecordedClassroom, commandId: CommandId): CommandOutcome | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const duplicate = session.handledCommands.get(commandId);
    if (duplicate) return duplicate;
    if (session.entries[0]!.started) throw new Error("请先返回新课堂，再开始播放。");
    const opening = recording.lessons[0];
    if (!opening) throw new Error("Saved classroom has no opening lesson.");
    this.worker.replay(sessionId, opening);
    session.replay = recording;
    session.entries[0]!.topic = opening.lesson.topic;
    session.entries[0]!.started = true;
    session.version += 1;
    const outcome = { kind: "snapshot", snapshot: this.snapshot(session) } as const;
    session.handledCommands.set(commandId, outcome);
    return outcome;
  }

  command(
    sessionId: ClassroomSessionId,
    command: ClassroomCommand,
  ): CommandOutcome | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const duplicate = session.handledCommands.get(command.id);
    if (duplicate) return duplicate;

    let outcome: CommandOutcome;
    switch (command.kind) {
      case "start": {
        if (command.durationSeconds !== DEMO_CONFIG.initialDurationSeconds) {
          session.warning = "Start this demo with a 30-second lesson.";
          session.version += 1;
          outcome = { kind: "snapshot", snapshot: this.snapshot(session) };
          break;
        }
        const primary = session.entries[0];
        if (!primary) return null;
        if (!primary.started) {
          this.recordSelection?.({
            playlistId: session.id, sessionId: primary.sessionId, previousSessionId: null,
            position: 1, topic: command.topic, durationSeconds: command.durationSeconds, commandId: command.id,
            teacherId: command.teacherId,
          });
        }
        const workerOutcome = this.worker.command(primary.sessionId, command);
        if (!workerOutcome) return null;
        const workerSnapshot = workerOutcome.snapshot;
        if (workerSnapshot.production.kind !== "idle") {
          primary.started = true;
          primary.topic = command.topic;
          session.warning = null;
          session.version += 1;
        }
        outcome = { kind: "snapshot", snapshot: this.snapshot(session) };
        break;
      }
      case "queue-lesson":
        outcome = this.queue(session, command);
        break;
      case "stop-after-committed":
        session.stopped = true;
        session.warning = null;
        for (const [index, entry] of session.entries.entries()) {
          if (entry.started) {
            this.worker.command(entry.sessionId, {
              ...command,
              id: childCommandId(command.id, `stop-${index + 1}`),
            });
          } else if (index > 0) {
            entry.cancelledMessage = "Stopped before this queued lesson began generating.";
          }
        }
        session.version += 1;
        outcome = { kind: "snapshot", snapshot: this.snapshot(session) };
        break;
      case "report-playback":
        this.routePlayback(session, command);
        outcome = { kind: "snapshot", snapshot: this.snapshot(session) };
        break;
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
    session.handledCommands.set(command.id, outcome);
    this.schedule(session);
    return { kind: "snapshot", snapshot: this.snapshot(session) };
  }

  async clear(sessionId: ClassroomSessionId): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return true;
    const snapshots = this.workerSnapshots(session);
    if (snapshots.some(lessonIsBusy)) return false;
    const results = await Promise.all(
      session.entries.map((entry) => this.worker.clear(entry.sessionId)),
    );
    if (results.some((result) => !result)) return false;
    this.sessions.delete(sessionId);
    return true;
  }

  private queue(
    session: PlaylistSession,
    command: Extract<ClassroomCommand, { kind: "queue-lesson" }>,
  ): CommandOutcome {
    const active = this.activeEntry(session) ?? session.entries[0]!;
    const activeIndex = session.entries.findIndex(
      (entry) => entry.sessionId === active.sessionId,
    );
    const queuedCount = session.entries
      .slice(activeIndex + 1)
      .filter((entry) => !entry.cancelledMessage).length;
    if (!session.entries[0]?.started) {
      session.warning = "Start the current lesson before adding another one.";
    } else if (session.stopped) {
      session.warning = "This playlist is stopping and cannot accept another lesson.";
    } else if (session.entries.length - 1 >= DEMO_CONFIG.maxFollowups) {
      session.warning = "Both follow-ups have been selected. This demo is limited to 50 seconds.";
    } else if (queuedCount >= CLASSROOM_CONFIG.maxQueuedLessons) {
      session.warning = `The local playlist holds ${CLASSROOM_CONFIG.maxQueuedLessons} upcoming lessons at a time.`;
    } else if (
      session.entries.slice(activeIndex).some(
        (entry) =>
          !entry.cancelledMessage &&
          entry.topic?.toLowerCase() === command.topic.toLowerCase(),
      )
    ) {
      session.warning = "That lesson is already in the playlist.";
    } else {
      if (session.replay !== null) {
        const next = session.replay.lessons[session.entries.length];
        if (!next || recordingTopicKey(next.lesson.topic) !== recordingTopicKey(command.topic)) {
          session.warning = "这个分支还没有保存的视频，请选择之前播放过的续讲问题。";
          session.version += 1;
          return { kind: "snapshot", snapshot: this.snapshot(session) };
        }
        const childId = toClassroomSessionId(`replay-child-${randomUUID()}`);
        this.worker.create({ sessionId: childId });
        this.worker.replay(childId, next);
        session.entries.push({ sessionId: childId, topic: next.lesson.topic, startCommandId: childCommandId(command.id, "replay"), started: true, cancelledMessage: null });
        session.warning = null;
        session.version += 1;
        return { kind: "snapshot", snapshot: this.snapshot(session) };
      }
      const childId = toClassroomSessionId(
        `playlist-child-${randomUUID()}`,
      );
      this.recordSelection?.({
        playlistId: session.id, sessionId: childId,
        previousSessionId: session.entries[session.entries.length - 1]!.sessionId,
        position: session.entries.length + 1, topic: command.topic,
        teacherId: this.primaryTeacher(session),
        durationSeconds: DEMO_CONFIG.followupDurationSeconds, commandId: command.id,
      });
      this.worker.create({ sessionId: childId });
      session.entries.push({
        sessionId: childId,
        topic: command.topic,
        startCommandId: childCommandId(command.id, "start"),
        started: false,
        cancelledMessage: null,
      });
      session.warning = null;
      session.version += 1;
    }
    return { kind: "snapshot", snapshot: this.snapshot(session) };
  }

  private schedule(session: PlaylistSession): void {
    if (session.stopped) return;
    if (this.workerSnapshots(session).some(lessonHasFailed)) {
      session.stopped = true;
      for (const entry of session.entries) {
        if (!entry.started) entry.cancelledMessage = "Cancelled because the previous lesson failed.";
      }
      session.version += 1;
      return;
    }
    for (let index = 1; index < session.entries.length; index += 1) {
      const entry = session.entries[index];
      const predecessor = session.entries[index - 1];
      if (!entry || !predecessor || entry.started || entry.cancelledMessage) continue;
      const predecessorSnapshot = this.worker.view(predecessor.sessionId);
      if (!predecessorSnapshot) return;
      if (
        !providerComplete(predecessorSnapshot) &&
        !terminalFailure(predecessorSnapshot) &&
        predecessorSnapshot.playback.kind !== "ended"
      ) {
        return;
      }
      const topic = entry.topic;
      if (!topic) return;
      const outcome = this.worker.command(entry.sessionId, {
        kind: "start",
        id: entry.startCommandId,
        topic,
        durationSeconds: DEMO_CONFIG.followupDurationSeconds,
        teacherId: this.primaryTeacher(session),
        atMs: Date.now(),
      });
      if (!outcome) return;
      entry.started = outcome.snapshot.production.kind !== "idle";
      session.version += 1;
      return;
    }
  }

  private primaryTeacher(session: PlaylistSession): TeacherId {
    const primary = this.worker.view(session.id);
    if (!primary) throw new Error("The primary classroom worker is missing");
    return primary.teacherId;
  }

  private routePlayback(
    session: PlaylistSession,
    command: Extract<ClassroomCommand, { kind: "report-playback" }>,
  ): void {
    const report = command.report;
    if (report.kind === "advanced") {
      const finishedOwner = this.ownerOf(session, report.finishedSceneId);
      const startedOwner = this.ownerOf(session, report.startedSceneId);
      if (!finishedOwner || !startedOwner) return;
      if (finishedOwner.sessionId === startedOwner.sessionId) {
        this.worker.command(finishedOwner.sessionId, command);
        return;
      }
      this.worker.command(finishedOwner.sessionId, {
        kind: "report-playback",
        id: childCommandId(command.id, "finished"),
        report: {
          kind: "drained",
          finishedSceneId: report.finishedSceneId,
          atMs: report.atMs,
        },
      });
      this.worker.command(startedOwner.sessionId, {
        kind: "report-playback",
        id: childCommandId(command.id, "started"),
        report: {
          kind: "started",
          sceneId: report.startedSceneId,
          atMs: report.atMs,
        },
      });
      return;
    }
    const sceneId =
      report.kind === "drained" ? report.finishedSceneId : report.sceneId;
    const owner = this.ownerOf(session, sceneId);
    if (owner) this.worker.command(owner.sessionId, command);
  }

  private ownerOf(session: PlaylistSession, sceneId: SceneId): PlaylistEntry | null {
    return (
      session.entries.find((entry) =>
        this.worker
          .view(entry.sessionId)
          ?.scenes.some((scene) => scene.id === sceneId),
      ) ?? null
    );
  }

  private activeEntry(session: PlaylistSession): PlaylistEntry | null {
    const entries = session.entries.filter((entry) => entry.started && !entry.cancelledMessage);
    return (
      entries.find(
        (entry) => this.worker.view(entry.sessionId)?.playback.kind === "playing",
      ) ??
      entries.find((entry) => {
        const snapshot = this.worker.view(entry.sessionId);
        return snapshot && snapshot.playback.kind !== "ended" && !terminalFailure(snapshot);
      }) ??
      entries.at(-1) ??
      null
    );
  }

  private workerSnapshots(session: PlaylistSession): ClassroomSnapshot[] {
    return session.entries
      .map((entry) => this.worker.view(entry.sessionId))
      .filter((snapshot): snapshot is ClassroomSnapshot => snapshot !== null);
  }

  private snapshot(session: PlaylistSession): ClassroomSnapshot {
    const snapshots = this.workerSnapshots(session);
    const primary = snapshots[0];
    if (!primary) throw new Error("The primary classroom worker is missing");
    const activeEntry = this.activeEntry(session) ?? session.entries[0]!;
    const activeIndex = Math.max(
      0,
      session.entries.findIndex((entry) => entry.sessionId === activeEntry.sessionId),
    );
    const active = snapshots.find((snapshot) => snapshot.id === activeEntry.sessionId) ?? primary;
    const ready = snapshots.slice(activeIndex).flatMap((snapshot) => snapshot.ready);
    const playingOwner = snapshots.find((snapshot) => snapshot.playing !== null);
    const playing = playingOwner?.playing ?? null;
    const playlist = session.entries.map((entry, index) => {
      const workerSnapshot = snapshots.find((snapshot) => snapshot.id === entry.sessionId);
      if (!workerSnapshot) throw new Error("A playlist worker is missing");
      return playlistView(entry, workerSnapshot, index + 1);
    });
    const allFinished = playlist.every(
      (entry) => entry.kind === "complete" || entry.kind === "failed",
    );
    const phase = allFinished ? "complete" : active.phase;
    const playback = allFinished
      ? { kind: "ended" as const, finalSceneNumber: active.playback.kind === "ended" ? active.playback.finalSceneNumber : null }
      : active.playback;
    return {
      ...active,
      teacherId: primary.teacherId,
      id: session.id,
      version:
        session.version + snapshots.reduce((sum, snapshot) => sum + snapshot.version, 0),
      epoch: primary.epoch,
      phase,
      playback,
      hasPlaybackBegun: snapshots.some((snapshot) => snapshot.hasPlaybackBegun),
      ready,
      playing,
      currentPrompt: playingOwner?.currentPrompt ?? null,
      nextPrompt: ready[0]?.prompt ?? null,
      metrics: aggregateMetrics(active.metrics, snapshots, ready.length),
      warning: session.warning ?? active.warning,
      playlist,
    };
  }
}
