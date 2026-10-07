"use client";

import { TEACHERS } from "@/lib/classroom-config";
import { isYouthTeacher } from "@/lib/youth-classroom";
import { TeacherPortrait } from "@/components/teacher-portrait";
import { waitForMediaPlay, watchMediaLoad } from "@/components/media-watchdog";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginHandoff,
  mediaReady,
  type WaitingHandoff,
} from "@/components/playback-handoff";
import type {
  ClientPlaybackSegment,
  PlaybackReport,
  SceneId,
  TeacherId,
} from "@/lib/classroom-types";

const SLOTS = [0, 1, 2] as const;
type Slot = (typeof SLOTS)[number];
type GeneratedClientSegment = Extract<ClientPlaybackSegment, { kind: "generated" }>;

type Assignment = Readonly<{
  segment: GeneratedClientSegment;
  ready: boolean;
  token: number;
  loadStartedAtMs: number;
}>;

type Active = Readonly<{
  segment: ClientPlaybackSegment;
  slot: Slot | null;
}>;

type Activation =
  | Readonly<{ kind: "started" }>
  | Readonly<{ kind: "advanced"; finishedSceneId: SceneId }>;

type PendingActivation = Readonly<{
  segment: GeneratedClientSegment;
  activation: Activation;
}>;

export type LessonPlaybackIntent = Readonly<{
  runtimeId?: string;
  epoch: number;
  running: boolean;
  status: "idle" | "priming" | "playing" | "buffering" | "ended";
  playing: ClientPlaybackSegment | null;
  ready: readonly ClientPlaybackSegment[];
  requiredRunway: number;
}>;

export type SignoffState =
  | Readonly<{ kind: "queued"; topic: string }>
  | Readonly<{
      kind: "picks";
      picks: readonly string[];
      busyTopic: string | null;
      onPick(topic: string): void;
    }>
  | null;

export type LessonPlaybackIssue = Readonly<{ kind?: "media" | "gesture"; message: string; retry(): void }>;

type LessonDeckProps = Readonly<{
  playbackEnabled?: boolean;
  teacherId: TeacherId;
  phase: "idle" | "preparing" | "priming" | "live" | "buffering" | "draining" | "complete";
  signoff: SignoffState;
  warning: string | null;
  intent: LessonPlaybackIntent;
  onEvent(report: PlaybackReport): void;
  music: Readonly<{ enabled: boolean; toggle(): void }>;
  onExit?(): void;
  onPlaybackIssue?(issue: LessonPlaybackIssue | null): void;
}>;

function enoughData(video: HTMLVideoElement): boolean {
  return video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
}

function TelevisionStatic() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const width = 200;
    const height = 150;
    canvas.width = width;
    canvas.height = height;
    const frame = context.createImageData(width, height);
    const pixels = frame.data;
    const draw = () => {
      for (let index = 0; index < pixels.length; index += 4) {
        const value = (Math.random() * 256) | 0;
        pixels[index] = value;
        pixels[index + 1] = value;
        pixels[index + 2] = value;
        pixels[index + 3] = 255;
      }
      context.putImageData(frame, 0, 0);
    };
    draw();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let tick = 0;
    const loop = () => {
      tick += 1;
      if (tick % 2 === 0) draw();
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  return <canvas aria-hidden="true" className="television-static-canvas" ref={canvasRef} />;
}

function phaseMessage(
  phase: LessonDeckProps["phase"],
  chinese = false,
): Readonly<{ title: string; detail: string }> | null {
  switch (phase) {
    case "idle":
    case "preparing":
    case "priming":
    case "live":
      return null;
    case "buffering":
      return chinese ? { title: "请稍候", detail: "正在缓冲下一段视频" } : { title: "Please stand by", detail: "The next scene is decoding" };
    case "draining":
      return chinese ? { title: "请稍候", detail: "正在完成本段课程" } : { title: "Please stand by", detail: "Finishing the scenes already on tape" };
    case "complete":
      return null;
    default: {
      const exhaustive: never = phase;
      return exhaustive;
    }
  }
}

