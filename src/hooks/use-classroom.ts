"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  toClassroomSessionId,
  toCommandId,
} from "@/lib/classroom-boundaries";
import { lessonHasFailed, lessonIsBusy } from "@/lib/classroom-status";
import { CLASSROOM_CONFIG, DEMO_CONFIG } from "@/lib/classroom-config";
import { ClassroomApiError, clearClassroomSession, isMissingClassroomSession, isTransientClassroomError, sendClassroomCommand, shouldAcceptClassroomSnapshot, watchClassroomSession } from "@/lib/classroom-connection";
import type {
  ClassroomSessionId,
  ClassroomSnapshot,
  ClientPlaybackSegment,
  CommandId,
  CommandOutcome,
  LessonDurationSeconds,
  PlaybackReport,
  PlayableSegment,
  TeacherId,
} from "@/lib/classroom-types";

const SESSION_STORAGE_KEY = "tung-classroom-session-v1";

function newSafeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function initialSessionId(storageKey: string): ClassroomSessionId {
  if (typeof window !== "undefined") {
    let stored: string | null = null;
    try { stored = window.sessionStorage.getItem(storageKey); } catch { /* Private/blocked storage still permits an in-memory session. */ }
    if (stored) {
      try {
        return toClassroomSessionId(stored);
      } catch {
        try { window.sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
      }
    }
  }
  const created = toClassroomSessionId(newSafeId("classroom"));
  if (typeof window !== "undefined") {
    try { window.sessionStorage.setItem(storageKey, created); } catch { /* Optional storage. */ }
  }
  return created;
}

function toClientSegment(segment: PlayableSegment): ClientPlaybackSegment {
  if (segment.kind === "skipped") {
    return segment;
  }
  return {
    kind: "generated",
    id: segment.id,
    number: segment.number,
    durationSeconds: segment.durationSeconds,
    purpose: segment.purpose,
    prompt: segment.prompt,
    summary: segment.summary,
    captions: segment.captions,
    videoUrl: segment.videoUrl,
    expandedPrompt: segment.expandedPrompt,
    timings: segment.timings,
  };
}

export function useClassroom(storageKey = SESSION_STORAGE_KEY, options?: { apiBase?: string; enabled?: boolean }) {
  const apiBase = options?.apiBase ?? "/api/classroom";
  const enabled = options?.enabled ?? true;
  const [sessionId, setSessionId] = useState<ClassroomSessionId>(() => initialSessionId(storageKey));
  const [snapshot, setSnapshot] = useState<ClassroomSnapshot | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const snapshotRef = useRef<ClassroomSnapshot | null>(null);
  const sessionRef = useRef({ id: sessionId, expired: false });
  const retiredRuntimesRef = useRef(new Set<string>());
  const commandControllerRef = useRef<AbortController | null>(null);
  const playbackQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    const controller = new AbortController();
    commandControllerRef.current = controller;
    playbackQueueRef.current = Promise.resolve();
    return () => controller.abort();
  }, [sessionId]);

  const replaceSession = useCallback(() => {
    const nextId = toClassroomSessionId(newSafeId("classroom"));
    try { window.sessionStorage.setItem(storageKey, nextId); } catch { /* Optional storage. */ }
    sessionRef.current = { id: nextId, expired: false };
    commandControllerRef.current?.abort();
    retiredRuntimesRef.current.clear();
    snapshotRef.current = null;
    setSnapshot(null);
    setConnectionError(null);
    setCommandError(null);
    setSessionExpired(false);
    setSessionId(nextId);
  }, [storageKey]);

  const acceptSnapshot = useCallback((next: ClassroomSnapshot) => {
    if (next.id !== sessionRef.current.id || sessionRef.current.expired) return;
    const current = snapshotRef.current;
    if (!shouldAcceptClassroomSnapshot(current, next, retiredRuntimesRef.current)) return;
    if (current?.runtimeId && current.runtimeId !== next.runtimeId) retiredRuntimesRef.current.add(current.runtimeId);
    // A successful poll can clear a transient connection error without replacing
    // identical state and waking a demand-rendered classroom every 600 ms.
    if (current?.id === next.id && current.runtimeId === next.runtimeId && current.version === next.version && current.configured === next.configured) {
      setConnectionError(null);
      return;
    }
    snapshotRef.current = next;
    setSnapshot(next);
    setConnectionError(null);
  }, []);

  const reportConnectionError = useCallback((error: unknown, requestSessionId: ClassroomSessionId) => {
    if (requestSessionId !== sessionRef.current.id || sessionRef.current.expired) return;
    if (isMissingClassroomSession(error)) {
      if (snapshotRef.current?.production.kind === "idle") {
        // No course has begun: restore an empty session without submitting the topic.
        replaceSession();
        return;
      }
      sessionRef.current.expired = true;
      setSessionExpired(true);
      setConnectionError("课堂连接已失效，请重新进入教室。已提交的生成不会自动重试。");
      return;
    }
    setConnectionError(isTransientClassroomError(error) ? "正在恢复课堂连接，已提交任务仍在后台处理。请勿重复提交。" : error instanceof Error ? error.message : "课堂暂时无法连接，请稍后重试。");
  }, [replaceSession]);

  useEffect(() => enabled ? watchClassroomSession({
    apiBase,
    sessionId,
    onSnapshot: acceptSnapshot,
    onError: (error) => reportConnectionError(error, sessionId),
  }) : undefined, [acceptSnapshot, apiBase, enabled, reportConnectionError, sessionId]);

  const postCommand = useCallback(async (
    command: Record<string, unknown>,
    commandId = toCommandId(newSafeId("command")),
  ): Promise<CommandOutcome> => {
    if (sessionId !== sessionRef.current.id || sessionRef.current.expired) throw new Error("课堂连接已失效，请重新进入教室。");
    const controller = commandControllerRef.current;
    if (!controller || controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const outcome = await sendClassroomCommand({ apiBase, sessionId, command, commandId, signal: controller.signal,
      onRetry: () => {
        if (sessionId === sessionRef.current.id && !controller.signal.aborted) setConnectionError("正在确认已提交的问题，恢复后自动继续，请勿重复提交。");
      },
    });
    acceptSnapshot(outcome.snapshot);
    return outcome;
  }, [acceptSnapshot, apiBase, sessionId]);

  const send = useCallback(async (command: Record<string, unknown>): Promise<CommandOutcome | null> => {
    setCommandError(null);
    try {
      return await postCommand(command);
    } catch (error) {
      if (commandControllerRef.current?.signal.aborted || sessionId !== sessionRef.current.id) return null;
      if (error instanceof ClassroomApiError && !isMissingClassroomSession(error)) {
        setCommandError(error.message);
        return null;
      }
      reportConnectionError(error, sessionId);
      return null;
    }
  }, [postCommand, reportConnectionError, sessionId]);

  const clientReady = useMemo(() => snapshot?.ready.map(toClientSegment) ?? [], [snapshot]);
  const playing = useMemo(
    () => (snapshot?.playing ? toClientSegment(snapshot.playing) : null),
    [snapshot],
  );
  const playlist = snapshot?.playlist ?? [];
  const activePlaylistIndex = Math.max(
    0,
    playlist.findIndex(
      (lesson) => lesson.kind !== "complete" && lesson.kind !== "failed",
    ),
  );
  const queuedLessonCount = playlist
    .slice(activePlaylistIndex + 1)
    .filter((lesson) => lesson.kind !== "complete" && lesson.kind !== "failed")
    .length;

  const start = useCallback(async (input: {
    teacherId: TeacherId;
    topic: string;
    durationSeconds: LessonDurationSeconds;
  }) => {
    return send({ kind: "start", ...input, atMs: Date.now() });
  }, [send]);

  const stop = useCallback(async () => {
    await send({ kind: "stop-after-committed", atMs: Date.now() });
  }, [send]);

  const queueLesson = useCallback(async (topic: string) => {
    return send({ kind: "queue-lesson", topic, atMs: Date.now() });
  }, [send]);

  const reportPlayback = useCallback((report: PlaybackReport) => {
    if (sessionId !== sessionRef.current.id || sessionRef.current.expired) return;
    const commandId: CommandId = toCommandId(newSafeId("playback"));
    const command = { kind: "report-playback", report };
    // Reports must reach the server in playback order. An ended report arriving
    // before a delayed started report otherwise leaves an already-ended video
    // marked playing forever. Each report retains its ID while recovering.
    playbackQueueRef.current = playbackQueueRef.current.then(async () => {
      if (sessionId !== sessionRef.current.id || sessionRef.current.expired || commandControllerRef.current?.signal.aborted) return;
      try { await postCommand(command, commandId); }
      catch (error) {
        if (!commandControllerRef.current?.signal.aborted) reportConnectionError(error, sessionId);
      }
    });
  }, [postCommand, reportConnectionError, sessionId]);

  const clear = useCallback(async (abandon = false) => {
    if (sessionExpired) {
      replaceSession();
      return;
    }
    try {
      await clearClassroomSession({ apiBase, sessionId, abandon, signal: commandControllerRef.current?.signal,
        onRetry: () => { if (sessionId === sessionRef.current.id) setConnectionError("正在确认退出，网络恢复后自动完成。已受理的任务仍可能计费并保存结果。"); },
      });
      if (sessionId === sessionRef.current.id) replaceSession();
    } catch (error) {
      if (commandControllerRef.current?.signal.aborted || sessionId !== sessionRef.current.id) return;
      reportConnectionError(error, sessionId);
    }
  }, [apiBase, replaceSession, reportConnectionError, sessionExpired, sessionId]);

  const nominalRunway = snapshot?.hasPlaybackBegun
    ? 0
    : snapshot?.policy.startupRunwayScenes ?? CLASSROOM_CONFIG.startupRunwayScenes;
  const remainingPositions = snapshot?.scenes.filter(
    (scene) => scene.kind === "generating" || scene.kind === "ready",
  ).length ?? nominalRunway;
  const requiredRunway = snapshot?.production.kind === "draining"
    ? Math.min(nominalRunway, remainingPositions)
    : nominalRunway;

  return {
    snapshot,
    connectionError: commandError ?? connectionError,
    sessionExpired,
    playlist,
    queuedLessonCount,
    suggestedTopics: snapshot?.lesson?.suggestedTopics ?? [],
    providerReadyScenes: clientReady.length,
    playback: {
      runtimeId: snapshot?.runtimeId,
      epoch: snapshot?.epoch ?? 0,
      running: !sessionExpired && snapshot !== null && snapshot.production.kind !== "idle" && snapshot.production.kind !== "closed",
      status: snapshot?.playback.kind ?? "idle",
      playing,
      ready: clientReady,
      requiredRunway,
    },
    actions: {
      resetConnection: replaceSession,
      start,
      queueLesson,
      stop,
      clear,
      reportPlayback,
      canStart: !sessionExpired && snapshot?.production.kind === "idle" && snapshot.configured,
      canQueue:
        !sessionExpired &&
        snapshot?.lesson != null &&
        !lessonHasFailed(snapshot) &&
        snapshot.playlist.length - 1 < DEMO_CONFIG.maxFollowups &&
        queuedLessonCount < (snapshot?.policy.maxQueuedLessons ?? CLASSROOM_CONFIG.maxQueuedLessons),
      canStop: !sessionExpired && (snapshot?.production.kind === "preparing" || snapshot?.production.kind === "teaching"),
      canClear: sessionExpired || (snapshot !== null && !lessonIsBusy(snapshot) && snapshot.metrics.activeVideoJobs === 0),
    },
  } as const;
}
