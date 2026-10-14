import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, ShaderLib, type WebGLRenderer } from 'three';
import { installRoomArrival } from './room-arrival';
import { youthGeometryStamp } from './bake-contract';

test('arrival preserves baked geometry and material batches, and shares one finite clock', () => {
  const room = new Group();
  const geometry = new BoxGeometry().toNonIndexed();
  const material = new MeshBasicMaterial();
  const stamp = youthGeometryStamp(geometry);
  geometry.setAttribute('arrival', new Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3));
  room.add(new Mesh(geometry, material));
  const clock = installRoomArrival(room);
  const shader = {...ShaderLib.basic, uniforms:{...ShaderLib.basic.uniforms}};
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as WebGLRenderer);
  assert.equal(room.children.length, 1);
  assert.equal(youthGeometryStamp(geometry), stamp);
  assert.equal(shader.uniforms.uArrivalTime, clock);
  assert.match(shader.vertexShader, /arrivalProgress/);
  assert.match(shader.fragmentShader, /arrivalGlow/);
  assert.match(shader.fragmentShader, /discard/);
  assert.equal(clock.value, 10, 'Unanimated exports default to the complete room');
  geometry.dispose(); material.dispose();
});
