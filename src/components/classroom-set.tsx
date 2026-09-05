"use client";

import { Suspense, useCallback, useMemo, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { MeshReflectorMaterial } from "@react-three/drei";
import {
  Bloom,
  EffectComposer,
  N8AO,
  ToneMapping,
} from "@react-three/postprocessing";
import {
  ACESFilmicToneMapping,
  Object3D,
  PCFShadowMap,
  WebGLRenderer,
} from "three";
import { ToneMappingMode } from "postprocessing";
import { useClassroomTextures } from "./set/textures";
import { AvCart, DeskWithChair } from "./set/furniture";
import { AcademyFixtures } from "./set/academy-fixtures";
import { Monokuma } from "./set/monokuma";
import { ClassroomTelevision } from "./set/television";
import {
  Bookshelf,
  Chalkboard,
  SetDressing,
  WallClock,
  PhotoWall,
} from "./set/dressing";
import { type Position } from "./set/shared";
import { ClassroomCamera } from "./set/classroom-camera";
import { ClassroomEnvironment } from "./set/classroom-environment";
import { stageOffset, type EntrancePhase } from "./set/camera-motion";
import { ClassroomSceneBoundary } from "./classroom-entrance";

type ClassroomSetProps = Readonly<{
  active: boolean;
  children: ReactNode;
  phase: EntrancePhase;
  onPhaseChange: (phase: EntrancePhase) => void;
}>;

function CeilingLight({ position }: Readonly<{ position: Position }>) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[3.5, 0.12, 0.55]} />
        <meshStandardMaterial color="#55594b" metalness={0.3} roughness={0.68} />
      </mesh>
      {[-0.14, 0.14].map((z) => (
        <mesh key={z} position={[0, -0.09, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 3.1, 12]} />
          <meshStandardMaterial
            color="#fffdf0"
            emissive="#fff8d9"
            emissiveIntensity={1.7}
          />
        </mesh>
      ))}
      <pointLight
        position={[0, -0.35, 0]}
        color={position[0] < 0 ? "#ffe0b1" : "#c2d2d0"}
        intensity={position[0] < 0 ? 43 : 9}
        distance={17}
        decay={2}
      />
    </group>
  );
}

