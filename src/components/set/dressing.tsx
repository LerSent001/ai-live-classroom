"use client";

import { RoundedBox, useTexture } from "@react-three/drei";
import { SRGBColorSpace } from "three";
import { type ClassroomTextures } from "./textures";
import { type Position } from "./shared";

export function Chalkboard({
  textures,
}: Readonly<{ textures: ClassroomTextures }>) {
  return (
    <group position={[-0.55, 4.45, -5.22]}>
      <mesh position={[0, 0, -0.055]} castShadow receiveShadow>
        <boxGeometry args={[12.13, 4.93, 0.14]} />
        <meshStandardMaterial color="#292e23" roughness={0.87} />
      </mesh>
      <RoundedBox args={[11.95, 4.75, 0.18]} radius={0.035} receiveShadow>
        <meshStandardMaterial color="#8a744e" roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 0, 0.105]}>
        <planeGeometry args={[11.65, 4.48]} />
        <meshStandardMaterial map={textures.chalkboard} roughness={0.95} />
      </mesh>
      <mesh position={[0, -2.43, 0.2]} castShadow>
        <boxGeometry args={[12.05, 0.09, 0.42]} />
        <meshStandardMaterial color="#7d7456" roughness={0.75} />
      </mesh>
      {[
        { x: -3.8, color: "#fff7dd" },
        { x: -3.15, color: "#f3c1ba" },
        { x: -2.5, color: "#f4dea0" },
      ].map(({ x, color }) => (
        <mesh
          key={x}
          position={[x, -2.35, 0.24]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.028, 0.028, 0.4, 10]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      <RoundedBox
        args={[0.65, 0.12, 0.25]}
        position={[4.15, -2.32, 0.22]}
        radius={0.025}
      >
        <meshStandardMaterial color="#e8c88a" />
      </RoundedBox>
    </group>
  );
}

export function WallClock({
  position,
  textures,
}: Readonly<{ position: Position; textures: ClassroomTextures }>) {
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.6, 0.14, 48]} />
        <meshStandardMaterial color="#8a8e7b" metalness={0.3} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.078]}>
        <circleGeometry args={[0.535, 48]} />
        <meshStandardMaterial map={textures.clockFace} />
      </mesh>
      <mesh position={[0.12, 0.03, 0.1]} rotation={[0, 0, -1.32]}>
        <boxGeometry args={[0.035, 0.28, 0.015]} />
        <meshStandardMaterial color="#55736e" />
      </mesh>
      <mesh position={[0, 0.18, 0.11]}>
        <boxGeometry args={[0.024, 0.37, 0.015]} />
        <meshStandardMaterial color="#55736e" />
      </mesh>
      <mesh position={[0, 0, 0.125]}>
        <circleGeometry args={[0.043, 16]} />
        <meshStandardMaterial color="#d6a19a" />
      </mesh>
    </group>
  );
}

function WallPhoto({
  src,
  width,
  position,
  tilt,
}: Readonly<{
  src: string;
  width: number;
  position: Position;
  tilt: number;
}>) {
  const texture = useTexture(src, (loaded) => {
    loaded.colorSpace = SRGBColorSpace;
    loaded.anisotropy = 8;
    loaded.needsUpdate = true;
  });
  // The JPEG itself supplies the print ratio; no UV crop or image transformation.
  const image = texture.image as HTMLImageElement;
  const height = (width * image.height) / image.width;
  const border = 0.12;
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      <group rotation={[0, 0, tilt]}>
        <RoundedBox
          args={[width + border * 2, height + 0.42, 0.025]}
          radius={0.015}
          smoothness={2}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#fffdf4" roughness={0.72} />
        </RoundedBox>
        <mesh position={[0, 0.07, 0.018]}>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial map={texture} roughness={0.45} metalness={0} />
        </mesh>
        <mesh
          position={[-width * 0.18, height / 2 + 0.19, 0.037]}
          rotation={[0, 0, -0.12]}
        >
          <planeGeometry args={[0.64, 0.23]} />
          <meshStandardMaterial
            color="#e2d3a9"
            roughness={1}
            transparent
            opacity={0.78}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}

