"use client";

import { memo } from "react";
import { Environment, Lightformer } from "@react-three/drei";

// Environment's frames={1} still rebakes in a layout effect when its children
// change. Keep this static subtree stable so polling, typing, and entrance phase
// updates cannot render cubemaps outside the animation loop or invalidate PMREM.
export const ClassroomEnvironment = memo(function ClassroomEnvironment() {
  return (
    <Environment frames={1} resolution={128} environmentIntensity={0.3}>
      <color args={["#58645e"]} attach="background" />
      <Lightformer
        color="#fff4d7"
        intensity={2.5}
        position={[-4, 8, 1]}
        rotation-x={Math.PI / 2}
        scale={[8, 3, 1]}
      />
      <Lightformer
        color="#e4f4ff"
        intensity={0.6}
        position={[0, 7, 8]}
        scale={[12, 5, 1]}
      />
    </Environment>
  );
});
