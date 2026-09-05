"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parseClassroomApiResponse,
  toClassroomSessionId,
  toCommandId,
} from "@/lib/classroom-boundaries";
import { lessonHasFailed, lessonIsBusy } from "@/lib/classroom-status";
import { CLASSROOM_CONFIG, DEMO_CONFIG } from "@/lib/classroom-config";
import { isMissingClassroomSession, readClassroomResponse, watchClassroomSession } from "@/lib/classroom-connection";
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

function initialSessionId(): ClassroomSessionId {
  if (typeof window !== "undefined") {
    const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      try {
        return toClassroomSessionId(stored);
      } catch {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  }
  const created = toClassroomSessionId(newSafeId("classroom"));
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
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

export function useClassroom() {
  const [sessionId, setSessionId] = useState<ClassroomSessionId>(initialSessionId);
  const [snapshot, setSnapshot] = useState<ClassroomSnapshot | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const snapshotRef = useRef<ClassroomSnapshot | null>(null);
  const sessionRef = useRef({ id: sessionId, expired: false });

  const replaceSession = useCallback(() => {
    const nextId = toClassroomSessionId(newSafeId("classroom"));
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextId);
    sessionRef.current = { id: nextId, expired: false };
    snapshotRef.current = null;
    setSnapshot(null);
    setConnectionError(null);
    setSessionExpired(false);
    setSessionId(nextId);
  }, []);

  const acceptSnapshot = useCallback((next: ClassroomSnapshot) => {
    if (next.id !== sessionRef.current.id || sessionRef.current.expired) return;
    const current = snapshotRef.current;
    if (current?.id === next.id && current.version > next.version) return;
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
    setConnectionError(error instanceof Error ? error.message : "课堂暂时无法连接，请稍后重试。");
  }, [replaceSession]);

  useEffect(() => watchClassroomSession({
    sessionId,
    onSnapshot: acceptSnapshot,
    onError: (error) => reportConnectionError(error, sessionId),
  }), [acceptSnapshot, reportConnectionError, sessionId]);

  const postCommand = useCallback(async (
    command: Record<string, unknown>,
    commandId = toCommandId(newSafeId("command")),
  ): Promise<CommandOutcome> => {
    if (sessionId !== sessionRef.current.id || sessionRef.current.expired) throw new Error("课堂连接已失效，请重新进入教室。");
    const response = await fetch(`/api/classroom/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: commandId, ...command }),
    });
    const outcome = await readClassroomResponse(response, sessionId);
    acceptSnapshot(outcome.snapshot);
    return outcome;
  }, [acceptSnapshot, sessionId]);

  const send = useCallback(async (command: Record<string, unknown>): Promise<CommandOutcome | null> => {
    try {
      return await postCommand(command);
    } catch (error) {
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
    await send({ kind: "start", ...input, atMs: Date.now() });
  }, [send]);

  const stop = useCallback(async () => {
    await send({ kind: "stop-after-committed", atMs: Date.now() });
  }, [send]);

  const queueLesson = useCallback(async (topic: string) => {
    await send({ kind: "queue-lesson", topic, atMs: Date.now() });
  }, [send]);

  const reportPlayback = useCallback((report: PlaybackReport) => {
    if (sessionId !== sessionRef.current.id || sessionRef.current.expired) return;
    const commandId: CommandId = toCommandId(newSafeId("playback"));
    const command = { kind: "report-playback", report };
    void postCommand(command, commandId).catch((error) => {
      if (isMissingClassroomSession(error)) {
        reportConnectionError(error, sessionId);
        return;
      }
      window.setTimeout(() => {
        if (sessionId !== sessionRef.current.id || sessionRef.current.expired) return;
        void postCommand(command, commandId).catch((error) => {
          reportConnectionError(error, sessionId);
        });
      }, 500);
    });
  }, [postCommand, reportConnectionError, sessionId]);

  const clear = useCallback(async () => {
    if (sessionExpired) {
      replaceSession();
      return;
    }
    try {
      const response = await fetch(`/api/classroom/${sessionId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = parseClassroomApiResponse(await response.json());
        throw new Error(result.ok ? "The classroom could not be reset." : result.error.message);
      }
      if (sessionId === sessionRef.current.id) replaceSession();
    } catch (error) {
      reportConnectionError(error, sessionId);
    }
  }, [replaceSession, reportConnectionError, sessionExpired, sessionId]);

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
    connectionError,
    sessionExpired,
    playlist,
    queuedLessonCount,
    suggestedTopics: snapshot?.lesson?.suggestedTopics ?? [],
    providerReadyScenes: clientReady.length,
    playback: {
      epoch: snapshot?.epoch ?? 0,
      running: !sessionExpired && snapshot !== null && snapshot.production.kind !== "idle" && snapshot.production.kind !== "closed",
      status: snapshot?.playback.kind ?? "idle",
      playing,
      ready: clientReady,
      requiredRunway,
    },
    actions: {
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
        queuedLessonCount < CLASSROOM_CONFIG.maxQueuedLessons,
      canStop: !sessionExpired && (snapshot?.production.kind === "preparing" || snapshot?.production.kind === "teaching"),
      canClear: sessionExpired || (snapshot !== null && !lessonIsBusy(snapshot) && snapshot.metrics.activeVideoJobs === 0),
    },
  } as const;
}