function Classroom({ active, children, phase, onPhaseChange }: ClassroomSetProps) {
  const { size } = useThree();
  const narrow = size.width < 700;
  const textures = useClassroomTextures();
  const keyLightTarget = useMemo(() => {
    const target = new Object3D();
    target.position.set(-4.7, 2, -2.6);
    return target;
  }, []);
  return (
    <>
      <ClassroomCamera active={active} phase={phase} onPhaseChange={onPhaseChange} />
      <color attach="background" args={["#343d38"]} />
      <fog attach="fog" args={["#404d4a", 48, 100]} />
      <hemisphereLight args={["#c4cabb", "#5a4935", 0.62]} />
      <ambientLight color="#c6d5ce" intensity={0.08} />
      <primitive object={keyLightTarget} />
      <spotLight
        castShadow
        color="#ffe5bb"
        intensity={285}
        position={[-7, 7.8, 6]}
        target={keyLightTarget}
        angle={1}
        penumbra={0.38}
        decay={2}
        distance={38}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={38}
        shadow-normalBias={0.025}
        shadow-bias={-0.0001}
      />
      <directionalLight
        color="#b1c6d0"
        intensity={0.16}
        position={[8, 6, 12]}
      />
      <ClassroomEnvironment />

      <mesh position={[0, 3.7, -5.5]} receiveShadow>
        <boxGeometry args={[22, 10, 0.34]} />
        <meshStandardMaterial
          {...textures.wallBack}
          color="#fff5d9"
          roughness={1}
          bumpScale={0.032}
        />
      </mesh>
      <mesh position={[0, 0.28, -5.3]} receiveShadow>
        <boxGeometry args={[22, 2.55, 0.1]} />
        <meshStandardMaterial
          {...textures.paintBack}
          color="#edddbf"
          roughness={0.73}
          bumpScale={0.01}
        />
      </mesh>
      <mesh position={[10.8, 3.7, 2]} receiveShadow>
        <boxGeometry args={[0.34, 10, 15]} />
        <meshStandardMaterial
          {...textures.wallSide}
          color="#d9d6ba"
          roughness={1}
          bumpScale={0.032}
        />
      </mesh>
      <mesh position={[10.59, 0.28, 2]} receiveShadow>
        <boxGeometry args={[0.1, 2.55, 15]} />
        <meshStandardMaterial
          {...textures.paintSide}
          color="#d4c9ad"
          roughness={0.73}
          bumpScale={0.01}
        />
      </mesh>
      <mesh position={[0, 8.55, 10]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[22, 32]} />
        <meshStandardMaterial
          {...textures.ceiling}
          color="#bdb9a2"
          roughness={1}
          bumpScale={0.012}
        />
      </mesh>
      {[-4, 1, 6].map((z) => (
        <mesh key={z} position={[0, 8.4, z]}>
          <boxGeometry args={[21.6, 0.14, 0.1]} />
          <meshStandardMaterial color="#44483b" roughness={0.8} />
        </mesh>
      ))}
      <mesh
        position={[0, -1, 10]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[22, 32]} />
        <MeshReflectorMaterial
          map={textures.floorMap}
          roughness={0.86}
          metalness={0}
          resolution={narrow ? 128 : 512}
          blur={[300, 160]}
          mirror={0}
          mixBlur={1}
          mixStrength={0.17}
          depthScale={0.3}
        />
      </mesh>
      <mesh position={[-10.8, 3.7, 2]} receiveShadow>
        <boxGeometry args={[0.34, 10, 15]} />
        <meshStandardMaterial
          {...textures.wallSide}
          color="#fff5d9"
          roughness={1}
          bumpScale={0.032}
        />
      </mesh>
      <mesh position={[-10.59, 0.28, 2]} receiveShadow>
        <boxGeometry args={[0.1, 2.55, 15]} />
        <meshStandardMaterial
          {...textures.paintSide}
          color="#edddbf"
          roughness={0.73}
          bumpScale={0.01}
        />
      </mesh>
      <mesh position={[-10.51, 1.58, 2]}>
        <boxGeometry args={[0.09, 0.075, 15]} />
        <meshStandardMaterial color="#554731" roughness={0.86} />
      </mesh>
      <mesh position={[-10.51, -0.8, 2]}>
        <boxGeometry args={[0.09, 0.36, 15]} />
        <meshStandardMaterial color="#3e3b2e" roughness={0.86} />
      </mesh>
      <PhotoWall />
      <mesh position={[0, -0.8, -5.17]}>
        <boxGeometry args={[22, 0.36, 0.09]} />
        <meshStandardMaterial color="#3e3b2e" roughness={0.86} />
      </mesh>
      <mesh position={[0, 1.58, -5.17]}>
        <boxGeometry args={[22, 0.075, 0.09]} />
        <meshStandardMaterial color="#554731" roughness={0.86} />
      </mesh>
      <mesh position={[10.51, 1.58, 2]}>
        <boxGeometry args={[0.09, 0.075, 15]} />
        <meshStandardMaterial color="#554731" roughness={0.86} />
      </mesh>

      <Chalkboard textures={textures} />
      <AcademyFixtures textures={textures} />
      <WallClock position={[6.9, 6.8, -5.1]} textures={textures} />
      <SetDressing textures={textures} />
      <Monokuma dancing={!active} />
      <Bookshelf textures={textures} />
      {[-3.8, 4].map((x) =>
        [-1, 5].map((z) => (
          <CeilingLight key={`${x}:${z}`} position={[x, 8.22, z]} />
        )),
      )}

      <group position={[stageOffset(size.width), 0, -2.25]}>
        <AvCart>
          <ClassroomTelevision>{children}</ClassroomTelevision>
        </AvCart>
      </group>
      {[-7.2, -3.55, 0.1, 3.75, 7.4].map((x, col) =>
        [1.25, 4.65, 8.05].map((z, row) => (
          <DeskWithChair
            key={`${col}:${row}`}
            position={[x, -1, z]}
            rotationY={row === 2 && col === 0 ? 0.035 : 0}
            textures={textures}
            notebook={(col + row * 2) % 4 === 0}
          />
        )),
      )}
      <EffectComposer>
        <N8AO
          aoRadius={0.65}
          distanceFalloff={1}
          halfRes
          intensity={1.7}
          quality="medium"
          color="#303126"
        />
        <Bloom intensity={0.18} luminanceThreshold={1.25} mipmapBlur />
        {/* EffectComposer disables renderer tone mapping; compress the classroom lighting highlights here. */}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}

export function ClassroomSet({ active, children, phase, onPhaseChange }: ClassroomSetProps) {
  const onFailure = useCallback(() => onPhaseChange("failed"), [onPhaseChange]);
  return (
    <div className="classroom-set">
      <ClassroomSceneBoundary onFailure={onFailure}>
        <Canvas
          camera={{ fov: 46, near: 0.1, far: 90, position: [3.1, 4.9, 15.8] }}
          dpr={[1, 1.5]}
          fallback={<p>此设备无法显示 3D 教室。</p>}
          gl={(props) => {
            // Canvas fallback is always mounted inside the DOM canvas. Detect a
            // real context failure at renderer creation, not in fallback effects.
            try {
              // The classroom is opaque and the composer owns antialiasing.
              // Do not composite a second transparent, multisampled canvas.
              const renderer = new WebGLRenderer({
                ...props,
                canvas: props.canvas as HTMLCanvasElement,
                alpha: false,
                antialias: false,
                // CSS-transformed TV/UI layers can be composited between WebGL
                // frames. Keep the completed frame until the composer replaces
                // it instead of exposing an automatically discarded buffer.
                preserveDrawingBuffer: true,
              });
              renderer.toneMapping = ACESFilmicToneMapping;
              renderer.toneMappingExposure = 1;
              return renderer;
            } catch (error) {
              onFailure();
              throw error;
            }
          }}
          shadows={{ type: PCFShadowMap }}
        >
          <Suspense fallback={null}>
            <Classroom active={active} phase={phase} onPhaseChange={onPhaseChange}>{children}</Classroom>
          </Suspense>
        </Canvas>
      </ClassroomSceneBoundary>
    </div>
  );
}
