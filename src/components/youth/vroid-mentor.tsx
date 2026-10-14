"use client";

import { useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { BackSide, DataTexture, Mesh, MeshToonMaterial, NearestFilter, RedFormat, PerspectiveCamera, type MeshStandardMaterial } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createMentorGestures } from './mentor-gestures';
import { createMotionPlayer, createPortraitHumanoid, isLocalMotionHost, loadPortraitMotions, MOTION_CREDIT } from './mentor-authored-motion';
import { MentorInteraction } from './mentor-interaction';
import { installMentorArrival, MENTOR_ARRIVAL_SECONDS } from './mentor-arrival';

let hasGreetedThisVisit = false;

// Only brief gestures invalidate the canvas; rests have no render loop.
export function VroidMentor({ angle = Math.PI, animate = false }: { angle?: number; animate?: boolean }) {
  const gltf = useGLTF("/youth/models/hair-female.vrm");
  const { invalidate, gl } = useThree();
  const scene = useMemo(() => {
    const model = clone(gltf.scene);
    const ramp = new DataTexture(new Uint8Array([145, 255]), 2, 1, RedFormat);
    ramp.minFilter = ramp.magFilter = NearestFilter;
    ramp.generateMipmaps = false; ramp.needsUpdate = true;
    model.userData.celRamp = ramp;
    model.userData.arrivalProgress = {value: animate ? 0 : 1};
    model.userData.arrivalDpr = {value: gl.getPixelRatio()};
    const outlines: { mesh: Mesh; source: Mesh }[] = [];
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const convert = (source: MeshStandardMaterial) => {
        const material = new MeshToonMaterial({
        map: source.map, color: source.color, side: source.side,
        transparent: source.transparent, opacity: source.opacity,
        alphaTest: source.alphaTest, depthWrite: source.depthWrite,
        gradientMap: ramp, toneMapped: false,
      });
        material.forceSinglePass = true;
        if (/CLOTH/i.test(source.name)) {
          // Keep seams, bow and folds from the original garment texture.
          // Compress its painted shading instead of discarding the detail map.
          material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
              #include <map_fragment>
              diffuseColor.rgb = mix(diffuseColor.rgb, sqrt(max(diffuseColor.rgb, vec3(0.0))), 0.35);
            `);
          };
          material.customProgramCacheKey = () => 'cel-cloth-detail-v1';
        }
        if (/HAIR/i.test(source.name)) {
          material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
              #include <map_fragment>
              float inkShade = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
              diffuseColor.rgb = inkShade < 0.012 ? vec3(0.018, 0.012, 0.026) :
                inkShade < 0.055 ? vec3(0.038, 0.025, 0.061) : vec3(0.085, 0.060, 0.12);
            `);
          };
          material.customProgramCacheKey = () => 'cel-hair-v3';
        }
        installMentorArrival(material, model.userData.arrivalProgress, model.userData.arrivalDpr);
        return material;
      };
      const original = Array.isArray(object.material) ? object.material : [object.material];
      if (original.every(material => !/Eye|Brow|Mouth/i.test(material.name))) {
        const outline = object.clone(false);
        outline.morphTargetInfluences = object.morphTargetInfluences;
        outline.userData.mentorOutline = true;
        const inks = original.map(source => {
          const ink = new MeshToonMaterial({ side: BackSide, color: '#30283c', map: source.map, alphaTest: .5, toneMapped: false });
          ink.onBeforeCompile = shader => {
            shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * 0.003;\n#include <project_vertex>');
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = vec3(0.025, 0.018, 0.035);\n#include <opaque_fragment>');
          };
          installMentorArrival(ink, model.userData.arrivalProgress, model.userData.arrivalDpr);
          return ink;
        });
        outline.material = Array.isArray(object.material) ? inks : inks[0];
        outline.renderOrder = -1;
        outlines.push({mesh: outline, source: object});
      }
      object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
      object.frustumCulled = false;
    });
    for (const {mesh, source} of outlines) source.parent?.add(mesh);
    model.userData.portraitHumanoid = createPortraitHumanoid(model, gltf);
    createMentorGestures(model)('thinking', 0);
    return model;
  }, [animate, gl, gltf]);
  useEffect(() => {
    if (!animate) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: number | undefined;
    let elapsed = 0, previous = performance.now();
    const tick = () => {
      if (document.hidden) return;
      const now = performance.now();
      elapsed += Math.min(now - previous, 100); previous = now;
      if (reduced.matches) elapsed = MENTOR_ARRIVAL_SECONDS * 1000;
      const progress = reduced.matches ? 1 : Math.min(1, elapsed / (MENTOR_ARRIVAL_SECONDS * 1000));
      scene.userData.arrivalProgress.value = progress;
      scene.userData.arrivalDpr.value = gl.getPixelRatio();
      gl.domElement.dataset.mentorArrival = progress.toFixed(4);
      invalidate();
      if (progress < 1) timer = window.setTimeout(tick, 1000 / 24);
    };
    const resume = () => {
      window.clearTimeout(timer); previous = performance.now();
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', resume);
    reduced.addEventListener('change', resume);
    resume();
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      reduced.removeEventListener('change', resume);
    };
  }, [animate, gl, invalidate, scene]);
  useEffect(() => {
    if (!animate || !isLocalMotionHost(window.location.hostname)) return;
    const humanoid = scene.userData.portraitHumanoid as ReturnType<typeof createPortraitHumanoid>;
    scene.add(humanoid.normalizedHumanBonesRoot);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cancelled = false;
    let timer: number | undefined;
    let player: ReturnType<typeof createMotionPlayer> | undefined;
    let previous = 0;
    let playing = false;
    const schedule = (delay: number) => { timer = window.setTimeout(start, delay); };
    const tick = () => {
      if (!player || cancelled || document.hidden || reduced.matches) return;
      const now = performance.now();
      const motion = player.update(Math.min((now - previous) / 1000, .1));
      previous = now;
      gl.domElement.dataset.handMotion = motion ?? 'authored-rest';
      invalidate();
      if (motion) timer = window.setTimeout(tick, 1000 / 24);
      else { playing = false; schedule(10500 + Math.random() * 2500); }
    };
    function start() {
      if (!player || cancelled || document.hidden || reduced.matches) return;
      if (scene.userData.arrivalProgress.value < 1) { schedule(100); return; }
      const motion = hasGreetedThisVisit ? 'model-pose' : 'greeting';
      hasGreetedThisVisit = true;
      player.play(motion); playing = true; previous = performance.now();
      if (motion === 'greeting') window.dispatchEvent(new Event('mentor-greeting'));
      tick();
    }
    const resume = () => {
      window.clearTimeout(timer);
      if (!player) return;
      if (reduced.matches) { player.stop(); playing = false; gl.domElement.dataset.handMotion = 'authored-rest'; invalidate(); }
      if (!document.hidden && !reduced.matches) {
        if (playing) { previous = performance.now(); tick(); }
        else schedule(hasGreetedThisVisit ? 11000 : 650);
      }
    };
    Object.assign(gl.domElement.dataset, {handMotion: 'loading-authored-clips'});
    loadPortraitMotions(humanoid).then(clips => {
      if (cancelled) return;
      player = createMotionPlayer(scene, humanoid, clips);
      scene.userData.authoredMotionReady = true;
      gl.domElement.dataset.handMotion = 'authored-rest';
      gl.domElement.dataset.motionSource = 'VRoid-MotionPack-02-06';
      invalidate(); resume();
    }).catch(() => {
      if (!cancelled) gl.domElement.dataset.handMotion = 'local-clips-unavailable';
    });
    document.addEventListener('visibilitychange', resume);
    reduced.addEventListener('change', resume);
    return () => {
      cancelled = true; window.clearTimeout(timer); player?.dispose();
      scene.userData.authoredMotionReady = false;
      document.removeEventListener('visibilitychange', resume);
      reduced.removeEventListener('change', resume);
    };
  }, [animate, gl, invalidate, scene]);
  useEffect(() => {
    if (!animate) return;
    const head = scene.getObjectByName('J_Bip_C_Head');
    const baseTilt = head?.rotation.z ?? 0;
    const faceNames = new Set<string>();
    gltf.scene.traverse(object => {
      if (object instanceof Mesh && gltf.parser.associations.get(object)?.meshes === 0) faceNames.add(object.name);
    });
    const faces: Mesh[] = [];
    scene.traverse(object => { if (object instanceof Mesh && faceNames.has(object.name) && object.morphTargetInfluences) faces.push(object); });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: number | undefined;
    let nextBlink = 0, nextGesture = 0, direction = 1;
    const apply = (blink: number, smile: number, tilt: number) => {
      for (const face of faces) {
        face.morphTargetInfluences![12] = blink;
        face.morphTargetInfluences![1] = smile;
      }
      if (head && !scene.userData.authoredMotionReady) head.rotation.z = baseTilt + tilt;
      // Keep the relaxed stance while licensed authored clips are being selected.
      // Do not replay the rejected hand-built arm gestures.
      Object.assign(gl.domElement.dataset, {blink: blink.toFixed(3), smile: smile.toFixed(3), headTilt: tilt.toFixed(3), animatedFaceMeshes: String(faces.length)});
      invalidate();
    };
    const tick = () => {
      if (document.hidden || reduced.matches) return;
      const now = performance.now();
      const blinkTime = now - nextBlink;
      const gestureTime = now - nextGesture;
      const blinking = blinkTime >= 0 && blinkTime <= 260;
      const gesturing = gestureTime >= 0 && gestureTime <= 3000;
      const blink = blinking ? Math.sin(Math.PI * blinkTime / 260) : 0;
      const ease = gesturing ? Math.pow(Math.sin(Math.PI * gestureTime / 3000), 2) : 0;
      apply(blink, ease * .4, ease * .065 * direction);
      if (blinkTime > 260) nextBlink = now + 3500 + Math.random() * 2500;
      if (gestureTime > 3000) { nextGesture = now + 6000 + Math.random() * 2500; direction *= -1; }
      const delay = blinking || gesturing ? 1000 / 24 : Math.max(1, Math.min(nextBlink, nextGesture) - now);
      timer = window.setTimeout(tick, delay);
    };
    const resume = () => {
      window.clearTimeout(timer);
      apply(0, 0, 0);
      if (document.hidden || reduced.matches) return;
      const now = performance.now();
      nextBlink = now + 2000; nextGesture = now + 4500;
      timer = window.setTimeout(tick, 2000);
    };
    document.addEventListener('visibilitychange', resume);
    reduced.addEventListener('change', resume);
    resume();
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      reduced.removeEventListener('change', resume);
      apply(0, 0, 0);
    };
  }, [animate, gl, gltf, invalidate, scene]);
  useEffect(() => () => { scene.userData.celRamp.dispose(); scene.traverse(object => {
    if (object instanceof Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  }); }, [scene]);
  return <group rotation={[0, angle, 0]}>
    <primitive object={scene} dispose={null} />
    {animate && <MentorInteraction model={scene} />}
  </group>;
}

