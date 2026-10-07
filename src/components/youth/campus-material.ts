import { Color, MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial, ShaderChunk, type ShaderMaterial, type MeshLambertMaterialParameters, type MeshPhongMaterialParameters, type Texture } from "three";

export type CampusMaterial = MeshBasicMaterial | MeshLambertMaterial | MeshPhongMaterial | ShaderMaterial;

/** Continuous diffuse response: an anime background is not a four-band character
 * shader. No ramp texture, outline pass, PBR layers, separate normal/roughness textures,
 * animated uniforms, environment/refraction or screen-space postprocessing. */
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
      if (options.map && textureStrength !== 1) {
        mat.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", ShaderChunk.map_fragment.replace("diffuseColor *= sampledDiffuseColor;", `sampledDiffuseColor.rgb = mix(vec3(1.0), sampledDiffuseColor.rgb, ${textureStrength.toFixed(3)}); diffuseColor *= sampledDiffuseColor;`));
        };
        mat.customProgramCacheKey = () => `campus-texture-${textureStrength}`;
      }
      return mat;
    },
    glass: (color: string, options: MeshPhongMaterialParameters = {}) => new MeshPhongMaterial({ color, vertexColors: true, specular: "#8399a9", shininess: 48, ...options }),
  };
}
