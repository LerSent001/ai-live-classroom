import { Color, DoubleSide, ShaderMaterial } from "three";

/** Glass-only adaptation of Sakuragaoka Station src/core/materials.js (MIT).
 * SOURCE: world-space Fresnel/analytic sky reflection, alpha blending, no RTT.
 * Local art direction: clearer glass, no drawn streaks, direct sRGB output.
 * See public/youth/licenses/sakuragaoka-station-MIT.txt. */
export function classroomWindowGlass() {
  const material = new ShaderMaterial({
    uniforms: {
      uTint: { value: new Color("#9fb6c8") },
      uSkyTop: { value: new Color("#9cc4ea") },
      uSkyLow: { value: new Color("#e9eef2") },
      uOpacity: { value: .14 },
    },
    vertexShader: `
      varying vec3 vW; varying vec3 vN;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uTint; uniform vec3 uSkyTop; uniform vec3 uSkyLow;
      uniform float uOpacity;
      varying vec3 vW; varying vec3 vN;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vN); if (dot(N, V) < 0.0) N = -N;
        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uSkyLow, uSkyTop, smoothstep(-0.1, 0.6, R.y));
        vec3 col = mix(uTint * 0.55, sky, 0.35 + 0.45 * fres);
        gl_FragColor = vec4(col, clamp(uOpacity + fres * 0.35, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: DoubleSide,
    // A single plane per pane; don't draw a second back-face transparency pass.
    forceSinglePass: true,
  });
  material.name = "Sakuragaoka analytic glass — no refraction pass";
  return material;
}
