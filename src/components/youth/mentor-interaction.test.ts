import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {AnimationClip, AnimationMixer, Group, Object3D, QuaternionKeyframeTrack, Vector3} from 'three';
import {VRMHumanoid, type VRMHumanBones} from '@pixiv/three-vrm';
import {createBackRest} from './mentor-back-rest';
import {cloudPosition} from './mentor-interaction';

test('cloud anchors to the projected head with a visual gap, not the canvas bounds',()=>{
  const desktop=cloudPosition({left:1100,right:1250,top:460},1440,244,94);
  assert.equal(desktop.x+244,1100-14);
  const mobile=cloudPosition({left:145,right:296,top:438},390,190,84);
  assert.equal(mobile.y+84,438-14);
  assert.ok(mobile.x>=12 && mobile.x+190<=378);
});

test('actual VRoid back-rest places both hands behind the waist even with the portrait rotated',()=>{
  const file=readFileSync(new URL('../../../public/youth/models/hair-female.vrm',import.meta.url));
  const json=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString());
  type Node={name:string;translation?:[number,number,number];rotation?:[number,number,number,number];children?:number[]};
  const nodes:Node[]=json.nodes;
  const objects=nodes.map(n=>{const o=new Object3D();o.name=n.name;if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);return o;});
  nodes.forEach((n,i)=>n.children?.forEach(c=>objects[i].add(objects[c])));
  const model=new Group();objects.filter(o=>!o.parent).forEach(o=>model.add(o));model.updateMatrixWorld(true);
  const bones=Object.fromEntries(json.extensions.VRM.humanoid.humanBones.map(({bone,node}:{bone:string;node:number})=>[bone.replace(/ThumbProximal$/,'ThumbMetacarpal').replace(/ThumbIntermediate$/,'ThumbProximal'),{node:objects[node]}])) as VRMHumanBones;
  const humanoid=new VRMHumanoid(bones);model.add(humanoid.normalizedHumanBonesRoot);
  const wrapper=new Group();wrapper.rotation.y=Math.PI;wrapper.add(model);wrapper.updateMatrixWorld(true);
  const tracks=Object.values(humanoid.normalizedHumanBones).map(({node})=>new QuaternionKeyframeTrack(`${node.name}.quaternion`,[0,1],[0,0,0,1,0,0,0,1]));
  const pose=createBackRest(humanoid,new AnimationClip('base',1,tracks));
  const mixer=new AnimationMixer(model);mixer.clipAction(pose).play();
  for(let frame=0;frame<120;frame++){
    mixer.update(1/24);humanoid.update();wrapper.updateMatrixWorld(true);
    for(const side of ['left','right'] as const){
      const hand=model.worldToLocal(humanoid.getRawBoneNode(`${side}Hand`)!.getWorldPosition(new Vector3()));
      assert.ok(hand.z>.20 && Math.abs(hand.x)<.10,'Hands sit behind the back, not inside the skirt sides');
    }
    model.traverse(o=>assert.ok([...o.position.toArray(),...o.quaternion.toArray()].every(Number.isFinite)));
  }
});
