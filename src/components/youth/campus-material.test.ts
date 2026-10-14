import assert from 'node:assert/strict';
import test from 'node:test';
import { ShaderLib, Texture, type WebGLRenderer } from 'three';
import { campusMaterials } from './campus-material';

test('print shading uses the existing bake and one fragment pass with no animation clock', () => {
  const lightMap = new Texture();
  const material = campusMaterials(lightMap).material('#fff8e8', { map: new Texture() });
  const shader = { ...ShaderLib.basic, uniforms: { ...ShaderLib.basic.uniforms } };
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as WebGLRenderer);
  assert.equal(material.lightMap, lightMap);
  assert.equal(material.type, 'MeshBasicMaterial');
  assert.match(shader.fragmentShader, /float celDaylight/);
  assert.match(shader.fragmentShader, /float printDot/);
  assert.match(shader.fragmentShader, /fwidth\(printDistance\)/);
  assert.doesNotMatch(shader.fragmentShader, /uniform float.*[Tt]ime/);
  assert.equal(shader.fragmentShader.split('#include <opaque_fragment>').length, 2);
  assert.match(material.customProgramCacheKey(), /campus-print-v4/);
  material.map?.dispose(); material.dispose(); lightMap.dispose();
});

test('emissive and unbaked fallback surfaces are not darkened by print cells', () => {
  const texture = new Texture();
  const materials = [campusMaterials(texture).material('#ffffff', { emissive: '#ffffff' }), campusMaterials().material('#ffffff')];
  for (const material of materials) {
    const shader = { ...ShaderLib.basic, uniforms: { ...ShaderLib.basic.uniforms } };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as WebGLRenderer);
    assert.doesNotMatch(shader.fragmentShader, /float printDot|float celDaylight/);
    material.dispose();
  }
  texture.dispose();
});