export function PhotoWall() {
  return (
    <group>
      <WallPhoto
        src="/photos/classroom-01.jpg"
        width={2.02}
        position={[-10.23, 4.6, -3.6]}
        tilt={-0.04}
      />
      <WallPhoto
        src="/photos/classroom-02.jpg"
        width={2.02}
        position={[-10.23, 4.5, -0.92]}
        tilt={0.045}
      />
      <WallPhoto
        src="/photos/classroom-03.jpg"
        width={3.05}
        position={[-10.23, 4.48, 2.15]}
        tilt={-0.035}
      />
    </group>
  );
}

export function Bookshelf({
  textures,
}: Readonly<{ textures: ClassroomTextures }>) {
  return (
    <group position={[9.75, -1, 1.2]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 1.23, -0.4]} receiveShadow>
        <boxGeometry args={[6, 2.45, 0.08]} />
        <meshStandardMaterial color="#b6c9b2" />
      </mesh>
      {[0.08, 1.25, 2.48].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[6.1, 0.12, 1]} />
          <meshStandardMaterial map={textures.wood} />
        </mesh>
      ))}
      {[-3, -1.5, 0, 1.5, 3].map((x) => (
        <mesh key={x} position={[x, 1.25, 0]} castShadow>
          <boxGeometry args={[0.09, 2.4, 1]} />
          <meshStandardMaterial map={textures.wood} />
        </mesh>
      ))}
      {Array.from({ length: 16 }, (_, i) => (
        <mesh
          key={i}
          position={[-2.7 + (i % 8) * 0.72, i < 8 ? 0.46 : 1.65, 0.06]}
          rotation={[0, 0, i % 3 === 0 ? 0.08 : 0]}
          castShadow
        >
          <boxGeometry args={[0.2, 0.66 + (i % 3) * 0.09, 0.55]} />
          <meshStandardMaterial
            color={["#accbc4", "#e3b5a6", "#e2cf90", "#a5bfd0"][i % 4]}
          />
        </mesh>
      ))}
      <Plant position={[-2.15, 2.56, 0]} />
      <mesh position={[1.7, 2.68, 0]} castShadow>
        <boxGeometry args={[1, 0.2, 0.68]} />
        <meshStandardMaterial color="#f0d4b0" />
      </mesh>
    </group>
  );
}

function Plant({ position }: Readonly<{ position: Position }>) {
  return (
    <group position={position}>
      <mesh position={[0, 0.23, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.21, 0.45, 20]} />
        <meshStandardMaterial color="#d5a48a" />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.02, 0.025, 0.65, 8]} />
        <meshStandardMaterial color="#68956f" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <group
          key={i}
          rotation={[0, i * 2.4, 0]}
          position={[0, 0.55 + i * 0.1, 0]}
        >
          <mesh
            position={[0.16, 0.06, 0]}
            rotation={[0, 0, -0.7]}
            scale={[1, 0.38, 0.52]}
            castShadow
          >
            <sphereGeometry args={[0.29, 12, 8]} />
            <meshStandardMaterial color={i % 2 ? "#8bbb84" : "#72a882"} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function SetDressing({
  textures,
}: Readonly<{ textures: ClassroomTextures }>) {
  return (
    <group>
      <group position={[7.65, 4.25, -5.2]}>
        <mesh receiveShadow>
          <boxGeometry args={[3.2, 2.55, 0.12]} />
          <meshStandardMaterial color="#c9ae80" />
        </mesh>
        <mesh position={[0, 0, 0.065]}>
          <planeGeometry args={[3, 2.35]} />
          <meshStandardMaterial map={textures.notice} />
        </mesh>
      </group>
      <group position={[10.57, 2.15, 6.6]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[3.2, 6.3, 0.15]} />
          <meshStandardMaterial color="#3c4033" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.09]}>
          <boxGeometry args={[2.9, 6.06, 0.06]} />
          <meshStandardMaterial {...textures.steel} color="#c3baa0" roughness={0.8} bumpScale={0.008} />
        </mesh>
        <mesh position={[0, 1.36, 0.13]}>
          <planeGeometry args={[2.46, 2.45]} />
          <meshStandardMaterial {...textures.steel} color="#798979" metalness={0.4} roughness={0.76} bumpScale={0.008} />
        </mesh>
        <mesh position={[0, 1.36, 0.16]}>
          <boxGeometry args={[0.065, 2.5, 0.045]} />
          <meshStandardMaterial color="#3c4033" />
        </mesh>
        <mesh position={[-1.1, -0.28, 0.18]}>
          <boxGeometry args={[0.055, 0.45, 0.08]} />
          <meshStandardMaterial color="#87a29a" />
        </mesh>
      </group>
    </group>
  );
}
