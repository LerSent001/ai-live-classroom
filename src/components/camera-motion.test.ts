import assert from "node:assert/strict";
import test from "node:test";
import { classroomPose, dragViewYaw, entrancePose, MAX_VIEW_YAW } from "./set/camera-motion";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import { commitCameraView } from "./set/camera-frame";

test("the entrance finishes at the existing desktop and portrait lobby composition", () => {
  for (const [width, height] of [[1280, 720], [390, 844]]) {
    const end = classroomPose(width!, height!, false);
    const start = entrancePose(width!, height!, 0);
    assert.deepEqual(entrancePose(width!, height!, 1), end);
    assert.ok(start.position[0] < end.position[0]);
    assert.ok(start.position[2] > end.position[2]);
    assert.deepEqual(entrancePose(width!, height!, -1), start);
    assert.deepEqual(entrancePose(width!, height!, 2), end);
    assert.ok(entrancePose(width!, height!, 0.5).position.every(Number.isFinite));
  }
  assert.deepEqual(classroomPose(1280, 720, false).position, [3.1, 4.9, 15.8]);
  assert.deepEqual(classroomPose(390, 844, true).position, [0, 3.4, 4.1]);
});

test("mouse look stops at either 15-degree limit and reverses immediately", () => {
  let yaw = 0;
  for (let i = 0; i < 100; i++) yaw = dragViewYaw(yaw, 120, 1200);
  assert.equal(yaw, MAX_VIEW_YAW);
  assert.ok(dragViewYaw(yaw, -1, 1200) < MAX_VIEW_YAW);
  for (let i = 0; i < 100; i++) yaw = dragViewYaw(yaw, -120, 1200);
  assert.equal(yaw, -MAX_VIEW_YAW);
  assert.ok(dragViewYaw(yaw, 1, 1200) > -MAX_VIEW_YAW);
  assert.ok(Math.abs(MAX_VIEW_YAW * 180 / Math.PI - 15) < 1e-10);
});

test("entrance, mouse look, and TV movement publish matching camera matrices before offscreen passes", () => {
  for (const [width, height] of [[1280, 720], [390, 844]] as const) {
    const camera = new PerspectiveCamera(46, width / height, 0.1, 90);
    const target = new Vector3();
    const up = new Vector3(0, 1, 0);
    const expectedWorld = new Matrix4();
    const poses = [
      ...Array.from({ length: 61 }, (_, frame) => entrancePose(width, height, frame / 60)),
      classroomPose(width, height, true),
      classroomPose(width, height, false),
    ];
    for (const pose of poses) {
      for (const yaw of [-MAX_VIEW_YAW, 0, MAX_VIEW_YAW, 0]) {
        camera.position.fromArray(pose.position);
        camera.fov = pose.fov;
        target.fromArray(pose.lookAt).sub(camera.position).applyAxisAngle(up, yaw).add(camera.position);
        commitCameraView(camera, target);
        // Mirror the reflector's immediate matrix reads, with no renderer or
        // Html callback allowed to repair stale state on the camera's behalf.
        expectedWorld.compose(camera.position, camera.quaternion, camera.scale);
        assert.deepEqual(camera.matrixWorld.elements, expectedWorld.elements);
        const expectedInverse = expectedWorld.clone().invert();
        assert.ok(camera.matrixWorldInverse.elements.every((value, index) =>
          Math.abs(value - expectedInverse.elements[index]) < 1e-10,
        ));
        const opticalAxis = target.clone().applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
        assert.ok(Math.abs(opticalAxis.x) < 1e-12 && Math.abs(opticalAxis.y) < 1e-12);
        assert.ok(opticalAxis.toArray().every(Number.isFinite));
      }
    }
  }
});
