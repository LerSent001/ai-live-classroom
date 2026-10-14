import { Mesh, type Group, type Material } from "three";

// Original classroom timing, not extracted timing from the reference site.
// Per-vertex IDs keep furniture in its existing material batches and bake UVs.
export function installRoomArrival(room: Group) {
  const clock = { value: 10 };
  const materials = new Set<Material>();
  room.traverse(object => {
    if (!(object instanceof Mesh) || !object.geometry.hasAttribute('arrival')) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const material of materials) {
    const original = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      original.call(material, shader, renderer);
      shader.uniforms.uArrivalTime = clock;
      shader.vertexShader = `attribute vec3 arrival; uniform float uArrivalTime; varying vec3 vArrival; varying float vArrivalHeight;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float arrivalProgress = arrival.x < 0.0 ? 1.0 : clamp((uArrivalTime - arrival.x) / 0.46, 0.0, 1.0);
        float arrivalReveal = 1.0 - pow(1.0 - arrivalProgress, 3.0);
        vArrival = vec3(arrivalReveal, arrival.y, arrival.z);
        vArrivalHeight = position.y;
        float arrivalSettle = 0.12 * exp(-5.0 * arrivalProgress) * cos(10.0 * arrivalProgress) * (1.0 - arrivalProgress);
        transformed.y += arrival.x < 0.0 ? 0.0 : arrivalSettle;
      `);
      shader.fragmentShader = `varying vec3 vArrival; varying float vArrivalHeight;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
        #include <clipping_planes_fragment>
        float arrivalEdge = mix(vArrival.y, vArrival.z, vArrival.x);
        if (vArrival.x < 1.0 && (vArrival.x < 0.001 || vArrivalHeight > arrivalEdge)) discard;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        if (vArrival.x > 0.0 && vArrival.x < 1.0) {
          float arrivalGlow = 1.0 - smoothstep(0.0, 0.055, abs(vArrivalHeight - arrivalEdge));
          outgoingLight = mix(outgoingLight, vec3(0.65, 1.0, 0.95), arrivalGlow * 0.85);
        }
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey = () => `${key}-arrival-v2`;
  }
  return clock;
}
