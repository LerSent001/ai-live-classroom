import { Color, MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial, ShaderChunk, type ShaderMaterial, type MeshLambertMaterialParameters, type MeshPhongMaterialParameters, type Texture } from "three";

export type CampusMaterial = MeshBasicMaterial | MeshLambertMaterial | MeshPhongMaterial | ShaderMaterial;

/** Original print-inspired classroom shading, not the reference site's shader.
 * Keep the baked UVs and single material pass: no render target or time uniform. */
export function campusMaterials(lightMap?: Texture) {
  return {
    material: (color: string, options: MeshLambertMaterialParameters = {}, textureStrength = 1) => {
      const { emissive, emissiveIntensity = 1, ...surface } = options;
      const mat = lightMap
        // Cycles DIFFUSE bake stores the white surface response; Basic's light
        // map shader divides by PI, so restore those units once here.
        ? new MeshBasicMaterial({ color, vertexColors: true, ...surface, lightMap: emissive ? null : lightMap, lightMapIntensity: Math.PI })
        : new MeshLambertMaterial({ color, vertexColors: true, ...options });
      if (lightMap && emissive) mat.color.lerp(new Color(emissive), Math.min(.6, emissiveIntensity * .5));
      mat.onBeforeCompile = shader => {
        if (options.map) shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", ShaderChunk.map_fragment.replace("diffuseColor *= sampledDiffuseColor;", `sampledDiffuseColor.rgb = mix(vec3(1.0), sampledDiffuseColor.rgb, ${(textureStrength * .75).toFixed(3)}); diffuseColor *= sampledDiffuseColor;`));
        if (lightMap && !emissive) shader.fragmentShader = shader.fragmentShader.replace('vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );', `
            vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
            float daylight = max(dot(lightMapTexel.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.001);
            // Broad transitions keep bake sampling variation from turning
            // into hard islands on otherwise flat walls and ceiling beams.
            float celDaylight = 0.36 + 0.25 * smoothstep(0.24, 0.48, daylight)
              + 0.35 * smoothstep(0.57, 0.84, daylight)
              + 0.32 * smoothstep(0.98, 1.24, daylight);
            lightMapTexel.rgb *= mix(daylight, celDaylight, 0.55) / daylight;
            // Lavender ink in shade; warm unprinted paper in direct daylight.
            lightMapTexel.rgb *= mix(vec3(0.88, 0.86, 1.13), vec3(1.03, 1.01, 0.96), smoothstep(0.38, 1.05, daylight));
            // Extra diffuse fill lifts shaded desks/ceiling without bleaching sunlit patches.
            lightMapTexel.rgb = lightMapTexel.rgb * 1.07 + vec3(0.16, 0.155, 0.15);
        `);
        if (lightMap && !emissive) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
          // Screen-space print cells are stable at rest and derivative-smoothed.
          // This is part of the room material, so DOM video/text stay untouched.
          float printShade = 1.0 - smoothstep(0.20, 0.65, dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)));
          vec2 printCell = fract(gl_FragCoord.xy / 5.0) - 0.5;
          float printDistance = length(printCell);
          float printAA = max(fwidth(printDistance), 0.04);
          float printDot = 1.0 - smoothstep(0.19 - printAA, 0.19 + printAA, printDistance);
          outgoingLight *= 1.0 - printDot * printShade * 0.12;
          #include <opaque_fragment>
        `);
      };
      mat.customProgramCacheKey = () => `campus-print-v4-${textureStrength}-${!!lightMap}-${!!emissive}`;
      return mat;
    },
    glass: (color: string, options: MeshPhongMaterialParameters = {}) => new MeshPhongMaterial({ color, vertexColors: true, specular: "#8399a9", shininess: 48, ...options }),
  };
}
