import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Raycaster, Texture, Vector3 } from "three";
import { createYouthRoom } from "@/components/youth/room-model";

test("window and doorway are real openings and the blackboard leaves space for the clock", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {} }) }),
  } });
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.setAttribute("color", new Float32BufferAttribute(new Float32Array(geometry.getAttribute("position").count * 3).fill(.5), 3));
  const group = new Group(), material = new MeshBasicMaterial(), atlas = new Texture();
  group.add(new Mesh(geometry, material));
  let built: ReturnType<typeof createYouthRoom> | undefined;
  try {
    built = createYouthRoom(atlas, group, group, undefined, { monstera: group, pothos: group, books: group });
    built.room.updateMatrixWorld(true);
    const windowHits = new Raycaster(new Vector3(0, 3.1, -3.55), new Vector3(-1, 0, 0)).intersectObject(built.room);
    const first = windowHits[0];
    assert.ok(Math.abs(first.point.x + 6.04) < .01, "Window ray reaches the glass, not a solid wall/backplate");
    assert.equal(((first.object as Mesh).material as MeshBasicMaterial).transparent, true);
    const doorHits = new Raycaster(new Vector3(0, 2.05, -2.5), new Vector3(1, 0, 0)).intersectObject(built.room);
    assert.ok(doorHits[0].point.x > 6, "Door leaf sits inside the wall reveal");
    const board = built.room.children.find(object => object instanceof Mesh && object.material instanceof MeshLambertMaterial && object.material.color.getHexString() === "e6eadd") as Mesh;
    board.geometry.computeBoundingBox();
    assert.ok(board.geometry.boundingBox!.max.x < 4.1);
    assert.ok(5.35 - .43 - board.geometry.boundingBox!.max.x > .8, "Clock has a clear visual margin");
  } finally {
    built?.dispose(); geometry.dispose(); material.dispose(); atlas.dispose();
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
