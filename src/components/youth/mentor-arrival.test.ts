import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshToonMaterial, ShaderLib, type WebGLRenderer, type WebGLProgramParametersWithUniforms } from 'three';
import { installMentorArrival, MENTOR_ARRIVAL_SECONDS } from './mentor-arrival';

test('digital arrival chains existing material changes and shares the reveal uniform', () => {
  const material = new MeshToonMaterial();
  material.customProgramCacheKey = () => 'original-hair';
  material.onBeforeCompile = shader => { shader.fragmentShader += '\n// original hair'; };
  const progress = {value: 0}, dpr = {value: 1.25};
  installMentorArrival(material, progress, dpr);
  const shader = {...ShaderLib.toon, uniforms: {...ShaderLib.toon.uniforms}} as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  assert.equal(shader.uniforms.mentorArrival, progress);
  assert.equal(shader.uniforms.mentorArrivalDpr, dpr);
  assert.match(shader.fragmentShader, /original hair/);
  assert.match(shader.fragmentShader, /if \(mentorArrival < 1.0\)/);
  assert.match(shader.fragmentShader, /if \(mentorCellAge <= 0.0\) discard/);
  assert.match(shader.vertexShader, /mentorHeight = clamp/);
  assert.match(material.customProgramCacheKey(), /^original-hair-mentor-digital/);
  assert.equal(material.transparent, false);
  assert.equal(MENTOR_ARRIVAL_SECONDS, 1.25);
});
