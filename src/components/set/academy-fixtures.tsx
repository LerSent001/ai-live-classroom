"use client";

import { RoundedBox } from "@react-three/drei";
import { type ClassroomTextures } from "./textures";
import { type Position } from "./shared";

const DARK_METAL = { color: "#30352e", metalness: 0.45, roughness: 0.7 } as const;
const AGED_METAL = { color: "#a8aa91", metalness: 0.48, roughness: 0.58 } as const;

function Bolt({ position }: Readonly<{ position: Position }>) {
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.07, 16]} />
        <meshStandardMaterial {...DARK_METAL} />
      </mesh>
      <mesh position={[0, 0, 0.09]} rotation={[Math.PI / 2, 0, Math.PI / 6]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.16, 6]} />
        <meshStandardMaterial {...AGED_METAL} />
      </mesh>
      <mesh position={[0, 0, 0.176]}>
        <boxGeometry args={[0.075, 0.015, 0.006]} />
        <meshStandardMaterial color="#44473d" />
      </mesh>
    </group>
  );
}

function SealedPanel({
  width,
  z,
  textures,
}: Readonly<{ width: number; z: number; textures: ClassroomTextures }>) {
  return (
    <group position={[-10.48, 4.48, z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + 0.16, 4.65, 0.14]} />
        <meshStandardMaterial {...DARK_METAL} />
      </mesh>
      <RoundedBox
        args={[width, 4.48, 0.12]}
        position={[0, 0, 0.11]}
        radius={0.025}
        smoothness={2}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial {...textures.steel} metalness={0.4} roughness={0.73} bumpScale={0.008} />
      </RoundedBox>
      {[-1, 1].map((side) =>
        [-1.94, 1.94].map((y) => (
          <Bolt key={`${side}:${y}`} position={[side * (width / 2 - 0.17), y, 0.2]} />
        )),
      )}
    </group>
  );
}

function SecurityCamera({
  position,
  yaw,
  textures,
}: Readonly<{ position: Position; yaw: number; textures: ClassroomTextures }>) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, -0.2]} castShadow>
        <boxGeometry args={[0.62, 0.8, 0.14]} />
        <meshStandardMaterial {...DARK_METAL} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.48, -0.11]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.065, 0.065, 0.08, 6]} />
          <meshStandardMaterial {...AGED_METAL} />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 0.12]} castShadow>
        <boxGeometry args={[0.15, 0.16, 0.65]} />
        <meshStandardMaterial {...AGED_METAL} />
      </mesh>
      <mesh position={[0, 0.3, 0.38]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.42, 12]} />
        <meshStandardMaterial {...DARK_METAL} />
      </mesh>
      <group position={[0, 0.65, 0.46]} rotation={[0.2, yaw, 0]}>
        <RoundedBox args={[1.02, 0.62, 1.3]} radius={0.055} smoothness={2} castShadow receiveShadow>
          <meshStandardMaterial {...textures.steel} color="#d9d0af" roughness={0.72} metalness={0.18} bumpScale={0.004} />
        </RoundedBox>
        <mesh position={[0, 0, 0.66]}>
          <boxGeometry args={[0.86, 0.47, 0.06]} />
          <meshStandardMaterial color="#272b25" />
        </mesh>
        <mesh position={[0.11, 0, 0.76]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.19, 0.22, 0.2, 24]} />
          <meshStandardMaterial {...DARK_METAL} />
        </mesh>
        <mesh position={[0.11, 0, 0.867]}>
          <circleGeometry args={[0.145, 24]} />
          <meshStandardMaterial color="#153632" metalness={0.65} roughness={0.18} />
        </mesh>
        <mesh position={[0.07, 0.05, 0.874]}>
          <circleGeometry args={[0.035, 12]} />
          <meshBasicMaterial color="#859d8b" />
        </mesh>
        <mesh position={[-0.3, -0.12, 0.703]}>
          <circleGeometry args={[0.032, 12]} />
          <meshStandardMaterial color="#ec5477" emissive="#e32758" emissiveIntensity={1.8} />
        </mesh>
        <mesh position={[0, 0.37, 0.13]} castShadow>
          <boxGeometry args={[1.17, 0.065, 1.65]} />
          <meshStandardMaterial {...AGED_METAL} />
        </mesh>
        {[-0.48, 0.48].map((x) => (
          <mesh key={x} position={[x, 0, -0.28]}>
            <boxGeometry args={[0.07, 0.69, 0.1]} />
            <meshStandardMaterial {...DARK_METAL} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function BroadcastSpeaker({ position, textures }: Readonly<{ position: Position; textures: ClassroomTextures }>) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[1.74, 1.18, 0.26]} />
        <meshStandardMaterial {...DARK_METAL} />
      </mesh>
      <RoundedBox args={[1.58, 1.02, 0.29]} position={[0, 0, 0.1]} radius={0.055} smoothness={2} castShadow>
        <meshStandardMaterial {...textures.steel} color="#c8c3a0" roughness={0.8} bumpScale={0.003} />
      </RoundedBox>
      <mesh position={[0, 0.04, 0.253]}>
        <boxGeometry args={[1.28, 0.66, 0.018]} />
        <meshStandardMaterial color="#20251f" />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[0, -0.23 + i * 0.077, 0.278]}>
          <boxGeometry args={[1.3, 0.035, 0.035]} />
          <meshStandardMaterial {...AGED_METAL} />
        </mesh>
      ))}
      <mesh position={[0.57, -0.4, 0.263]}>
        <circleGeometry args={[0.023, 10]} />
        <meshStandardMaterial color="#dce4a4" emissive="#acba72" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

export function AcademyFixtures({ textures }: Readonly<{ textures: ClassroomTextures }>) {
  return (
    <group>
      <SealedPanel width={2.5} z={-3.6} textures={textures} />
      <SealedPanel width={2.5} z={-0.92} textures={textures} />
      <SealedPanel width={3.5} z={2.15} textures={textures} />
      <SealedPanel width={2.8} z={5.58} textures={textures} />
      <SecurityCamera position={[-8.28, 5.82, -5.05]} yaw={0.3} textures={textures} />
      <BroadcastSpeaker position={[3.4, 7.6, -5.02]} textures={textures} />
      {/* Exposed conduit and regular dark joints give the closed room a reinforced outline. */}
      <mesh position={[0, 7.05, -5.23]} castShadow>
        <boxGeometry args={[21.3, 0.055, 0.07]} />
        <meshStandardMaterial {...DARK_METAL} />
      </mesh>
      <mesh position={[-8.28, 6.54, -5.19]} castShadow>
        <boxGeometry args={[0.055, 1.04, 0.07]} />
        <meshStandardMaterial {...DARK_METAL} />
      </mesh>
      {[-10.42, -6.94, 6.08, 10.42].map((x) => (
        <mesh key={x} position={[x, 5.05, -5.29]}>
          <boxGeometry args={[0.038, 6.8, 0.035]} />
          <meshStandardMaterial color="#514e32" roughness={0.94} />
        </mesh>
      ))}
      <mesh position={[0, 8.25, -5.22]} castShadow>
        <boxGeometry args={[21.4, 0.21, 0.22]} />
        <meshStandardMaterial {...DARK_METAL} />
      </mesh>
      <mesh position={[-10.48, 8.25, 2]} castShadow>
        <boxGeometry args={[0.22, 0.21, 14.8]} />
        <meshStandardMaterial {...DARK_METAL} />
      </mesh>
    </group>
  );
}
