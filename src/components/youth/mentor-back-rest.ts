import { AnimationClip, AnimationMixer, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import type { VRMHumanoid } from '@pixiv/three-vrm';

/** A model-fitted static pose requested by the user, not a replacement motion library. */
export function createBackRest(humanoid: VRMHumanoid, source: AnimationClip) {
  const root = humanoid.normalizedHumanBonesRoot;
  const mixer = new AnimationMixer(root);
  mixer.clipAction(source).play(); mixer.update(0);
  root.updateWorldMatrix(true, true);
  const head = root.worldToLocal(humanoid.getNormalizedBoneNode('head')!.getWorldPosition(new Vector3()));
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? -1 : 1;
    const upper = humanoid.getNormalizedBoneNode(`${side}UpperArm`)!;
    const lower = humanoid.getNormalizedBoneNode(`${side}LowerArm`)!;
    const hand = humanoid.getNormalizedBoneNode(`${side}Hand`)!;
    const start = upper.getWorldPosition(new Vector3());
    const target = root.localToWorld(new Vector3(sign * .075, head.y - .43, .22));
    const direction = target.clone().sub(start);
    const a = lower.position.length(), b = hand.position.length();
    const distance = Math.min(a + b - .005, direction.length());
    direction.normalize(); target.copy(start).addScaledVector(direction, distance);
    const pole = root.localToWorld(new Vector3(sign * .36, head.y - .32, .12)).sub(start);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    const along = (a*a-b*b+distance*distance)/(2*distance);
    const elbow = start.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)));
    upper.quaternion.setFromUnitVectors(lower.position.clone().normalize(),elbow.clone().sub(start).applyQuaternion(upper.parent!.getWorldQuaternion(new Quaternion()).invert()).normalize());
    upper.updateWorldMatrix(true,true);
    lower.quaternion.setFromUnitVectors(hand.position.clone().normalize(),target.clone().sub(elbow).applyQuaternion(upper.getWorldQuaternion(new Quaternion()).invert()).normalize());
    // Soft, incomplete finger curl; no fan-like lateral spread or clenched fist.
    for (const finger of ['Index','Middle','Ring','Little'] as const) {
      for (const [joint, bend] of [['Proximal',.12],['Intermediate',.18],['Distal',.08]] as const) {
        const bone = humanoid.getNormalizedBoneNode(`${side}${finger}${joint}`);
        bone?.quaternion.setFromAxisAngle(new Vector3(0,0,1),-sign*bend);
      }
    }
  }
  root.updateWorldMatrix(true,true);
  const tracks = source.tracks.map(track => {
    if (!(track instanceof QuaternionKeyframeTrack)) return track.clone();
    const name=track.name.slice(0,-'.quaternion'.length);
    const bone=root.getObjectByName(name);
    if (!bone) return track.clone();
    const value=bone.quaternion.toArray();
    return new QuaternionKeyframeTrack(track.name,[0,1],[...value,...value]);
  });
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  return new AnimationClip('hands-behind-back',1,tracks);
}