function TuningScreen({ teacherId }: Readonly<{ teacherId: TeacherId }>) {
  const teacher = TEACHERS[teacherId];
  const [showStatic, setShowStatic] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowStatic(false), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  if (showStatic) return <TelevisionStatic />;
  return (
    <div className="surf-channel tuning-screen">
      <span className="channel-badge">CH 13</span>
      <TeacherPortrait className="teacher-portrait-tuning" expression="standing" teacherId={teacherId} />
      <div className="surf-osd">
        <strong>
          Tuning to {teacher.showName}
          <span className="loading-dots"><i /><i /><i /></span>
        </strong>
        <small>正在准备课堂，请稍候</small>
      </div>
    </div>
  );
}

function SignoffCard({ signoff, teacherId }: Readonly<{ signoff: SignoffState; teacherId: TeacherId }>) {
  if (isYouthTeacher(teacherId)) return (
    <div className="youth-screen-message">
      <strong>本节课程已结束</strong>
      {signoff?.kind === "queued" && <span>即将播放：{signoff.topic}</span>}
      {signoff?.kind === "picks" && <span>可以在课程面板中选择继续学习的内容</span>}
    </div>
  );
  return (
    <div className="signoff-card">
      <span className="signoff-rays" aria-hidden="true" />
      <span className="signoff-scrim" aria-hidden="true" />
      <TeacherPortrait className="teacher-portrait-signoff" expression="laugh" teacherId={teacherId} />
      <strong>Class complete!</strong>
      {signoff?.kind === "queued" && (
        <div className="signoff-next">
          <span className="signoff-label">Up next</span>
          <em>{signoff.topic}</em>
          <small>Starting shortly</small>
        </div>
      )}
      {signoff?.kind === "picks" && (
        <div className="signoff-next">
          <span className="signoff-label">Watch next</span>
          <div className="signoff-picks">
            {signoff.picks.map((pick) => (
              <button
                disabled={signoff.busyTopic !== null}
                key={pick}
                onClick={() => signoff.onPick(pick)}
                type="button"
              >
                {signoff.busyTopic === pick ? "…" : "▶"} {pick}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LessonDeck({ phase, signoff, warning, intent, music, onEvent, onExit, onPlaybackIssue, teacherId, playbackEnabled = true }: LessonDeckProps) {
  const youth = isYouthTeacher(teacherId);
  const videoRefs = useRef<[HTMLVideoElement | null, HTMLVideoElement | null, HTMLVideoElement | null]>([
    null,
    null,
    null,
  ]);
  const assignmentsRef = useRef<[Assignment | null, Assignment | null, Assignment | null]>([
    null,
    null,
    null,
  ]);
  const activeRef = useRef<Active | null>(null);
  const finishedSceneIdsRef = useRef(new Set<SceneId>());
  const intentRef = useRef(intent);
  const tokenRef = useRef(0);
  const skipTimerRef = useRef<number | null>(null);
  const previousEpochRef = useRef(`${intent.runtimeId ?? "legacy"}:${intent.epoch}`);
  const waitingHandoffRef = useRef<WaitingHandoff | null>(null);
  const pendingActivationRef = useRef<PendingActivation | null>(null);
  const pendingGestureRef = useRef<Readonly<{ segment: GeneratedClientSegment; slot: Slot; activation: Activation }> | null>(null);
  const activateSkippedRef = useRef<(
    segment: Extract<ClientPlaybackSegment, { kind: "skipped" }>,
    activation: Activation,
  ) => void>(() => {});
  const [visibleSlot, setVisibleSlot] = useState<Slot | null>(null);
  const [skipped, setSkipped] = useState<Extract<ClientPlaybackSegment, { kind: "skipped" }> | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [gestureRequired, setGestureRequired] = useState(false);
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [reconcileNonce, setReconcileNonce] = useState(0);
  const powered = phase !== "idle";
  const [poweringOn, setPoweringOn] = useState(false);
  const [previouslyPowered, setPreviouslyPowered] = useState(powered);
  const [justTuned, setJustTuned] = useState(false);
  const [firstFramePainted, setFirstFramePainted] = useState(false);
  const landedRef = useRef(false);
  const failedSlotRef = useRef<Slot | null>(null);
  const mediaTimersRef = useRef<(null | (() => void))[]>([null, null, null]);
  const loadAttemptsRef = useRef(new Map<SceneId, number>());
  const loadFailuresRef = useRef<(null | string)[]>([null, null, null]);
  const mediaFailureRef = useRef<(slot: Slot) => void>(() => {});

  if (powered !== previouslyPowered) {
    setPreviouslyPowered(powered);
    if (powered) setPoweringOn(true);
  }

  useEffect(() => {
    if (!poweringOn) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPoweringOn(false), reducedMotion ? 0 : 1050);
    return () => window.clearTimeout(timer);
  }, [poweringOn]);

  useEffect(() => {
    if (!justTuned) return;
    const timer = window.setTimeout(() => setJustTuned(false), 3400);
    return () => window.clearTimeout(timer);
  }, [justTuned]);

  const [stalledLong, setStalledLong] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setStalledLong(buffering), buffering ? 1500 : 0);
    return () => window.clearTimeout(timer);
  }, [buffering]);

  const reportActivation = useCallback((segment: ClientPlaybackSegment, activation: Activation) => {
    if (activation.kind === "started") {
      onEvent({ kind: "started", sceneId: segment.id, atMs: Date.now() });
      return;
    }
    onEvent({
      kind: "advanced",
      finishedSceneId: activation.finishedSceneId,
      startedSceneId: segment.id,
      atMs: Date.now(),
    });
  }, [onEvent]);

  const assignmentSlot = useCallback((sceneId: SceneId): Slot | null => {
    for (const slot of SLOTS) {
      if (assignmentsRef.current[slot]?.segment.id === sceneId) return slot;
    }
    return null;
  }, []);

  const load = useCallback((slot: Slot, segment: GeneratedClientSegment) => {
    const video = videoRefs.current[slot];
    const current = assignmentsRef.current[slot];
    if (!video || current?.segment.id === segment.id || activeRef.current?.slot === slot) return;
    mediaTimersRef.current[slot]?.();
    loadFailuresRef.current[slot] = null;
    loadAttemptsRef.current.set(segment.id, (loadAttemptsRef.current.get(segment.id) ?? 0) + 1);
    tokenRef.current += 1;
    const token = tokenRef.current;
    assignmentsRef.current[slot] = {
      segment,
      ready: false,
      token: tokenRef.current,
      loadStartedAtMs: Date.now(),
    };
    video.pause();
    video.src = segment.videoUrl;
    video.preload = "auto";
    video.load();
    mediaTimersRef.current[slot] = watchMediaLoad({
      current: () => assignmentsRef.current[slot]?.token === token,
      ready: () => assignmentsRef.current[slot]?.ready === true,
      timeout: () => mediaFailureRef.current(slot),
    });
    setReconcileNonce((value) => value + 1);
  }, []);

  const handleMediaFailure = useCallback((slot: Slot) => {
    const assignment = assignmentsRef.current[slot];
    if (!assignment) return;
    mediaTimersRef.current[slot]?.();
    if (activeRef.current?.slot === slot) { activeRef.current = null; setBuffering(true); }
    assignmentsRef.current[slot] = { ...assignment, ready: false };
    const attempts = loadAttemptsRef.current.get(assignment.segment.id) ?? 1;
    if (attempts < 3) {
      const timer = window.setTimeout(() => {
        if (assignmentsRef.current[slot]?.token !== assignment.token) return;
        assignmentsRef.current[slot] = null;
        load(slot, assignment.segment);
      }, attempts * 500);
      mediaTimersRef.current[slot] = () => window.clearTimeout(timer);
      return;
    }
    const message = youth ? "视频连接暂未恢复，可以重新加载原视频；不会重新生成。" : "Video loading has not recovered. Reload the original video.";
    loadFailuresRef.current[slot] = message;
    failedSlotRef.current = slot;
    setMediaError(message);
  }, [load, youth]);
  useEffect(() => { mediaFailureRef.current = handleMediaFailure; }, [handleMediaFailure]);

  const retryFailedMedia = useCallback(() => {
    const slot = failedSlotRef.current;
    const assignment = slot === null ? null : assignmentsRef.current[slot];
    if (slot === null || !assignment) return;
    if (activeRef.current?.slot === slot) activeRef.current = null;
    pendingGestureRef.current = null;
    loadAttemptsRef.current.delete(assignment.segment.id);
    assignmentsRef.current[slot] = null;
    setMediaError(null);
    setGestureRequired(false);
    setBuffering(activeRef.current === null);
    load(slot, assignment.segment);
  }, [load]);

  const preloadRunway = useCallback(() => {
    const current = intentRef.current;
    const desired = [current.playing, ...current.ready]
      .filter((segment): segment is GeneratedClientSegment => segment?.kind === "generated" && !finishedSceneIdsRef.current.has(segment.id))
      .slice(0, youth ? 2 : 3);
    const desiredIds = new Set(desired.map((segment) => segment.id));
    if (youth) {
      for (const slot of SLOTS) {
        const assigned = assignmentsRef.current[slot];
        if (!assigned || slot === activeRef.current?.slot || desiredIds.has(assigned.segment.id)) continue;
        const video = videoRefs.current[slot];
        if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
        mediaTimersRef.current[slot]?.();
        loadFailuresRef.current[slot] = null;
        assignmentsRef.current[slot] = null;
      }
    }
    for (const segment of desired) {
      if (assignmentSlot(segment.id) !== null) continue;
      const activeSlot = activeRef.current?.slot ?? null;
      const slot =
        SLOTS.find((candidate) => candidate !== activeSlot && assignmentsRef.current[candidate] === null) ??
        SLOTS.find((candidate) => {
          const assigned = assignmentsRef.current[candidate];
          return candidate !== activeSlot && assigned !== null && !desiredIds.has(assigned.segment.id);
        });
      if (slot !== undefined) load(slot, segment);
    }
  }, [assignmentSlot, load, youth]);

  const nextAfter = useCallback((activeId: SceneId): ClientPlaybackSegment | null => {
    return intentRef.current.ready.find((segment) => segment.id !== activeId && !finishedSceneIdsRef.current.has(segment.id)) ?? null;
  }, []);

  const activateGenerated = useCallback(async (
    segment: GeneratedClientSegment,
    activation: Activation,
  ) => {
    if (finishedSceneIdsRef.current.has(segment.id)) return;
    let slot = assignmentSlot(segment.id);
    if (slot === null) {
      const activeSlot = activeRef.current?.slot ?? null;
      slot = SLOTS.find((candidate) => candidate !== activeSlot) ?? null;
      if (slot !== null) load(slot, segment);
    }
    const assignment = slot === null ? null : assignmentsRef.current[slot];
    const video = slot === null ? null : videoRefs.current[slot];
    if (!assignment?.ready || assignment.segment.id !== segment.id || !video || slot === null) {
      if (slot !== null && loadFailuresRef.current[slot]) { failedSlotRef.current = slot; setMediaError(loadFailuresRef.current[slot]); }
      pendingActivationRef.current = { segment, activation };
      setBuffering(true);
      return;
    }

    pendingGestureRef.current = { segment, slot, activation };
    pendingActivationRef.current = null;
    waitingHandoffRef.current = null;
    try {
      await waitForMediaPlay(() => video.play());
      if (assignmentsRef.current[slot]?.token !== assignment.token) {
        video.pause();
        return;
      }
      activeRef.current = { segment, slot };
      pendingGestureRef.current = null;
      setVisibleSlot(slot);
      if (!landedRef.current) {
        landedRef.current = true;
        setJustTuned(true);
        const paintable = video as HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number;
        };
        if (typeof paintable.requestVideoFrameCallback === "function") {
          paintable.requestVideoFrameCallback(() => setFirstFramePainted(true));
        } else {
          setFirstFramePainted(true);
        }
      }
      setSkipped(null);
      setBuffering(false);
      setGestureRequired(false);
      setMediaError(null);
      setCaption(segment.captions[0]?.text ?? null);
      reportActivation(segment, activation);
      preloadRunway();
    } catch (error) {
      if (assignmentsRef.current[slot]?.token !== assignment.token) return;
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setGestureRequired(true);
      } else {
        video.pause();
        pendingGestureRef.current = null;
        setGestureRequired(false);
        pendingActivationRef.current = { segment, activation };
        handleMediaFailure(slot);
      }
    }
  }, [assignmentSlot, handleMediaFailure, load, preloadRunway, reportActivation]);

  const resumePlayback = useCallback(() => {
    const pending = pendingGestureRef.current;
    if (pending) void activateGenerated(pending.segment, pending.activation);
  }, [activateGenerated]);
  useEffect(() => {
    onPlaybackIssue?.(mediaError ? { kind: "media", message: mediaError, retry: retryFailedMedia }
      : gestureRequired ? { kind: "gesture", message: "视频已就绪，请点击播放并开启声音。", retry: resumePlayback } : null);
  }, [mediaError, gestureRequired, onPlaybackIssue, retryFailedMedia, resumePlayback]);
  useEffect(() => () => onPlaybackIssue?.(null), [onPlaybackIssue]);

  const activateSkipped = useCallback((
    segment: Extract<ClientPlaybackSegment, { kind: "skipped" }>,
    activation: Activation,
  ) => {
    if (skipTimerRef.current !== null) window.clearTimeout(skipTimerRef.current);
    activeRef.current = { segment, slot: null };
    setVisibleSlot(null);
    setSkipped(segment);
    setBuffering(false);
    setCaption(segment.captions[0]?.text ?? segment.summary);
    reportActivation(segment, activation);
    skipTimerRef.current = window.setTimeout(() => {
      const active = activeRef.current;
      if (!active || active.segment.id !== segment.id) return;
      finishedSceneIdsRef.current.add(segment.id);
      activeRef.current = null;
      const next = nextAfter(segment.id);
      if (!next) {
        setSkipped(null);
        setCaption(null);
        setBuffering(true);
        onEvent({ kind: "drained", finishedSceneId: segment.id, atMs: Date.now() });
        return;
      }
      const nextActivation: Activation = { kind: "advanced", finishedSceneId: segment.id };
      if (next.kind === "skipped") activateSkippedRef.current(next, nextActivation);
      else void activateGenerated(next, nextActivation);
    }, segment.durationSeconds * 1_000);
  }, [activateGenerated, nextAfter, onEvent, reportActivation]);

  useEffect(() => {
    activateSkippedRef.current = activateSkipped;
  }, [activateSkipped]);

  const reconcile = useCallback(() => {
    preloadRunway();
    const current = intentRef.current;
    if (activeRef.current || pendingActivationRef.current || pendingGestureRef.current) return;
    if (!current.running || current.status === "ended") return;
    // A remounted player must resume the server's playing scene, even when the
    // ready queue is empty (particularly the final clip). No generation occurs.
    if (current.playing && !finishedSceneIdsRef.current.has(current.playing.id)) {
      const activation: Activation = { kind: "started" };
      if (current.playing.kind === "skipped") activateSkipped(current.playing, activation);
      else void activateGenerated(current.playing, activation);
      return;
    }
    const ready = current.ready.filter(segment => !finishedSceneIdsRef.current.has(segment.id));
    if (ready.length < current.requiredRunway) {
      setBuffering(ready.length > 0 || current.status === "buffering");
      return;
    }
    if (!landedRef.current) {
      const openers = ready.slice(0, Math.min(2, Math.max(1, current.requiredRunway)));
      const requiredDecodes = openers.filter((segment) => segment.kind === "generated").length;
      const decodedReady = assignmentsRef.current.filter(
        (assignment) => assignment?.ready,
      ).length;
      if (decodedReady < requiredDecodes) {
        setBuffering(ready.length > 0);
        return;
      }
    }
    const first = ready[0];
    if (!first) return;
    const activation: Activation = { kind: "started" };
    if (first.kind === "skipped") activateSkipped(first, activation);
    else void activateGenerated(first, activation);
  }, [activateGenerated, activateSkipped, preloadRunway]);

  useEffect(() => {
    intentRef.current = { ...intent, running: intent.running && playbackEnabled };
    const playbackEpoch = `${intent.runtimeId ?? "legacy"}:${intent.epoch}`;
    if (previousEpochRef.current !== playbackEpoch) {
      previousEpochRef.current = playbackEpoch;
      if (skipTimerRef.current !== null) window.clearTimeout(skipTimerRef.current);
      for (const slot of SLOTS) {
        mediaTimersRef.current[slot]?.();
        loadFailuresRef.current[slot] = null;
        const video = videoRefs.current[slot];
        if (video) {
          video.pause();
          video.removeAttribute("src");
          video.load();
        }
        assignmentsRef.current[slot] = null;
      }
      activeRef.current = null;
      finishedSceneIdsRef.current.clear();
      loadAttemptsRef.current.clear();
      waitingHandoffRef.current = null;
      pendingActivationRef.current = null;
      pendingGestureRef.current = null;
      landedRef.current = false;
      setJustTuned(false);
      setFirstFramePainted(false);
      setVisibleSlot(null);
      setSkipped(null);
      setBuffering(false);
      setGestureRequired(false);
      setCaption(null);
      setMediaError(null);
      failedSlotRef.current = null;
      // Prime the new epoch immediately. Waiting for another snapshot can
      // deadlock a demand-rendered scene whose first media fails to decode.
    }
    reconcile();
  }, [intent, playbackEnabled, reconcile, reconcileNonce]);

  useEffect(() => () => {
    if (skipTimerRef.current !== null) window.clearTimeout(skipTimerRef.current);
    for (const cancel of mediaTimersRef.current) cancel?.();
  }, []);

  const markReady = useCallback((slot: Slot) => {
    const assignment = assignmentsRef.current[slot];
    const video = videoRefs.current[slot];
    if (!assignment || assignment.ready || !video || video.error || !enoughData(video)) return;
    mediaTimersRef.current[slot]?.();
    loadFailuresRef.current[slot] = null;
    assignmentsRef.current[slot] = { ...assignment, ready: true };
    onEvent({
      kind: "media-ready",
      sceneId: assignment.segment.id,
      loadStartedAtMs: assignment.loadStartedAtMs,
      atMs: Date.now(),
    });
    const resolved = mediaReady(waitingHandoffRef.current, assignment.segment.id);
    if (resolved) waitingHandoffRef.current = null;
    const pending = pendingActivationRef.current;
    if (pending?.segment.id === assignment.segment.id) {
      void activateGenerated(pending.segment, pending.activation);
    }
    setReconcileNonce((value) => value + 1);
  }, [activateGenerated, onEvent]);

  const finish = useCallback((slot: Slot) => {
    const active = activeRef.current;
    if (!active || active.slot !== slot) return;
    finishedSceneIdsRef.current.add(active.segment.id);
    activeRef.current = null;
    const next = nextAfter(active.segment.id);
    if (!next) {
      setVisibleSlot(null);
      setCaption(null);
      setBuffering(true);
      onEvent({ kind: "drained", finishedSceneId: active.segment.id, atMs: Date.now() });
      return;
    }
    const activation: Activation = { kind: "advanced", finishedSceneId: active.segment.id };
    if (next.kind === "skipped") {
      activateSkipped(next, activation);
      return;
    }
    const nextSlot = assignmentSlot(next.id);
    const ready = nextSlot !== null && assignmentsRef.current[nextSlot]?.ready === true;
    const handoff = beginHandoff({
      finishedSceneId: active.segment.id,
      nextSceneId: next.id,
      mediaReady: ready,
    });
    if (handoff.kind === "waiting") {
      waitingHandoffRef.current = handoff;
      pendingActivationRef.current = { segment: next, activation };
      setBuffering(true);
    }
    void activateGenerated(next, activation);
  }, [activateGenerated, activateSkipped, assignmentSlot, nextAfter, onEvent]);

  const updateCaption = useCallback((slot: Slot) => {
    const active = activeRef.current;
    const video = videoRefs.current[slot];
    if (!active || active.slot !== slot || !video) return;
    const cue = active.segment.captions.find(
      (candidate) => video.currentTime >= candidate.startSeconds && video.currentTime <= candidate.endSeconds,
    );
    setCaption(cue?.text ?? null);
  }, []);

  const message = warning || mediaError
    ? null
    : phaseMessage(buffering && stalledLong && phase === "live" ? "buffering" : phase, youth);
  const surfing = phase === "preparing" || phase === "priming";

  return (
    <div className={`lesson-stage lesson-stage-${phase} ${powered ? "" : "lesson-stage-off"}`}>
      {SLOTS.map((slot) => (
        <video
          aria-label={youth ? `课程视频 ${slot + 1}` : `Lesson video slot ${slot + 1}`}
          className={`lesson-video ${visibleSlot === slot ? "lesson-video-visible" : ""}`}
          key={slot}
          muted={muted}
          onCanPlay={() => markReady(slot)}
          onEnded={() => finish(slot)}
          onError={() => handleMediaFailure(slot)}
          onLoadedData={() => markReady(slot)}
          onPlaying={() => {
            setBuffering(false);
            if (visibleSlot === slot) setFirstFramePainted(true);
          }}
          onProgress={() => markReady(slot)}
          onStalled={() => setBuffering(true)}
          onTimeUpdate={() => updateCaption(slot)}
          onWaiting={() => setBuffering(true)}
          playsInline
          preload="auto"
          ref={(element) => { videoRefs.current[slot] = element; }}
        />
      ))}

      {powered && !skipped && (visibleSlot === null || !firstFramePainted) && (
        <div
          className={`classroom-placeholder ${visibleSlot !== null ? "classroom-placeholder-hold" : ""}`}
          aria-hidden={phase !== "complete"}
        >
          {phase === "complete" ? (
            <SignoffCard signoff={signoff} teacherId={teacherId} />
          ) : youth ? (
            <div className="youth-screen-message"><strong>{surfing ? "正在准备课程" : "正在缓冲视频"}</strong><span>视频就绪后自动播放</span></div>
          ) : surfing || !firstFramePainted ? (
            <TuningScreen teacherId={teacherId} />
          ) : (
            <TelevisionStatic />
          )}
        </div>
      )}

      {justTuned && !youth && (
        <div className="channel-ident" aria-hidden="true">
          <span>CH 13</span>
          <strong>{TEACHERS[teacherId].showName}</strong>
        </div>
      )}

      {!powered && <div className="tv-off" aria-hidden="true" />}

      {poweringOn && !youth && <div className="tv-power-on" aria-hidden="true" />}

      {skipped && (
        <div className="lesson-card-fallback">
          <span>{youth ? `第 ${skipped.number} 段 · 文字回顾` : `Scene ${skipped.number} · illustrated recap`}</span>
          <strong>{skipped.summary}</strong>
          <small>{youth ? "这段视频生成失败，暂时显示课程文字。" : "The H3 scene failed, so the planned lesson is shown locally."}</small>
        </div>
      )}

      {message && !gestureRequired && !poweringOn && (visibleSlot === null || (buffering && stalledLong)) && (
        <div className={`stage-message stage-message-${phase}`}>
          <span className="thinking-spark">▮</span>
          <div><strong>{message.title}</strong><small>{message.detail}</small></div>
        </div>
      )}

      {(warning || mediaError) && (
        <div className="stage-warning">
          <strong>{youth ? (mediaError ? "播放遇到问题" : "课程提示") : (mediaError ? "Playback issue" : "Setup needed")}</strong>
          <span>{mediaError ?? warning}</span>
          {mediaError && !onPlaybackIssue && <button type="button" onClick={retryFailedMedia}>{youth ? "重新加载视频（不重新生成）" : "Reload video (no regeneration)"}</button>}
          {onExit && !onPlaybackIssue && <button type="button" onClick={onExit}>{youth ? "退出课程" : "Exit lesson"}</button>}
        </div>
      )}

      {gestureRequired && !onPlaybackIssue && (
        <button
          className="resume-button"
          onClick={() => {
            const pending = pendingGestureRef.current;
            if (pending) void activateGenerated(pending.segment, pending.activation);
          }}
          type="button"
        >
          {youth ? "继续播放" : "▶ Continue lesson"}
        </button>
      )}

      {caption && <div className="lesson-caption">{caption}</div>}

      <div className="sound-controls">
        <button
          aria-label={youth ? (muted ? "开启声音" : "静音") : (muted ? "Turn scene sound on" : "Mute scene sound")}
          className="sound-toggle"
          onClick={() => setMuted((current) => !current)}
          type="button"
        >
          {youth ? (muted ? "开启声音" : "静音") : (muted ? "Voice off" : "Voice on")}
        </button>
        {!youth && <button
          aria-label={music.enabled ? "Turn music off" : "Turn music on"}
          className="sound-toggle"
          onClick={music.toggle}
          type="button"
        >
          {music.enabled ? "Music on" : "Music off"}
        </button>}
      </div>
    </div>
  );
}
