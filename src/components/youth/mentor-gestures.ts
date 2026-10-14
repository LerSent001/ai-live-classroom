import { Quaternion, Vector3, type Object3D } from 'three';

export type MentorGesture = 'thinking' | 'explaining' | 'attentive';
export function createMentorGestures(model: Object3D) {
  const head = model.getObjectByName('J_Bip_C_Head');
  const arms = ['L', 'R'].map(side => ({
    side, upper: model.getObjectByName(`J_Bip_${side}_UpperArm`),
    lower: model.getObjectByName(`J_Bip_${side}_LowerArm`), hand: model.getObjectByName(`J_Bip_${side}_Hand`),
  }));
  const fingers = ['L', 'R'].flatMap(side => ['Index', 'Middle', 'Ring', 'Little'].flatMap(finger => [1, 2, 3].map(joint => ({
    bone: model.getObjectByName(`J_Bip_${side}_${finger}${joint}`), sign: side === 'L' ? 1 : -1, joint,
  }))));
  const apply = (gesture: MentorGesture, weight: number) => {
    if (!head) return;
    model.updateWorldMatrix(true, true);
    const headLocal = model.worldToLocal(head.getWorldPosition(new Vector3()));
    for (const {side, upper, lower, hand} of arms) {
      if (!upper || !lower || !hand || !upper.parent) continue;
      const sign = side === 'L' ? -1 : 1;
      const neutral = new Vector3(sign * .22, headLocal.y - .57 + (side === 'L' ? .015 : 0), headLocal.z - .10);
      const target = neutral.clone();
      if (gesture === 'thinking' && side === 'R') target.set(.09, headLocal.y - .105, headLocal.z - .16);
      if (gesture === 'explaining' && side === 'L') target.set(-.32, headLocal.y - .30, headLocal.z - .22);
      if (gesture === 'attentive') target.set(sign * .15, headLocal.y - .48, headLocal.z - .18);
      target.lerpVectors(neutral, target.clone(), weight);
      model.localToWorld(target);
      const start = upper.getWorldPosition(new Vector3());
      const a = lower.position.length(), b = hand.position.length();
      const direction = target.clone().sub(start);
      const distance = Math.min(a + b - .004, Math.max(.01, direction.length()));
      direction.normalize(); target.copy(start).addScaledVector(direction, distance);
      const pole = model.localToWorld(new Vector3(sign * .43, headLocal.y - .38, headLocal.z - .05)).sub(start);
      pole.addScaledVector(direction, -pole.dot(direction)).normalize();
      const along = (a * a - b * b + distance * distance) / (2 * distance);
      const elbow = start.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
      const parentInverse = upper.parent.getWorldQuaternion(new Quaternion()).invert();
      upper.quaternion.setFromUnitVectors(lower.position.clone().normalize(), elbow.clone().sub(start).applyQuaternion(parentInverse).normalize());
      upper.updateWorldMatrix(true, true);
      lower.quaternion.setFromUnitVectors(hand.position.clone().normalize(), target.clone().sub(elbow).applyQuaternion(upper.getWorldQuaternion(new Quaternion()).invert()).normalize());
      hand.rotation.set(gesture === 'explaining' && side === 'L' ? -.45 * weight : 0, 0, sign * (.08 + (gesture === 'explaining' && side === 'L' ? .30 * weight : 0)));
    }
    for (const {bone, sign, joint} of fingers) if (bone) bone.rotation.z = sign * (.12 + (joint === 2 ? .13 : .02) + (gesture === 'thinking' ? weight * .18 : 0));
    model.updateWorldMatrix(true, true);
  };
  return apply;
}
