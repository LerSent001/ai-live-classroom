import test from 'node:test';
import assert from 'node:assert/strict';
import { hoverLift, installRoomHover } from './room-hover';
import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, ShaderLib, type WebGLRenderer } from 'three';

test('hover turns only existing outline ink white and leaves surface fragments unchanged', () => {
  const room = new Group();
  const geometry = new BufferGeometry();
  geometry.setAttribute('hoverId', new Float32BufferAttribute([4], 1));
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute('normal', new Float32BufferAttribute([0, 1, 0], 3));
  const face = new MeshBasicMaterial(), ink = new LineBasicMaterial();
  room.add(new Mesh(geometry, face), new LineSegments(geometry, ink));
  installRoomHover(room);
  for (const material of [face, ink]) {
    const shader = { vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as WebGLRenderer);
    assert.match(shader.vertexShader, /transformed.y \+= uHoverLift/);
    if (material === face) assert.equal(shader.fragmentShader, ShaderLib.basic.fragmentShader);
    else {
      assert.match(shader.fragmentShader, /mix\(outgoingLight, vec3\(1.0\), vHoverLight\)/);
      assert.match(shader.fragmentShader, /mix\(diffuseColor.a, 1.0, vHoverLight\)/);
    }
  }
});

test('furniture hover is a single finite lift, while screen and reduced-motion stay fixed', () => {
  for (const id of [3, 4, 5, 6, 17]) {
    assert.equal(hoverLift(id, 0, false), 0);
    assert.ok(hoverLift(id, .5, false) > .04);
    assert.equal(hoverLift(id, 1, false), 0);
    assert.equal(hoverLift(id, 2, false), 0);
    assert.equal(hoverLift(id, .5, true), 0);
  }
  for (const id of [0, 1, 18, 19, 20, 21, 22]) assert.equal(hoverLift(id, .5, false), 0);
});
