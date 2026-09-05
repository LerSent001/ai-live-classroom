"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createMonokumaDance, MONOKUMA_DANCE_SECONDS } from "./monokuma-motion";

const MODEL_URL = "/models/monokuma/monokuma.glb";
const CHARACTER_HEIGHT = 4;

export function Monokuma({ dancing }: Readonly<{ dancing: boolean }>) {
  const { scene } = useGLTF(MODEL_URL, false, false);
  const motion = useRef({ seconds: 0, amount: 0, reduced: false });
  const character = useMemo(() => {
    // Clone the rig as well as the meshes so the cached GLB stays untouched.
    const model = clone(scene);
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const adaptMaterial = (source: MeshStandardMaterial) => {
        const material = source.clone();
        // The source Blender export marks every surface as metal. Use a matte
        // character finish so its white half responds to the room's warm light.
        material.metalness = 0;
        material.roughness = 0.62;
        return material;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map((material) =>
            adaptMaterial(material as MeshStandardMaterial),
          )
        : adaptMaterial(object.material as MeshStandardMaterial);
    });
    const dance = createMonokumaDance(model);
    dance.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model);
    const center = bounds.getCenter(new Vector3());
    const scale = CHARACTER_HEIGHT / (bounds.max.y - bounds.min.y);
    model.scale.multiplyScalar(scale);
    model.position.set(
      -center.x * scale,
      -bounds.min.y * scale,
      -center.z * scale,
    );
    return dance;
  }, [scene]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      motion.current.reduced = preference.matches;
    };
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);

  useFrame((_, delta) => {
    const state = motion.current;
    const enabled = dancing && !state.reduced;
    state.amount = state.reduced
      ? 0
      : state.amount +
        ((enabled ? 1 : 0) - state.amount) * (1 - Math.exp(-delta * 5));
    if (enabled || state.amount > 0.001) {
      // Avoid advancing through a large jump when a background tab resumes.
      state.seconds =
        (state.seconds + Math.min(delta, 0.05)) % MONOKUMA_DANCE_SECONDS;
    }
    character.update(state.seconds, state.amount);
  });

  return (
    <group position={[-5.3, -1, -3.25]} rotation={[0, 0.38, 0]}>
      <primitive object={character.root} />
    </group>
  );
}
