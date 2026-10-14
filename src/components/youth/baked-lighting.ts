import { BufferAttribute, BufferGeometry, Color, EdgesGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh } from "three";
import { youthGeometryStamp } from "./bake-contract";

export type YouthBakeManifest = { uvBytes: number; meshes: { vertices: number; stamp: string }[] };

/** Offline UVs replace all browser shadow-map passes, including first load. */
export function installYouthBake(room: Group, buffer: ArrayBuffer, manifest: YouthBakeManifest) {
  if (buffer.byteLength !== manifest.uvBytes || room.children.length !== manifest.meshes.length) throw new Error("Classroom lighting assets do not match the room");
  const uv = new Uint16Array(buffer);
  let offset = 0;
  const edges: number[] = [];
  const hoverIds: number[] = [];
  const vertexKey = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
  for (let i = 0; i < manifest.meshes.length; i++) {
    const mesh = room.children[i] as Mesh;
    const expected = manifest.meshes[i];
    if (mesh.geometry.getAttribute("position").count !== expected.vertices || youthGeometryStamp(mesh.geometry) !== expected.stamp) {
      throw new Error(`Classroom lighting needs rebaking (batch ${i})`);
    }
    mesh.geometry.setAttribute("uv1", new BufferAttribute(uv.subarray(offset, offset + expected.vertices * 2), 2, true));
    offset += expected.vertices * 2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (mesh.userData.campusOutline) {
      const outline = new EdgesGeometry(mesh.geometry, 58);
      const positions = outline.getAttribute("position");
      const source = mesh.geometry.getAttribute('position'), ids = mesh.geometry.getAttribute('hoverId');
      const lookup = new Map<string, number>();
      for (let v = 0; v < source.count; v++) lookup.set(vertexKey(source.getX(v), source.getY(v), source.getZ(v)), ids?.getX(v) ?? 0);
      for (let v = 0; v < positions.count; v++) {
        edges.push(positions.getX(v), positions.getY(v), positions.getZ(v));
        hoverIds.push(lookup.get(vertexKey(positions.getX(v), positions.getY(v), positions.getZ(v))) ?? 0);
      }
      outline.dispose();
    }
  }
  // Dark violet print ink, applied to selected real edges in ONE draw.
  // No normal/depth prepass, screen-space edge filter, inverted hull or thick lines.
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(edges, 3));
  geometry.setAttribute("hoverId", new Float32BufferAttribute(hoverIds, 1));
  const material = new LineBasicMaterial({ color: new Color("#373054"), transparent: true, opacity: .68, depthWrite: false, toneMapped: false });
  const lines = new LineSegments(geometry, material);
  lines.name = "Static anime architectural ink";
  lines.renderOrder = 1;
  room.add(lines);
  room.userData.bakedLighting = true;
  room.userData.inkSegments = edges.length / 6;
  return () => { geometry.dispose(); material.dispose(); };
}
