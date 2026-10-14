import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Object3D, Vector3 } from 'three';
import { createMentorGestures } from './mentor-gestures';

test('actual VRoid arm rig supports finite poses and returns to the same relaxed stance', () => {
  const file = readFileSync(new URL('../../../public/youth/models/hair-female.vrm', import.meta.url));
  const model = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)).toString());
  type Node = {name:string; translation:[number,number,number]; rotation:[number,number,number,number]; children?:number[]};
  const nodes: Node[] = model.nodes;
  const objects = nodes.map(n => {const o = new Object3D(); o.name = n.name; if(n.translation)o.position.fromArray(n.translation); if(n.rotation)o.quaternion.fromArray(n.rotation); return o;});
  nodes.forEach((n, i) => n.children?.forEach(child => objects[i].add(objects[child])));
  const root = new Object3D(); objects.filter(o => !o.parent).forEach(o => root.add(o));
  const pose = createMentorGestures(root);
  const hand = root.getObjectByName('J_Bip_R_Hand')!;
  pose('thinking', 0);
  const rest = hand.getWorldPosition(new Vector3());
  pose('thinking', 1);
  assert.ok(hand.getWorldPosition(new Vector3()).y > rest.y + .25);
  for(const gesture of ['thinking','explaining','attentive'] as const) {
    for(const weight of [0,.25,.5,.75,1,.75,.5,.25,0]) {
      pose(gesture,weight);
      root.traverse(o => assert.ok([...o.quaternion.toArray(), ...o.position.toArray()].every(Number.isFinite)));
    }
    assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(rest)<1e-5, 'No accumulated pose drift');
  }
});
