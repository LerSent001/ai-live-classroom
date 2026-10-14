"use client";

import { memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { FileLoader, LinearFilter, NoToneMapping, SRGBColorSpace, TextureLoader, Vector3, WebGLRenderer, type PerspectiveCamera, type Group, Mesh } from "three";
import { ClassroomSceneBoundary } from "@/components/classroom-entrance";
import { YOUTH_RENDERING } from "@/lib/youth-classroom";
import { createYouthRoom } from "./room-model";
import { smoothCameraProgress, youthCameraPose, youthEntrancePose } from "./camera";
import type { EntrancePhase } from "@/components/set/camera-motion";
import { installYouthBake } from "./baked-lighting";
import lighting from "../../../public/youth/lighting.json";
import { installRoomArrival } from "./room-arrival";
import { ArrivalLight } from "./arrival-light";
import { bindRoomHover, installRoomHover } from "./room-hover";
import { bindWallClock } from "./wall-clock";

const modelURLs = ["/youth/models/school-desk.glb", "/youth/models/school-chair.glb", "/youth/models/monstera-plant.glb", "/youth/models/pothos.glb", "/youth/models/books.glb"];

// Fetch independent static assets together, before the first hook can suspend.
// Clones are the only copies uploaded to the GPU by the actual room render.
if (typeof window !== "undefined") {
  useLoader.preload(TextureLoader, ["/youth/surfaces.webp", "/youth/lighting.webp", "/youth/campus-perspective.webp"]);
  useLoader.preload(FileLoader, "/youth/lighting-uv.bin", loader => loader.setResponseType("arraybuffer"));
  useGLTF.preload(modelURLs);
}

type Props = Readonly<{
  screenView: boolean;
  children: ReactNode;
  onEntrancePhase(phase: EntrancePhase): void;
  onSettled(screen: boolean): void;
  onFailure(): void;
}>;

const Room = memo(function Room() {
  const roomRef = useRef<Group>(null);
  const { gl, camera, invalidate } = useThree();
  const hover = useRef<ReturnType<typeof bindRoomHover> | null>(null);
  // Upload only our color-space-configured clones, not an extra GPU copy of
  // each loader-cache texture (useTexture eagerly initializes both originals).
  const [map, lightMap, campus] = useLoader(TextureLoader, ["/youth/surfaces.webp", "/youth/lighting.webp", "/youth/campus-perspective.webp"]);
  const packedUV = useLoader(FileLoader, "/youth/lighting-uv.bin", loader => loader.setResponseType("arraybuffer")) as ArrayBuffer;
  const [desk, chair, monstera, pothos, books] = useGLTF(modelURLs);
  const built = useMemo(() => {
    const ownedMap = map.clone(); ownedMap.colorSpace = SRGBColorSpace; ownedMap.anisotropy = 4; ownedMap.needsUpdate = true;
    const ownedLightMap = lightMap.clone(); ownedLightMap.colorSpace = SRGBColorSpace; ownedLightMap.channel = 1; ownedLightMap.needsUpdate = true;
    // Packed islands only have base-level padding. Automatic mipmaps blend
    // unrelated wall/furniture islands at distance, producing false dark seams.
    ownedLightMap.generateMipmaps = false; ownedLightMap.minFilter = LinearFilter;
    const model = createYouthRoom(ownedMap, desk.scene, chair.scene, ownedLightMap, { monstera: monstera.scene, pothos: pothos.scene, books: books.scene });
    const disposeInk = installYouthBake(model.room, packedUV, lighting);
    const arrival = installRoomArrival(model.room);
    arrival.value = 0;
    model.room.userData.arrivalClock = arrival;
    // Reuse the two existing background triangles. Perspective is in the image.
    const ownedCampus = campus.clone(); ownedCampus.colorSpace = SRGBColorSpace; ownedCampus.needsUpdate = true;
    // The backplate is much taller than the window opening: frame the full
    // distant field/tree/building depth instead of magnifying a patch of track.
    ownedCampus.repeat.set(.85, 3.8); ownedCampus.offset.set(.075, -1.0);
    const backdrop = model.room.getObjectByName('Window sky background') as Mesh;
    const backdropMaterial = backdrop.material as import('three').MeshBasicMaterial;
    backdropMaterial.map = ownedCampus; backdropMaterial.vertexColors = false;
    backdropMaterial.needsUpdate = true;
    backdrop.userData.perspectiveBackdrop = true;
    const hoverUniforms = installRoomHover(model.room);
    return { room: model.room, arrival, hoverUniforms, dispose() { hoverUniforms.dispose(); ownedCampus.dispose(); disposeInk(); model.dispose(); ownedMap.dispose(); ownedLightMap.dispose(); } };
  }, [map, lightMap, campus, packedUV, desk, chair, monstera, pothos, books]);
  useEffect(() => () => built.dispose(), [built]);
  useEffect(() => bindWallClock(built.room, gl.domElement, invalidate), [built, gl, invalidate]);
  useEffect(() => {
    const controller = bindRoomHover(built.room, gl.domElement, camera, invalidate, built.hoverUniforms);
    hover.current = controller;
    return () => { controller.dispose(); hover.current = null; };
  }, [built, gl, camera, invalidate]);
  useFrame(({ gl }, delta) => {
    hover.current?.update(delta);
    const room = roomRef.current;
    if (!room) return;
    const progress = Number(gl.domElement.dataset.entranceProgress ?? 0);
    room.userData.arrivalClock.value = progress >= 1 ? 10 : progress * 1.65;
    const ink = room.getObjectByName('Static anime architectural ink');
    if (ink) ink.visible = progress >= .88;
    gl.domElement.dataset.arrivalTime = String(room.userData.arrivalClock.value);
  }, -50);
  return <primitive ref={roomRef} object={built.room} dispose={null} />;
});

const Lighting = memo(function Lighting() {
  return <>
    <color attach="background" args={["#f1e6cc"]} />
    {/* Only the frame/TV shell retains a cheap local-light highlight.
        All painted surfaces use the baked daylight; no light casts shadows. */}
    <hemisphereLight args={["#dce9ff", "#9b8da9", 1.15]} />
    <ambientLight intensity={.35} color="#fff4e1" />
    <directionalLight position={[-6, 7, 3]} color="#fff1d9" intensity={1.25} />
  </>;
});

function Camera({ screenView, onEntrancePhase, onSettled }: Pick<Props, "screenView" | "onEntrancePhase" | "onSettled">) {
  const { gl, size, invalidate, get } = useThree();
  const look = useRef(new Vector3(-0.25, 2.88, -3.7));
  const targetPosition = useMemo(() => new Vector3(), []);
  const targetLook = useMemo(() => new Vector3(), []);
  const rotatedLook = useMemo(() => new Vector3(), []);
  const state = useRef({
    elapsed: 0, duration: YOUTH_RENDERING.entranceSeconds as number, moving: true,
    warmup: 0, announced: false, ready: false, frames: 0, fromPosition: new Vector3(), fromLook: new Vector3(),
    fromFov: 50, reduced: false, yaw: 0,
  });

  useLayoutEffect(() => {
    const { camera } = get();
    const perspective = camera as PerspectiveCamera;
    const motion = state.current;
    motion.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = youthCameraPose(size.width, size.height, screenView);
    if (!motion.ready) {
      const progress = motion.reduced ? 1 : (motion.elapsed - YOUTH_RENDERING.entranceRevealSeconds) / YOUTH_RENDERING.entranceSeconds;
      const entrance = youthEntrancePose(size.width, size.height, progress, screenView);
      perspective.position.fromArray(entrance.position);
      look.current.fromArray(entrance.lookAt);
      perspective.fov = entrance.fov;
    }
    motion.fromPosition.copy(camera.position); motion.fromLook.copy(look.current); motion.fromFov = perspective.fov;
    if (motion.ready) motion.elapsed = 0;
    motion.moving = true; motion.yaw = 0;
    motion.duration = motion.ready ? YOUTH_RENDERING.cameraSeconds : YOUTH_RENDERING.entranceSeconds;
    targetPosition.fromArray(target.position); targetLook.fromArray(target.lookAt);
    gl.domElement.setAttribute("data-camera", screenView ? "moving-to-screen" : "moving-to-room");
    invalidate();
  }, [get, gl, invalidate, screenView, size.height, size.width, targetLook, targetPosition]);

  useEffect(() => {
    const canvas = gl.domElement;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => { state.current.reduced = preference.matches; if (state.current.moving) invalidate(); };
    preference.addEventListener("change", syncMotion);
    let pointer: { id: number; x: number } | null = null;
    const end = () => { if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id); pointer = null; };
    const down = (event: PointerEvent) => {
      if (screenView || state.current.moving || !event.isPrimary || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX }; canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      state.current.yaw = Math.max(-0.13, Math.min(0.13, state.current.yaw + (event.clientX - pointer.x) / size.width * 0.55));
      pointer.x = event.clientX; invalidate();
    };
    const restored = () => { state.current.warmup = 0; invalidate(); };
    const visible = () => { if (!document.hidden) invalidate(); };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("webglcontextrestored", restored); document.addEventListener("visibilitychange", visible);
    return () => {
      end(); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end); canvas.removeEventListener("pointercancel", end);
      canvas.removeEventListener("webglcontextrestored", restored); document.removeEventListener("visibilitychange", visible);
      preference.removeEventListener("change", syncMotion);
    };
  }, [gl, invalidate, screenView, size.width]);

  useFrame(({ camera, gl, size }, delta) => {
    const perspective = camera as PerspectiveCamera;
    const motion = state.current;
    motion.warmup++;
    if (!motion.ready) {
      // Three shared-Suspense frames guarantee real assets, shaders and cached
      // baked lighting exist before removing the DOM cover. No fabricated percentage.
      if (motion.warmup >= 3 && !motion.announced) {
        motion.announced = true; motion.elapsed = 0;
        if (!motion.reduced) onEntrancePhase("entering");
      }
      if (motion.announced) motion.elapsed += Math.min(delta, .05);
      const progress = motion.reduced ? 1 : Math.max(0, Math.min(1,
        (motion.elapsed - YOUTH_RENDERING.entranceRevealSeconds) / YOUTH_RENDERING.entranceSeconds));
      const pose = youthEntrancePose(size.width, size.height, progress, screenView);
      perspective.position.fromArray(pose.position); look.current.fromArray(pose.lookAt); perspective.fov = pose.fov;
      gl.domElement.dataset.entranceProgress = String(progress);
      if (motion.announced && progress >= 1) {
        motion.ready = true; motion.moving = false;
        onEntrancePhase("ready");
        gl.domElement.dataset.camera = screenView ? "screen" : "room";
        onSettled(screenView);
      } else invalidate();
    } else if (motion.moving) {
      motion.elapsed += Math.min(delta, 0.05);
      const progress = motion.reduced ? 1 : Math.min(1, motion.elapsed / motion.duration);
      const t = smoothCameraProgress(progress);
      perspective.position.lerpVectors(motion.fromPosition, targetPosition, t);
      look.current.lerpVectors(motion.fromLook, targetLook, t);
      const pose = youthCameraPose(size.width, size.height, screenView);
      perspective.fov = motion.fromFov + (pose.fov - motion.fromFov) * t;
      if (progress >= 1) {
        motion.moving = false;
        gl.domElement.dataset.camera = screenView ? "screen" : "room";
        onSettled(screenView);
      } else invalidate();
    }
    rotatedLook.copy(look.current).sub(perspective.position).applyAxisAngle(perspective.up, motion.yaw).add(perspective.position);
    perspective.lookAt(rotatedLook); perspective.updateProjectionMatrix(); perspective.updateMatrixWorld();
    // Read-only evidence for no-spend QA, no polling/invalidation of its own.
    gl.domElement.dataset.renderFrames = String(++motion.frames);
    gl.domElement.dataset.cameraPosition = perspective.position.toArray().join(',');
    gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
    gl.domElement.dataset.triangles = String(gl.info.render.triangles);
    gl.domElement.dataset.shadows = "offline-baked";
    if (motion.warmup < 4) invalidate();
  }, -100);
  return null;
}

