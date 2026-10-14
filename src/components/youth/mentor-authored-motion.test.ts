import assert from 'node:assert/strict';
import test from 'node:test';
import {AnimationClip, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack} from 'three';
import {addSleeveClearance, isLocalMotionHost, stillFromClip} from './mentor-authored-motion';

test('dress fit moves hanging arms outward, preserves lifted arms and original tracks', () => {
  for (const side of ['left','right'] as const) {
    const sign = side === 'left' ? -1 : 1;
    const down = new Quaternion().setFromAxisAngle(new Vector3(0,0,1), -sign * Math.PI / 2);
    const source = new QuaternionKeyframeTrack('arm.quaternion',[0,1],[...down.toArray(),0,0,0,1]);
    const fitted = addSleeveClearance(source,side);
    const direction = new Vector3(sign,0,0).applyQuaternion(new Quaternion().fromArray(fitted.values));
    assert.ok(direction.x * sign > .18, 'Hand gains outward clearance');
    assert.deepEqual(Array.from(fitted.values.slice(4)),[0,0,0,1], 'Raised/level arm is unmodified');
    assert.deepEqual(Array.from(source.values.slice(0,4)),Array.from(new Float32Array(down.toArray())));
    assert.ok(Array.from(fitted.values).every(Number.isFinite));
  }
});

test('restricted supplied motions are only requested on loopback hosts', () => {
  for(const host of ['localhost','127.0.0.1','[::1]']) assert.equal(isLocalMotionHost(host),true);
  for(const host of ['classroom.vercel.app','192.168.1.1','localhost.example.com','']) assert.equal(isLocalMotionHost(host),false);
});

test('rest preserves the authored first frame and finger channels without mutating source', () => {
  const position = new VectorKeyframeTrack('hips.position',[0,1],[0,1,0,0,2,0]);
  const finger = new QuaternionKeyframeTrack('finger.quaternion',[0,1],[0,0,0,1,0,1,0,0]);
  const source = new AnimationClip('pose',1,[position,finger]);
  const rest=stillFromClip(source);
  assert.deepEqual(Array.from(rest.tracks[0].values),[0,1,0,0,1,0]);
  assert.deepEqual(Array.from(rest.tracks[1].values),[0,0,0,1,0,0,0,1]);
  assert.deepEqual(Array.from(source.tracks[0].values),[0,1,0,0,2,0]);
});
