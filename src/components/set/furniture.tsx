"use client";

import { type ReactNode } from "react";
import { RoundedBox } from "@react-three/drei";
import { type ClassroomTextures } from "./textures";
import { type Position } from "./shared";

const FRAME = { color: "#42483d", metalness: 0.25, roughness: 0.76 } as const;

export function DeskWithChair({
  position,
  rotationY = 0,
  textures,
  notebook = false,
}: Readonly<{
  position: Position;
  rotationY?: number;
  textures: ClassroomTextures;
  notebook?: boolean;
}>) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox
        args={[2.17, 0.11, 1.5]}
        position={[0, 1.7, 0]}
        radius={0.06}
        smoothness={2}
        castShadow
      >
        <meshStandardMaterial color="#493925" roughness={0.85} />
      </RoundedBox>
      <RoundedBox
        args={[2.12, 0.13, 1.45]}
        position={[0, 1.76, 0]}
        radius={0.075}
        smoothness={3}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={textures.wood} roughness={0.68} />
      </RoundedBox>
      <mesh position={[0, 1.53, -0.06]} castShadow>
        <boxGeometry args={[1.83, 0.07, 1.13]} />
        <meshStandardMaterial {...FRAME} />
      </mesh>
      {[-0.88, 0.88].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.61, -0.06]}>
            <boxGeometry args={[0.045, 0.2, 1.13]} />
            <meshStandardMaterial {...FRAME} />
          </mesh>
          {[-0.53, 0.53].map((z) => (
            <group key={z} position={[x, 0, z]}>
              <mesh position={[0, 0.87, 0]} castShadow>
                <cylinderGeometry args={[0.052, 0.058, 1.74, 8]} />
                <meshStandardMaterial {...FRAME} />
              </mesh>
              <mesh position={[0, 0.045, 0]}>
                <cylinderGeometry args={[0.055, 0.055, 0.09, 8]} />
                <meshStandardMaterial color="#647b76" roughness={0.8} />
              </mesh>
            </group>
          ))}
          <mesh position={[x, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 1.12, 8]} />
            <meshStandardMaterial {...FRAME} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0, 1.35]}>
        <RoundedBox
          args={[1.08, 0.1, 1]}
          position={[0, 1.02, 0]}
          radius={0.085}
          smoothness={3}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            map={textures.wood}
            color="#e0c6a0"
            roughness={0.72}
          />
        </RoundedBox>
        <RoundedBox
          args={[1.12, 0.53, 0.085]}
          position={[0, 1.76, 0.43]}
          rotation={[-0.1, 0, 0]}
          radius={0.08}
          smoothness={3}
          castShadow
        >
          <meshStandardMaterial
            map={textures.wood}
            color="#e0c6a0"
            roughness={0.72}
          />
        </RoundedBox>
        {[-0.44, 0.44].map((x) => (
          <group key={x}>
            {[-0.38, 0.38].map((z) => (
              <mesh key={z} position={[x, z > 0 ? 1 : 0.5, z]} castShadow>
                <cylinderGeometry args={[0.044, 0.05, z > 0 ? 2 : 1, 8]} />
                <meshStandardMaterial {...FRAME} />
              </mesh>
            ))}
            <mesh position={[x, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.022, 0.022, 0.8, 8]} />
              <meshStandardMaterial {...FRAME} />
            </mesh>
          </group>
        ))}
      </group>
      {notebook && (
        <group position={[-0.2, 1.84, 0.05]} rotation={[0, 0.12, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.7, 0.045, 0.88]} />
            <meshStandardMaterial color="#92bcb3" />
          </mesh>
          <mesh position={[0.015, 0.027, 0]}>
            <boxGeometry args={[0.63, 0.014, 0.81]} />
            <meshStandardMaterial color="#fff9e8" />
          </mesh>
          <mesh position={[0.47, 0.02, 0.05]} rotation={[Math.PI / 2, 0, 0.16]}>
            <cylinderGeometry args={[0.014, 0.014, 0.6, 6]} />
            <meshStandardMaterial color="#dfb36c" />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function AvCart({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <group>
      {[-1.22, 1.22].map((x) =>
        [-0.89, 0.89].map((z) => (
          <group key={`${x}:${z}`}>
            <mesh position={[x, 1.26, z]} castShadow>
              <boxGeometry args={[0.065, 3.82, 0.065]} />
              <meshStandardMaterial
                color="#7b9c95"
                metalness={0.15}
                roughness={0.65}
              />
            </mesh>
            <mesh position={[x, -0.83, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.16, 0.16, 0.09, 14]} />
              <meshStandardMaterial color="#687c79" />
            </mesh>
          </group>
        )),
      )}
      {[3.15, 2.13, -0.4].map((y) => (
        <RoundedBox
          key={y}
          args={[2.57, 0.12, 1.9]}
          position={[0, y, 0]}
          radius={0.04}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#aec4b7" roughness={0.7} />
        </RoundedBox>
      ))}
      <RoundedBox
        args={[1.34, 0.2, 0.85]}
        position={[-0.35, 2.31, 0.1]}
        radius={0.025}
        castShadow
      >
        <meshStandardMaterial color="#e4e5d4" roughness={0.7} />
      </RoundedBox>
      <mesh position={[-0.4, 2.31, 0.532]}>
        <boxGeometry args={[0.65, 0.045, 0.012]} />
        <meshStandardMaterial color="#718c86" />
      </mesh>
      {[
        { color: "#d99b90", y: 2.23 },
        { color: "#e5c47f", y: 2.34 },
      ].map(({ color, y }) => (
        <mesh
          key={color}
          position={[0.7, y, 0.1]}
          rotation={[0, 0.08, 0]}
          castShadow
        >
          <boxGeometry args={[0.56, 0.09, 0.65]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      {children}
    </group>
  );
}