function PortraitDiagnostics() {
  useFrame(({gl, scene, camera}) => {
    gl.render(scene, camera);
    gl.domElement.dataset.portraitFrames = String(Number(gl.domElement.dataset.portraitFrames || 0) + 1);
    gl.domElement.dataset.portraitTriangles = String(gl.info.render.triangles);
    gl.domElement.dataset.portraitDrawCalls = String(gl.info.render.calls);
  }, 1);
  return null;
}

function ExtendedPortraitCamera() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    // Extend the original framing downward, without enlarging or moving the head.
    camera.setViewOffset(size.width, Math.max(1, size.height - 240), 0, 0, size.width, size.height);
    invalidate();
  }, [camera, size, invalidate]);
  return null;
}

export function VroidReference() {
  return <div style={{ display: "flex", height: "100vh", background: "#e7e5e0" }}>
    {[Math.PI, Math.PI / 2, 0].map(angle => <Canvas key={angle} frameloop="demand" dpr={1} camera={{position: [0, .85, 4], fov: 27}} onCreated={({camera}) => camera.lookAt(0, .85, 0)}>
      <ambientLight intensity={1.2} /><directionalLight position={[-2, 4, 3]} intensity={1.5} />
      <Suspense fallback={null}><VroidMentor angle={angle} /></Suspense>
    </Canvas>)}
  </div>;
}

export default function VroidPortrait() {
  return <div className="youth-vroid-portrait" aria-label="女生三维形象" title={MOTION_CREDIT}>
    <button className="youth-pet-accessible" onClick={e=>e.currentTarget.parentElement?.querySelector('canvas')?.dispatchEvent(new Event('mentor-pet'))}>摸摸头</button>
    <div className="youth-vroid-extended">
    <Canvas frameloop="demand" dpr={[1, 1.25]} camera={{ position: [0, 1.35, 2.4], fov: 25 }}
      onCreated={({ camera }) => camera.lookAt(0, 1.35, 0)}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power", preserveDrawingBuffer: true }}>
      <ambientLight intensity={1.05} />
      <directionalLight position={[-3, 2, 3]} intensity={1.65} />
      <directionalLight position={[3, 1.5, 2]} color="#e9efff" intensity={.4} />
      <Suspense fallback={null}><VroidMentor animate /></Suspense>
      <PortraitDiagnostics />
      <ExtendedPortraitCamera />
    </Canvas>
    </div>
  </div>;
}
