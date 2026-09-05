"use client";

import { TEACHERS } from "@/lib/classroom-config";
import { TeacherPortrait } from "@/components/teacher-portrait";
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

type LessonDeckProps = Readonly<{
  teacherId: TeacherId;
  phase: "idle" | "preparing" | "priming" | "live" | "buffering" | "draining" | "complete";
  signoff: SignoffState;
  warning: string | null;
  intent: LessonPlaybackIntent;
  onEvent(report: PlaybackReport): void;
  music: Readonly<{ enabled: boolean; toggle(): void }>;
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
): Readonly<{ title: string; detail: string }> | null {
  switch (phase) {
    case "idle":
    case "preparing":
    case "priming":
    case "live":
      return null;
    case "buffering":
      return { title: "Please stand by", detail: "The next scene is decoding" };
    case "draining":
      return { title: "Please stand by", detail: "Finishing the scenes already on tape" };
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

export function LessonDeck({ phase, signoff, warning, intent, music, onEvent, teacherId }: LessonDeckProps) {
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
  const intentRef = useRef(intent);
  const tokenRef = useRef(0);
  const skipTimerRef = useRef<number | null>(null);
  const previousEpochRef = useRef(intent.epoch);
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
    tokenRef.current += 1;
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
    setReconcileNonce((value) => value + 1);
  }, []);

  const preloadRunway = useCallback(() => {
    const current = intentRef.current;
    const desired = [current.playing, ...current.ready]
      .filter((segment): segment is GeneratedClientSegment => segment?.kind === "generated")
      .slice(0, 3);
    const desiredIds = new Set(desired.map((segment) => segment.id));
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
  }, [assignmentSlot, load]);

  const nextAfter = useCallback((activeId: SceneId): ClientPlaybackSegment | null => {
    return intentRef.current.ready.find((segment) => segment.id !== activeId) ?? null;
  }, []);

  const activateGenerated = useCallback(async (
    segment: GeneratedClientSegment,
    activation: Activation,
  ) => {
    let slot = assignmentSlot(segment.id);
    if (slot === null) {
      const activeSlot = activeRef.current?.slot ?? null;
      slot = SLOTS.find((candidate) => candidate !== activeSlot) ?? null;
      if (slot !== null) load(slot, segment);
    }
    const assignment = slot === null ? null : assignmentsRef.current[slot];
    const video = slot === null ? null : videoRefs.current[slot];
    if (!assignment?.ready || assignment.segment.id !== segment.id || !video || slot === null) {
      pendingActivationRef.current = { segment, activation };
      setBuffering(true);
      return;
    }

    pendingGestureRef.current = { segment, slot, activation };
    pendingActivationRef.current = null;
    waitingHandoffRef.current = null;
    try {
      await video.play();
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
    } catch {
      setGestureRequired(true);
    }
  }, [assignmentSlot, load, preloadRunway, reportActivation]);

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
    if (activeRef.current || pendingActivationRef.current) return;
    if (!current.running || current.status === "ended") return;
    if (current.ready.length < current.requiredRunway) {
      setBuffering(current.ready.length > 0 || current.status === "buffering");
      return;
    }
    if (!landedRef.current) {
      const openers = current.ready.slice(0, Math.min(2, Math.max(1, current.requiredRunway)));
      const requiredDecodes = openers.filter((segment) => segment.kind === "generated").length;
      const decodedReady = assignmentsRef.current.filter(
        (assignment) => assignment?.ready,
      ).length;
      if (decodedReady < requiredDecodes) {
        setBuffering(current.ready.length > 0);
        return;
      }
    }
    const first = current.ready[0];
    if (!first) return;
    const activation: Activation = { kind: "started" };
    if (first.kind === "skipped") activateSkipped(first, activation);
    else void activateGenerated(first, activation);
  }, [activateGenerated, activateSkipped, preloadRunway]);

  useEffect(() => {
    intentRef.current = intent;
    if (previousEpochRef.current !== intent.epoch) {
      previousEpochRef.current = intent.epoch;
      if (skipTimerRef.current !== null) window.clearTimeout(skipTimerRef.current);
      for (const slot of SLOTS) {
        const video = videoRefs.current[slot];
        if (video) {
          video.pause();
          video.removeAttribute("src");
          video.load();
        }
        assignmentsRef.current[slot] = null;
      }
      activeRef.current = null;
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
      return;
    }
    reconcile();
  }, [intent, reconcile, reconcileNonce]);

  useEffect(() => () => {
    if (skipTimerRef.current !== null) window.clearTimeout(skipTimerRef.current);
  }, []);

  const markReady = useCallback((slot: Slot) => {
    const assignment = assignmentsRef.current[slot];
    const video = videoRefs.current[slot];
    if (!assignment || assignment.ready || !video || !enoughData(video)) return;
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
    : phaseMessage(buffering && stalledLong && phase === "live" ? "buffering" : phase);
  const surfing = phase === "preparing" || phase === "priming";

  return (
    <div className={`lesson-stage lesson-stage-${phase} ${powered ? "" : "lesson-stage-off"}`}>
      {SLOTS.map((slot) => (
        <video
          aria-label={`Lesson video slot ${slot + 1}`}
          className={`lesson-video ${visibleSlot === slot ? "lesson-video-visible" : ""}`}
          key={slot}
          muted={muted}
          onCanPlay={() => markReady(slot)}
          onEnded={() => finish(slot)}
          onError={() => {
            setMediaError(`Scene ${assignmentsRef.current[slot]?.segment.number ?? "video"} could not be decoded.`);
            setBuffering(true);
          }}
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
          ) : surfing || !firstFramePainted ? (
            <TuningScreen teacherId={teacherId} />
          ) : (
            <TelevisionStatic />
          )}
        </div>
      )}

      {justTuned && (
        <div className="channel-ident" aria-hidden="true">
          <span>CH 13</span>
          <strong>{TEACHERS[teacherId].showName}</strong>
        </div>
      )}

      {!powered && <div className="tv-off" aria-hidden="true" />}

      {poweringOn && <div className="tv-power-on" aria-hidden="true" />}

      {skipped && (
        <div className="lesson-card-fallback">
          <span>Scene {skipped.number} · illustrated recap</span>
          <strong>{skipped.summary}</strong>
          <small>The H3 scene failed, so the planned lesson is shown locally.</small>
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
          <strong>{mediaError ? "Playback issue" : "Setup needed"}</strong>
          <span>{mediaError ?? warning}</span>
        </div>
      )}

      {gestureRequired && (
        <button
          className="resume-button"
          onClick={() => {
            const pending = pendingGestureRef.current;
            if (pending) void activateGenerated(pending.segment, pending.activation);
          }}
          type="button"
        >
          ▶ Continue lesson
        </button>
      )}

      {caption && <div className="lesson-caption">{caption}</div>}

      <div className="sound-controls">
        <button
          aria-label={muted ? "Turn scene sound on" : "Mute scene sound"}
          className="sound-toggle"
          onClick={() => setMuted((current) => !current)}
          type="button"
        >
          {muted ? "Voice off" : "Voice on"}
        </button>
        <button
          aria-label={music.enabled ? "Turn music off" : "Turn music on"}
          className="sound-toggle"
          onClick={music.toggle}
          type="button"
        >
          {music.enabled ? "Music on" : "Music off"}
        </button>
      </div>
    </div>
  );
}