export default function YouthScene(props: Props) {
  const onCreated = useCallback(({ gl }: { gl: WebGLRenderer }) => {
    gl.toneMapping = NoToneMapping; gl.info.autoReset = false;
  }, []);
  const screen = YOUTH_RENDERING.screen;
  return <div className="youth-scene">
    <ClassroomSceneBoundary onFailure={props.onFailure}>
      <Canvas frameloop="demand" dpr={[1, YOUTH_RENDERING.maxDpr]} camera={{ position: [0.7, 3.28, 8.4], fov: 50, near: 0.1, far: 45 }}
        onCreated={onCreated}
        gl={{ alpha: false, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" }}>
        <Suspense fallback={null}>
          <Lighting /><Room /><ArrivalLight /><FrameDiagnostics />
          <Camera screenView={props.screenView} onEntrancePhase={props.onEntrancePhase} onSettled={props.onSettled} />
          <Html transform center position={[screen.center[0], screen.center[1], screen.center[2] - 0.068]}
            distanceFactor={1} zIndexRange={[8, 2]}>
            <div className="youth-screen" style={{ width: screen.width * 400, height: screen.height * 400 }}>{props.children}</div>
          </Html>
        </Suspense>
      </Canvas>
    </ClassroomSceneBoundary>
  </div>;
}

function FrameDiagnostics() {
  useFrame(({ gl }) => { gl.info.reset(); }, -200);
  useFrame(({ gl, scene, camera }) => {
    // One direct render, then read the completed counters. A positive priority
    // intentionally owns rendering now that the postprocessing composer is gone.
    gl.render(scene, camera);
    gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
    gl.domElement.dataset.triangles = String(gl.info.render.triangles);
    let meshes = 0, assetTriangles = 0;
    scene.traverse((object) => { if (object instanceof Mesh) { meshes++; assetTriangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3; } });
    gl.domElement.dataset.meshes = String(meshes);
    gl.domElement.dataset.assetTriangles = String(assetTriangles);
    gl.domElement.dataset.materialStyle = "paper-print-baked";
    gl.domElement.dataset.shadowMaps = String(gl.shadowMap.enabled);
    gl.domElement.dataset.gpuTextures = String(gl.info.memory.textures);
    const exterior = scene.getObjectByName('Window sky background');
    gl.domElement.dataset.exterior = exterior?.userData.perspectiveBackdrop ? 'perspective-illustration' : 'none';
    gl.domElement.dataset.exteriorTriangles = exterior ? '2' : '0';
  }, 1);
  return null;
}
