"use client";

import { type ReactNode } from "react";
import { Html, RoundedBox } from "@react-three/drei";

const TV = {
  width: 2.09,
  height: 1.9,
  centerY: 3.18 + 0.95,
  screenWidth: 1.81,
  screenHeight: 1.36,
  screenY: 4.21,
} as const;

export function ClassroomTelevision({ children }: Readonly<{ children: ReactNode }>) {
  const stripY = 3.18 + 0.15;
  return (
    <group>
      <RoundedBox args={[TV.width, TV.height, 1]} castShadow position={[0, TV.centerY, 0.5]} radius={0.04} receiveShadow smoothness={3}>
        <meshStandardMaterial color="#dfe3cd" envMapIntensity={0.8} metalness={0.15} roughness={0.55} />
      </RoundedBox>
      <RoundedBox args={[1.95, 1.78, 0.6]} castShadow position={[0, TV.centerY + 0.03, -0.1]} radius={0.06} smoothness={3}>
        <meshStandardMaterial color="#d4dbc4" metalness={0.15} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[1.75, 1.6, 1.1]} castShadow position={[0, TV.centerY + 0.06, -0.55]} radius={0.1} smoothness={3}>
        <meshStandardMaterial color="#c7d0b9" metalness={0.15} roughness={0.62} />
      </RoundedBox>
      {[-0.55, -0.7, -0.85].map((z) => (
        <mesh key={z} position={[0, TV.centerY + TV.height / 2 + 0.001, z]}>
          <boxGeometry args={[1.5, 0.006, 0.03]} />
          <meshStandardMaterial color="#9cac9c" roughness={0.7} />
        </mesh>
      ))}
      <RoundedBox args={[TV.screenWidth, TV.screenHeight, 0.05]} position={[0, TV.screenY, 1.04]} radius={0.07} smoothness={3}>
        <meshPhysicalMaterial
          clearcoat={1}
          clearcoatRoughness={0.12}
          color="#101d1a"
          envMapIntensity={1.6}
          metalness={0.1}
          roughness={0.24}
        />
      </RoundedBox>
      <Html
        center
        distanceFactor={0.86}
        pointerEvents="auto"
        position={[0, TV.screenY, 1.1]}
        transform
        zIndexRange={[8, 2]}
      >
        <div className="tv-screen-html">{children}</div>
      </Html>
      <mesh position={[0, stripY, 1.005]}>
        <boxGeometry args={[1.95, 0.28, 0.02]} />
        <meshStandardMaterial color="#c3ceb8" roughness={0.6} />
      </mesh>
      {[-0.7, 0.7].map((x) =>
        [-0.09, -0.045, 0, 0.045, 0.09].map((dy) => (
          <mesh key={`${x}-${dy}`} position={[x, stripY + dy, 1.02]}>
            <boxGeometry args={[0.42, 0.012, 0.01]} />
            <meshStandardMaterial color="#8da18f" roughness={0.8} />
          </mesh>
        )),
      )}
      <mesh position={[-0.18, stripY + 0.06, 1.02]}>
        <boxGeometry args={[0.26, 0.045, 0.01]} />
        <meshStandardMaterial color="#f3e8c5" metalness={0.6} roughness={0.35} />
      </mesh>
      {[-0.32, -0.24, -0.16, -0.08].map((x) => (
        <mesh key={x} position={[x, stripY - 0.05, 1.02]}>
          <boxGeometry args={[0.05, 0.04, 0.02]} />
          <meshStandardMaterial color="#94a68f" roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0.18, stripY - 0.03, 1.02]}>
        <boxGeometry args={[0.16, 0.08, 0.01]} />
        <meshPhysicalMaterial clearcoat={1} color="#0a0c0d" roughness={0.2} />
      </mesh>
      <mesh position={[0.36, stripY - 0.03, 1.02]}>
        <boxGeometry args={[0.05, 0.03, 0.01]} />
        <meshStandardMaterial color="#c1382c" emissive="#ff3b28" emissiveIntensity={2.2} />
      </mesh>
      {[-0.85, 0.85].map((x) =>
        [0.15, 0.85].map((z) => (
          <mesh key={`foot-${x}-${z}`} position={[x, TV.centerY - TV.height / 2 - 0.015, z]}>
            <boxGeometry args={[0.12, 0.03, 0.12]} />
            <meshStandardMaterial color="#82917c" roughness={0.7} />
          </mesh>
        )),
      )}
    </group>
  );
}
