import type { BufferGeometry } from "three";

/** Keep the offline UV atlas tied to the exact geometry, including normals. */
export function youthGeometryStamp(geometry: BufferGeometry): string {
  let hash = 2166136261;
  for (const name of ["position", "normal"] as const) {
    const attribute = geometry.getAttribute(name);
    const values = attribute.array;
    const bits = new Uint32Array(values.buffer, values.byteOffset, values.byteLength / 4);
    for (const value of bits) hash = Math.imul(hash ^ value, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
