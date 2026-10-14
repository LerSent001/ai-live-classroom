import type { Material } from 'three';

export const MENTOR_ARRIVAL_SECONDS = 1.25;

// Screen-space square cells shared by skin, hair, eyes and silhouette ink.
// Bayer threshold approximation adapted from three.js r185 Bayer.js (MIT).
// See docs/youth/mentor-arrival-license.txt. Timing/reveal composition is local.
export function installMentorArrival(material: Material, progress: {value: number}, pixelRatio: {value: number}) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.mentorArrival = progress;
    shader.uniforms.mentorArrivalDpr = pixelRatio;
    shader.vertexShader = `varying float mentorHeight;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      'mentorHeight = clamp(transformed.y / 1.6, 0.0, 1.0);\n#include <project_vertex>',
    );
    shader.fragmentShader = `uniform float mentorArrival;\nuniform float mentorArrivalDpr;\nvarying float mentorHeight;\n${shader.fragmentShader}`.replace(
      '#include <clipping_planes_fragment>', `
      #include <clipping_planes_fragment>
      float mentorCellAge = 1.0;
      if (mentorArrival < 1.0) {
        vec2 cell = floor(gl_FragCoord.xy / (12.0 * mentorArrivalDpr));
        vec2 bayerXY = mod(cell, 4.0);
        float bayer = mod(floor(bayerXY.x + 1.0) * floor(bayerXY.y + 1.0) * 17.0, 16.0) / 16.0;
        float scatter = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float threshold = 0.035 + 0.64 * bayer + 0.13 * scatter + 0.16 * mentorHeight;
        mentorCellAge = mentorArrival - threshold;
        if (mentorCellAge <= 0.0) discard;
      }`,
    ).replace('#include <opaque_fragment>', `
      // Brief mint signal on newly assembled blocks, then the untouched material.
      if (mentorArrival < 1.0) outgoingLight = mix(outgoingLight, vec3(0.55, 0.94, 0.82),
        (1.0 - smoothstep(0.0, 0.09, mentorCellAge)) * 0.72);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${previousKey}-mentor-digital-arrival-v1`;
}
