import { Bone, Group, Object3D, Quaternion, Vector3 } from "three";

export const MONOKUMA_DANCE_SECONDS = 2.4;

function requireBone(model: Object3D, name: string): Bone {
  const bone = model.getObjectByName(name);
  if (!(bone instanceof Bone)) {
    throw new Error(`Monokuma model is missing the ${name} bone`);
  }
  return bone;
}

export function createMonokumaDance(model: Object3D) {
  const root = new Group();
  root.add(model);

  // The silver extensions have their own finger bones; retract those without
  // shrinking the round paws or changing the shared source geometry.
  for (const side of ["L", "R"]) {
    for (const finger of ["MIDDLE", "MEDICINAL", "LITTLE"]) {
      requireBone(model, `F_${finger}1_${side}`).scale.multiplyScalar(0.05);
    }
  }
  root.updateMatrixWorld(true);

  function joint(name: string) {
    const bone = requireBone(model, name);
    const inverse = bone.getWorldQuaternion(new Quaternion()).invert();
    return {
      bone,
      rest: bone.quaternion.clone(),
      x: new Vector3(1, 0, 0).applyQuaternion(inverse),
      y: new Vector3(0, 1, 0).applyQuaternion(inverse),
      z: new Vector3(0, 0, 1).applyQuaternion(inverse),
    };
  }

  const joints = {
    head: joint("HEAD"),
    spine: joint("SPINE1"),
    shoulderLeft: joint("SHOULDER_L"),
    shoulderRight: joint("SHOULDER_R"),
    elbowLeft: joint("ELBOW_L"),
    elbowRight: joint("ELBOW_R"),
    thighLeft: joint("THIGH_L"),
    thighRight: joint("THIGH_R"),
    kneeLeft: joint("CLANK_L"),
    kneeRight: joint("CLANK_R"),
    footLeft: joint("TOE1_L"),
    footRight: joint("TOE1_R"),
  };
  const rotation = new Quaternion();

  function pose(
    target: ReturnType<typeof joint>,
    x: number,
    y: number,
    z: number,
  ) {
    // Express offsets in the character's axes; the two exported shoulders
    // have mirrored bone frames. Always start from rest, never accumulate drift.
    target.bone.quaternion
      .copy(target.rest)
      .multiply(rotation.setFromAxisAngle(target.z, z))
      .multiply(rotation.setFromAxisAngle(target.y, y))
      .multiply(rotation.setFromAxisAngle(target.x, x));
  }

  function update(seconds: number, amount: number) {
    const phase = (seconds / MONOKUMA_DANCE_SECONDS) * Math.PI * 2;
    const sway = Math.sin(phase) * amount;
    const beat = Math.sin(phase * 2) * amount;
    const leftStep = Math.max(0, Math.sin(phase)) ** 2 * amount;
    const rightStep = Math.max(0, -Math.sin(phase)) ** 2 * amount;

    root.position.set(0.18 * sway, 0.065 * (1 - Math.cos(phase * 4)) * amount, 0);
    root.rotation.y = 0.13 * sway;
    pose(joints.spine, 0, 0.06 * sway, -0.055 * sway);
    pose(joints.head, 0.055 * beat, -0.07 * sway, 0.14 * sway);

    // Keep the paws below the shoulders throughout the loop, swinging out to
    // the sides instead of presenting the original forward-reaching claws.
    pose(joints.shoulderLeft, 1.18 + 0.14 * beat, 0, 0.3 + 0.24 * sway);
    pose(joints.shoulderRight, 1.18 - 0.14 * beat, 0, -0.3 + 0.24 * sway);
    pose(joints.elbowLeft, -0.16 - 0.16 * leftStep, 0, 0);
    pose(joints.elbowRight, -0.16 - 0.16 * rightStep, 0, 0);
    pose(joints.thighLeft, -0.28 * leftStep, 0, 0.06 * leftStep);
    pose(joints.thighRight, -0.28 * rightStep, 0, -0.06 * rightStep);
    pose(joints.kneeLeft, 0.42 * leftStep, 0, 0);
    pose(joints.kneeRight, 0.42 * rightStep, 0, 0);
    pose(joints.footLeft, -0.14 * leftStep, 0, 0);
    pose(joints.footRight, -0.14 * rightStep, 0, 0);
  }

  update(0, 0);
  return { root, update };
}
