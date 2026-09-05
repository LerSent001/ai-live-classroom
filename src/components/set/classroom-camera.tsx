"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type PerspectiveCamera } from "three";
import { classroomPose, dragViewYaw, entrancePose, ENTRANCE_SECONDS, REVEAL_SECONDS, type EntrancePhase } from "./camera-motion";
import { CAMERA_FRAME_PRIORITY, commitCameraView } from "./camera-frame";

export function ClassroomCamera({ active, phase, onPhaseChange }: Readonly<{
  active: boolean;
  phase: EntrancePhase;
  onPhaseChange: (phase: EntrancePhase) => void;
}>) {
  const canvas = useThree((state) => state.gl.domElement);
  const motion = useRef({ warmupFrames: 0, announced: false, seconds: 0, finished: false, reduced: false, targetYaw: 0, yaw: 0 });
  const baseLookAt = useRef(new Vector3());
  const targetPosition = useMemo(() => new Vector3(), []);
  const targetLookAt = useMemo(() => new Vector3(), []);
  const rotatedLookAt = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { motion.current.reduced = preference.matches; };
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    // The existing TV move starts from the neutral heading, even after looking around.
    motion.current.targetYaw = 0;
    if (phase !== "ready") return;
    let pointer: { id: number; x: number } | null = null;
    canvas.classList.add("classroom-look-enabled");
    const finish = () => {
      if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
      pointer = null;
      canvas.classList.remove("classroom-looking");
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
      pointer = { id: event.pointerId, x: event.clientX };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("classroom-looking");
      event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      motion.current.targetYaw = dragViewYaw(motion.current.targetYaw, event.clientX - pointer.x, canvas.clientWidth);
      pointer.x = event.clientX;
    };
    const upOrCancel = (event: PointerEvent) => { if (pointer?.id === event.pointerId) finish(); };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", upOrCancel);
    canvas.addEventListener("pointercancel", upOrCancel);
    canvas.addEventListener("lostpointercapture", upOrCancel);
    window.addEventListener("blur", finish);
    return () => {
      finish();
      canvas.classList.remove("classroom-look-enabled");
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", upOrCancel);
      canvas.removeEventListener("pointercancel", upOrCancel);
      canvas.removeEventListener("lostpointercapture", upOrCancel);
      window.removeEventListener("blur", finish);
    };
  }, [active, canvas, phase]);

  useFrame(({ camera, size, gl }, delta) => {
    const state = motion.current;
    const perspective = camera as PerspectiveCamera;
    const step = Math.min(delta, 0.05);
    if (phase === "loading" || phase === "entering") {
      if (phase === "entering") state.seconds += step;
      const progress = state.reduced ? 1 : (state.seconds - REVEAL_SECONDS) / ENTRANCE_SECONDS;
      const pose = entrancePose(size.width, size.height, progress);
      camera.position.fromArray(pose.position);
      baseLookAt.current.fromArray(pose.lookAt);
      perspective.fov = pose.fov;
      // This component shares the assets' Suspense boundary. Two completed
      // render frames also warm the shaders/postprocessing before uncovering it.
      if (phase === "loading" && ++state.warmupFrames >= 3 && !state.announced) {
        state.announced = true;
        onPhaseChange(state.reduced ? "ready" : "entering");
      }
      if (phase === "entering" && progress >= 1 && !state.finished) {
        state.finished = true;
        onPhaseChange("ready");
      }
    } else if (phase === "ready") {
      const pose = classroomPose(size.width, size.height, active);
      const amount = state.reduced ? 1 : 1 - Math.exp(-step * (active ? 1.8 : 2.8));
      targetPosition.fromArray(pose.position);
      targetLookAt.fromArray(pose.lookAt);
      camera.position.lerp(targetPosition, amount);
      baseLookAt.current.lerp(targetLookAt, amount);
      perspective.fov += (pose.fov - perspective.fov) * amount;
    }
    state.yaw += (state.targetYaw - state.yaw) * (state.reduced ? 1 : 1 - Math.exp(-step * 12));
    rotatedLookAt.copy(baseLookAt.current).sub(camera.position).applyAxisAngle(up, state.yaw).add(camera.position);
    commitCameraView(perspective, rotatedLookAt);
    // DOM diagnostics for checking the actual rendered angle without reading WebGL internals.
    gl.domElement.dataset.viewYaw = (state.yaw * 180 / Math.PI).toFixed(2);
  }, CAMERA_FRAME_PRIORITY);
  return null;
}
