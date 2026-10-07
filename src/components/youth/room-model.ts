import {
  Box3, BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, PlaneGeometry, Shape,
  Euler, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion,
  SRGBColorSpace, Vector3, type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { YOUTH_RENDERING } from "@/lib/youth-classroom";
import { campusMaterials, type CampusMaterial } from "./campus-material";
import surfaceAtlas from "../../../public/youth/surfaces.json";
import { classroomWindowGlass } from "./window-glass";

type Point = readonly [number, number, number];

/** A static, actual 3D model. Bake transforms and batch by shared material once;
 * furniture has neither React frame work nor hundreds of separate draw calls. */
export function createYouthRoom(atlas: Texture, desk: Group, chair: Group, lightMap: Texture | undefined, props: { monstera: Group; pothos: Group; books: Group }) {
  const room = new Group();
  room.name = "Chinese youth classroom — six desks, static daylight";
  const batches = new Map<CampusMaterial, BufferGeometry[]>();
  const ownedTextures: Texture[] = [];
  const palette = campusMaterials(lightMap);
  const material = palette.material;
  const m = {
    plaster: material("#fffdf7", { map: atlas }), ceiling: material("#f9f5ec", { map: atlas }), sage: material("#a6b8a6", { map: atlas }, .6),
    sageEdge: material("#859883"), wood: material("#eed8b6", { map: atlas }, .55), trim: material("#c6ae8b", { map: atlas }, .55),
    metal: material("#85968a"), cream: material("#eeeae0"), dark: material("#293235"),
    rubber: material("#43504b"), blue: classroomWindowGlass(),
    sky: new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }),
    props: material("#ffffff", { side: DoubleSide }),
    frame: palette.glass("#aeb4b1", { specular: "#5d6a6d", shininess: 25 }), windowShadow: material("#6c7b80"),
    displayGlass: palette.glass("#202629", { specular: "#aab8b9", shininess: 68, emissive: "#11191a", emissiveIntensity: .1 }),
    chalkboard: material("#e6eadd", { map: atlas }),
    light: material("#fff9e1", { emissive: "#fff3cf", emissiveIntensity: .65 }),
    paper: material("#ffefcf"), book1: material("#94bdae"), book2: material("#7cabc5"), book3: material("#d69579"),
    soil: material("#745c42"), leaf: material("#669b72", { side: DoubleSide }), leafLight: material("#93b980", { side: DoubleSide }),
    furniture: material("#efe1c9", { map: atlas }, .65),
  };
  const regionByMaterial = new Map<CampusMaterial, keyof typeof surfaceAtlas.regions>([
    [m.plaster, "plaster"], [m.ceiling, "plaster"], [m.sage, "plaster"], [m.wood, "wood"], [m.trim, "wood"], [m.chalkboard, "board"],
  ]);
  function atlasUV(geometry: BufferGeometry, region: keyof typeof surfaceAtlas.regions) {
    const uv = geometry.getAttribute("uv"), [x, y, width, height] = surfaceAtlas.regions[region];
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * width) / surfaceAtlas.width, 1 - (y + (1 - uv.getY(i)) * height) / surfaceAtlas.height);
  }
  const add = (geometry: BufferGeometry, mat: CampusMaterial, position: Point, rotation: Point = [0, 0, 0], scale: Point = [1, 1, 1]) => {
    const transform = new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale));
    const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    flat.applyMatrix4(transform);
    if ((mat === m.plaster || mat === m.ceiling) && geometry instanceof BoxGeometry && flat.getAttribute("position").count > 100) {
      // Repeat the plaster within subdivided wall cells, entirely in the static
      // UVs. No fragment fract/noise loop and no high-resolution wall texture.
      const uv = flat.getAttribute("uv"), normals = flat.getAttribute("normal"), p = geometry.parameters;
      for (let i = 0; i < uv.count; i += 3) {
        const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i));
        const uRepeat = nx > .7 ? p.depthSegments : p.widthSegments;
        const vRepeat = ny > .7 ? p.depthSegments : p.heightSegments;
        const uCell = Math.floor((uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3 * uRepeat);
        const vCell = Math.floor((uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3 * vRepeat);
        for (let j = i; j < i + 3; j++) uv.setXY(j, uv.getX(j) * uRepeat - uCell, uv.getY(j) * vRepeat - vCell);
      }
    }
    const region = regionByMaterial.get(mat);
    if (region) atlasUV(flat, region);
    const points = flat.getAttribute("position"), normals = flat.getAttribute("normal"), sourceColor = flat.getAttribute("color");
    const colors = new Float32Array(points.count * 3);
    const skyTop = new Color("#b4d1e1"), skyBottom = new Color("#edf1ef");
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
      let shade = .94 + .06 * Math.min(1, y / 2);
      if (mat === m.plaster || mat === m.ceiling || mat === m.sage) {
        const side = Math.abs(normals.getX(i)) > .7;
        const edge = side ? Math.max(0, z + 4.5) : Math.max(0, 5.95 - Math.abs(x));
        const cavity = Math.min(1, edge / .9, Math.max(0, y) / .75, Math.max(0, 5.45 - y) / .65);
        shade = .78 + .22 * cavity;
      } else if (normals.getY(i) < -.5) shade *= .91;
      if (mat === m.sky) {
        const sky = skyBottom.clone().lerp(skyTop, Math.max(0, Math.min(1, y / 9)));
        colors.set([sky.r, sky.g, sky.b], i * 3);
      } else {
        const r = sourceColor?.getX(i) ?? 1, g = sourceColor?.getY(i) ?? 1, b = sourceColor?.getZ(i) ?? 1;
        colors.set([r * shade, g * shade, b * (shade + (1 - shade) * .16)], i * 3);
      }
    }
    flat.setAttribute("color", new Float32BufferAttribute(colors, 3));
    batches.set(mat, [...(batches.get(mat) ?? []), flat]);
    geometry.dispose();
  };
  const box = (p: Point, size: Point, mat: CampusMaterial, bevel = 0, rot: Point = [0, 0, 0]) => {
    const geometry = bevel ? new RoundedBoxGeometry(...size, 1, bevel) : new BoxGeometry(...size);
    if ((mat === m.wood || mat === m.trim) && size[1] > Math.max(size[0], size[2])) {
      const uv = geometry.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
    }
    add(geometry, mat, p, rot);
  };
  const cylinder = (p: Point, top: number, bottom: number, height: number, mat: CampusMaterial, rot: Point = [0, 0, 0], segments = 12) =>
    add(new CylinderGeometry(top, bottom, height, segments), mat, p, rot);
  const panel = (p: Point, width: number, height: number, depth: number, radius: number, mat: CampusMaterial, rot: Point = [0, 0, 0]) => {
    // Round the outline independently of thickness (RoundedBox clamps the corner
    // radius to half the thin panel depth, making chairs look square).
    const shape = new Shape(), x = -width / 2, y = -height / 2, r = radius;
    shape.moveTo(x + r, y); shape.lineTo(x + width - r, y); shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r); shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height); shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.009, bevelThickness: 0.008, curveSegments: 3 });
    geometry.translate(0, 0, -depth / 2);
    const positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, positions.getX(i) / width + 0.5, positions.getY(i) / height + 0.5);
    add(geometry, mat, p, rot);
  };
  const rod = (a: Point, b: Point, radius: number, mat: CampusMaterial) => {
    const start = new Vector3(...a), end = new Vector3(...b), mid = start.clone().add(end).multiplyScalar(0.5);
    const geometry = new CylinderGeometry(radius, radius, start.distanceTo(end), 8);
    geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), end.sub(start).normalize()));
    add(geometry, mat, mid.toArray() as [number, number, number]);
  };

  // Real openings: glazing must not have a solid wall directly behind it.
  add(new BoxGeometry(12.1, 5.4, .2, 8, 6, 1), m.plaster, [0, 2.7, -4.6]);
  const windows = [-2.65, .85, 4.35, 7.85];
  const wallSpan = (x: number, y0: number, y1: number, z0: number, z1: number) =>
    add(new BoxGeometry(.32, y1 - y0, z1 - z0, 1, Math.max(1, Math.ceil(y1 - y0)), Math.max(1, Math.ceil(z1 - z0))), m.plaster, [x, (y0 + y1) / 2, (z0 + z1) / 2]);
  wallSpan(-6.05, 0, 1.68, -4.7, 9.65);
  wallSpan(-6.05, 4.62, 5.4, -4.7, 9.65);
  let wallEnd = -4.7;
  for (const z of windows) { wallSpan(-6.05, 1.68, 4.62, wallEnd, z - 1.64); wallEnd = z + 1.64; }
  wallSpan(-6.05, 1.68, 4.62, wallEnd, 9.65);
  wallSpan(6.05, 0, 5.4, -4.7, -3.4);
  wallSpan(6.05, 0, 5.4, -1.6, 9.65);
  wallSpan(6.05, 4.3, 5.4, -3.4, -1.6);
  // Two triangles of distant daylight, not a rendered outdoor world/skybox.
  add(new PlaneGeometry(32, 20), m.sky, [-10, 5, 2], [0, Math.PI / 2, 0]);
  add(new BoxGeometry(12.2, .2, 14, 4, 1, 4), m.ceiling, [0, 5.48, 2.2]);
  box([0, -0.08, 2.2], [12.2, 0.16, 14], m.trim);
  const floors = ["#e8d5b8", "#ebdbc1", "#e4d1b6", "#ecddc5"].map((color) => {
    const mat = material(color, { map: atlas }, .52); regionByMaterial.set(mat, "wood"); return mat;
  });
  for (let row = 0; row < 28; row++) {
    for (let col = 0; col < 6; col++) {
      const x = -6.8 + col * 2.4 + (row % 2) * 1.2;
      add(new PlaneGeometry(2.395, .495), floors[(row * 7 + col * 3) % floors.length], [x, .018, -4.3 + row * .5], [-Math.PI / 2, 0, 0]);
    }
  }
  box([0, 0.73, -4.455], [12, 1.46, 0.06], m.sage);
  for (let x = -5.9; x < 6; x += 0.48) box([x, 0.73, -4.405], [0.009, 1.45, 0.011], m.sageEdge);
  for (const x of [-5.915, 5.915]) {
    for (const [start, end] of x < 0 ? [[-4.5, 9.5]] : [[-4.5, -3.4], [-1.6, 9.5]]) {
      const center = (start + end) / 2, length = end - start;
      box([x, .73, center], [.08, 1.46, length], m.sage);
      for (let z = start + .15; z < end; z += .48) box([x - Math.sign(x) * .05, .73, z], [.011, 1.45, .009], m.sageEdge);
      box([x - Math.sign(x) * .065, 1.49, center], [.12, .065, length], m.cream);
      box([x - Math.sign(x) * .06, .11, center], [.1, .2, length], m.trim);
    }
  }
  box([0, 1.49, -4.355], [12, 0.065, 0.11], m.cream);
  box([0, 0.11, -4.34], [12, 0.2, 0.1], m.trim);
  box([0, 5.08, -4.32], [12, 0.17, 0.3], m.plaster);
  for (const z of [-1.7, 3.4, 8.4]) box([0, 5.31, z], [12, 0.06, 0.065], m.cream);
  for (const z of windows) {
    add(new PlaneGeometry(3.22, 2.86), m.blue, [-6.04, 3.15, z], [0, Math.PI / 2, 0]);
    // Recessed reveal and rubber seals give depth without a painted highlight.
    for (const dz of [-1.62, 1.62]) box([-5.97, 3.15, z + dz], [.38, 2.95, .045], m.cream);
    for (const y of [1.71, 4.59]) box([-5.97, y, z], [.38, .055, 3.28], m.cream);
    for (const dz of [-1.59, 0, 1.59]) box([-6.025, 3.15, z + dz], [.025, 2.84, .025], m.windowShadow);
    for (const offset of [-1.64, 0, 1.64]) {
      box([-5.88, 3.14, z + offset], [0.13, 2.93, 0.075], m.frame, offset === 0 ? .008 : 0);
    }
    for (const y of [1.7, 3.67, 4.59]) {
      box([-5.88, y, z], [0.13, 0.065, 3.35], m.frame, y === 3.67 ? .008 : 0);
    }
    for (const offset of [-.08, .08]) box([-5.785, 2.91, z + offset], [.05, .16, .025], m.frame, .005);
    box([-5.66, 1.63, z], [0.43, 0.105, 3.48], m.cream, .008);
  }

  // Blackboard: the requested formulas are a single authored texture.
  box([-.05, 3.14, -4.29], [8.45, 2.91, 0.12], m.trim, 0.035);
  box([-.05, 3.14, -4.208], [8.25, 2.72, 0.045], m.chalkboard);
  box([-.05, 1.71, -4.09], [8.57, 0.095, 0.28], m.trim, 0.015);
  box([-2.4, 1.79, -4.05], [0.25, 0.095, 0.11], m.paper, 0.015);
  box([3.9, 1.79, -4.05], [0.21, 0.095, 0.11], m.paper, 0.015);

  // Static analog clock, reusing the original classroom's canvas-texture approach.
  const clockCanvas = document.createElement("canvas"); clockCanvas.width = 256; clockCanvas.height = 256;
  const ctx = clockCanvas.getContext("2d")!;
  ctx.fillStyle = "#f1ebdc"; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#39413b"; ctx.font = "21px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let n = 1; n <= 12; n++) { const a = n * Math.PI / 6; ctx.fillText(String(n), 128 + Math.sin(a) * 98, 128 - Math.cos(a) * 98); }
  ctx.strokeStyle = "#343b36"; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(79, 105); ctx.lineTo(128, 128); ctx.lineTo(128, 50); ctx.stroke();
  const clockMap = new CanvasTexture(clockCanvas); clockMap.colorSpace = SRGBColorSpace; ownedTextures.push(clockMap);
  cylinder([5.35, 4.3, -4.22], 0.43, 0.43, 0.075, m.dark, [Math.PI / 2, 0, 0], 48);
  add(new CircleGeometry(.402, 48), material("#ffffff", { map: clockMap }), [5.35, 4.3, -4.174]);

  // Door set INSIDE a real opening. Jambs span the wall thickness; continuous
  // wainscot/baseboards stop at the opening rather than crossing the door.
  for (const z of [-3.34, -1.66]) {
    box([6.04, 2.15, z], [.38, 4.3, .12], m.trim);
    box([5.845, 2.18, z], [.065, 4.36, .15], m.wood, .009);
    box([6.065, 2.11, z + (z < -2.5 ? .073 : -.073)], [.08, 4.18, .025], m.windowShadow);
  }
  box([6.04, 4.24, -2.5], [.38, .12, 1.8], m.trim);
  box([5.845, 4.3, -2.5], [.065, .15, 1.96], m.wood, .009);
  box([6.04, .035, -2.5], [.48, .035, 1.68], m.frame);
  // Closed door leaf with a genuine glazed opening, rails and stiles.
  for (const z of [-3.12, -1.88]) box([6.11, 2.11, z], [.085, 4.12, .28], m.wood, .006);
  box([6.11, 1.22, -2.5], [.085, 2.34, .99], m.wood, .006);
  box([6.11, 4.035, -2.5], [.085, .27, .99], m.wood, .006);
  add(new PlaneGeometry(.96, 1.49), m.blue, [6.115, 3.15, -2.5], [0, -Math.PI / 2, 0]);
  for (const z of [-3, -2]) box([6.05, 3.15, z], [.055, 1.62, .045], m.trim);
  for (const y of [2.38, 3.92]) box([6.05, y, -2.5], [.055, .055, 1.05], m.trim);
  box([6.049, 1.15, -2.5], [.025, 1.84, .99], m.trim);
  box([6.029, 1.15, -2.5], [.015, 1.68, .83], m.wood);
  box([6.029, 1.92, -1.94], [.04, .27, .085], m.frame, .007);
  rod([6.015, 1.97, -1.94], [5.925, 1.97, -1.94], .025, m.dark);
  rod([5.925, 1.97, -1.94], [5.925, 1.97, -2.18], .025, m.dark);
  for (const y of [.55, 2.08, 3.6]) cylinder([6.03, y, -3.23], .027, .027, .15, m.frame);
  // Shallow, static corridor recess visible through the door glass (no room,
  // renderer or extra light): separate depth makes the glazing read as glass.
  box([7.25, 2.15, -2.5], [.06, 4.3, 2.8], m.plaster);
  box([7.21, .72, -2.5], [.02, 1.44, 2.8], m.sage);
  box([7.185, 1.49, -2.5], [.025, .065, 2.8], m.cream);

  // Bookcase and teacher's podium are static, not extra student seats.
  const shelfX = -4.7;
  box([shelfX, 0.84, -3.97], [1.22, 1.68, 0.07], m.trim);
  for (const x of [shelfX - 0.61, shelfX + 0.61]) box([x, 0.84, -3.67], [0.07, 1.68, 0.68], m.wood);
  for (const y of [0.06, 0.58, 1.1, 1.65]) box([shelfX, y, -3.67], [1.3, 0.07, 0.68], m.wood);
  authoredProp(props.books, [shelfX - .19, .615, -3.58], [.62, .4, .34], [0, .08, 0]);
  authoredProp(props.books, [shelfX + .1, 1.135, -3.62], [.72, .35, .36], [0, Math.PI - .06, 0]);
  box([0.2, 0.66, -1.98], [2.28, 1.3, 0.99], m.wood, 0.022);
  box([0.2, 1.36, -1.98], [2.44, 0.115, 1.14], m.wood, 0.025);
  box([0.2, 0.12, -1.44], [2.33, 0.12, 0.07], m.trim, 0.012);
  authoredProp(props.books, [.31, 1.42, -2.04], [.31, .47, .32], [0, .15, Math.PI / 2]);
  cylinder([-0.42, 1.53, -1.9], 0.068, 0.06, 0.22, m.paper);
  for (let i = 0; i < 5; i++) rod([-0.45 + i * 0.017, 1.5, -1.9], [-0.49 + i * 0.035, 1.78 + (i % 2) * 0.06, -1.9], 0.009, m.trim);

  // Real CC0 authored geometry (Ethan Place / Poly Haven), not placeholder boxes.
  // The shared vertex-color material batches all six sets into a single draw.
  function furniture(source: Group, position: Point, size: Point, turn = 0) {
    source.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(source), dimensions = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
    source.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      geometry.translate(-center.x, -bounds.min.y, -center.z);
      geometry.scale(size[0] / dimensions.x, size[1] / dimensions.y, size[2] / dimensions.z);
      geometry.rotateY(turn);
      geometry.deleteAttribute("tangent");
      const points = geometry.getAttribute("position"), colors = geometry.getAttribute("color");
      const uv = new Float32BufferAttribute(new Float32Array(points.count * 2), 2);
      const [tx, ty, tw, th] = surfaceAtlas.regions.wood;
      for (let i = 0; i < points.count; i++) {
        const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i);
        if (r > g * 1.18 && r > b * 1.45) {
          uv.setXY(i, (tx + (.5 + points.getX(i) / size[0]) * tw) / surfaceAtlas.width, 1 - (ty + (.5 + points.getZ(i) / size[2]) * th) / surfaceAtlas.height);
          colors.setXYZ(i, .98, .98, .98);
        } else {
          uv.setXY(i, 12 / surfaceAtlas.width, 1 - 760 / surfaceAtlas.height);
          colors.setXYZ(i, r * .68 + .32 * .30, g * .68 + .32 * .34, b * .68 + .32 * .29);
        }
      }
      geometry.setAttribute("uv", uv);
      add(geometry, m.furniture, position);
    });
  }
  for (const x of YOUTH_RENDERING.deskColumns) for (const z of YOUTH_RENDERING.deskRows) {
    furniture(desk, [x, .022, z], [1.58, 1.2, .96], Math.PI);
    furniture(chair, [x, .022, z + .77], [.86, 1.4, .86], Math.PI);
  }

  function authoredProp(source: Group, position: Point, size: Point, rotation: Point = [0, 0, 0], anchor: "bounds" | "root" = "bounds") {
    source.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(source), dimensions = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
    const geometries: BufferGeometry[] = [];
    source.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      if (anchor === "bounds") geometry.translate(-center.x, -bounds.min.y, -center.z);
      geometry.scale(size[0] / dimensions.x, size[1] / dimensions.y, size[2] / dimensions.z);
      geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...rotation)));
      geometry.deleteAttribute("tangent");
      geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array(geometry.getAttribute("position").count * 2), 2));
      geometries.push(geometry);
    });
    // Reground the rotated books rather than sinking half the stack in a desk.
    const transformed = new Box3();
    for (const g of geometries) { g.computeBoundingBox(); transformed.union(g.boundingBox!); }
    const mid = transformed.getCenter(new Vector3());
    for (const g of geometries) {
      if (anchor === "bounds") g.translate(-mid.x, -transformed.min.y, -mid.z);
      add(g, m.props, position);
    }
  }
  // Isa Lousberg CC0 foliage: distinct curved leaves, not repeated triangles.
  cylinder([-4.68, 1.84, -3.65], .17, .12, .3, m.paper, [0, 0, 0], 20);
  cylinder([-4.68, 1.995, -3.65], .153, .15, .01, m.soil);
  // The plant's authored origin is its root, not the bottom of its hanging vine.
  authoredProp(props.pothos, [-4.68, 1.99, -3.65], [.7, .57, .61], [0, 1.15, 0], "root");
  cylinder([-4.65, .24, 2.5], .29, .21, .48, m.paper, [0, 0, 0], 24);
  cylinder([-4.65, .485, 2.5], .27, .26, .012, m.soil);
  authoredProp(props.monstera, [-4.65, .48, 2.5], [1.38, 1.28, 1.3], [0, .3, 0], "root");

  for (const x of [-2.85, 2.85]) for (const z of [-1.45, 4.4]) {
    box([x, 5.3, z], [3.25, 0.12, 0.38], m.cream, 0.025);
    box([x, 5.222, z], [3.08, 0.04, 0.29], m.light, 0.012);
  }

  // Fixed articulated bracket: slim rectangular housings, visible pivots, dark
  // joint caps and mounting plate. No animation, physics, IK or hidden tower.
  box([-1.65, 5.35, 0], [.67, .1, .6], m.cream, .025);
  cylinder([-1.65, 5.13, 0], .082, .082, .36, m.frame);
  function armLink(a: Point, b: Point, width: number) {
    const start = new Vector3(...a), end = new Vector3(...b), mid = start.clone().add(end).multiplyScalar(.5);
    const geometry = new RoundedBoxGeometry(width, start.distanceTo(end), .19, 1, .025);
    geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), end.clone().sub(start).normalize()));
    add(geometry, m.cream, mid.toArray() as [number, number, number]);
    rod([a[0], a[1] - .065, a[2] - .02], [b[0], b[1] - .065, b[2] - .02], .019, m.frame);
  }
  armLink([-1.65, 4.99, 0], [-1.72, 4.86, -1.3], .2);
  armLink([-1.72, 4.86, -1.3], [-2.45, 4.87, -2.72], .17);
  for (const [x, y, z] of [[-1.65, 4.99, 0], [-1.72, 4.86, -1.3], [-2.45, 4.87, -2.72]]) {
    cylinder([x, y, z], .132, .132, .245, m.cream, [Math.PI / 2, 0, 0], 16);
    cylinder([x, y, z + .13], .084, .084, .019, m.frame, [Math.PI / 2, 0, 0], 16);
    cylinder([x, y, z + .144], .033, .033, .013, m.dark, [Math.PI / 2, 0, 0], 8);
  }
  cylinder([-2.45, 4.5, -2.72], .078, .078, .74, m.frame);
  panel([-2.45, 3.9, -2.64], .84, .68, .13, .07, m.frame);
  const screen = YOUTH_RENDERING.screen;
  // Adapt the original demo monitor's layered shell to this ceiling-mounted
  // screen: shallow rear case, satin alloy edge, recessed bezel and glass.
  // Each layer joins an existing material batch; no extra model loader or pass.
  box([screen.center[0], screen.center[1], -2.625], [screen.frameWidth - .07, screen.frameHeight - .07, .16], m.cream, .012);
  panel([screen.center[0], screen.center[1], -2.542], screen.frameWidth, screen.frameHeight, .047, .052, m.frame);
  panel([screen.center[0], screen.center[1], -2.506], screen.frameWidth - .055, screen.frameHeight - .055, .028, .043, m.dark);
  box([screen.center[0], screen.center[1], -2.483], [screen.width + .018, screen.height + .018, .008], m.displayGlass);
  // A fine lower lip and understated status light keep the housing readable
  // at classroom distance without a broad plastic chin or bright fake glare.
  box([screen.center[0], screen.center[1] - screen.frameHeight / 2 + .024, -2.485], [screen.frameWidth - .17, .008, .008], m.frame);
  cylinder([screen.center[0] + screen.width / 2 - .1, screen.center[1] - screen.frameHeight / 2 + .037, -2.481], .008, .008, .004, m.leafLight, [Math.PI / 2, 0, 0], 8);
  // Vented back and a flush joint plate are visible in the room view; these
  // are static geometry in existing batches rather than animated hardware.
  for (let i = 0; i < 6; i++) {
    box([screen.center[0] - .34 + i * .135, screen.center[1] + .55, -2.713], [.072, .008, .004], m.dark);
  }
  for (const x of [-.31, .31]) for (const y of [-.22, .22]) {
    cylinder([screen.center[0] + x, screen.center[1] + y, -2.722], .018, .018, .008, m.dark, [Math.PI / 2, 0, 0], 8);
  }

  // One draw per material, not one per chair leg / plank / panel.
  for (const [mat, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) throw new Error("Unable to batch static classroom geometry");
    const mesh = new Mesh(merged, mat);
    mesh.castShadow = mat !== m.plaster && mat !== m.ceiling && mat !== m.blue && mat !== m.light && mat !== m.sky;
    mesh.receiveShadow = mat !== m.light;
    mesh.userData.campusOutline = new Set<CampusMaterial>([m.furniture, m.frame, m.wood, m.trim, m.cream, m.paper, m.sageEdge, m.rubber, m.metal]).has(mat);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    room.add(mesh);
  }
  room.userData.deskCount = YOUTH_RENDERING.deskColumns.length * YOUTH_RENDERING.deskRows.length;
  room.userData.assetTriangles = room.children.reduce((sum, object) => sum + (object instanceof Mesh ? object.geometry.getAttribute("position").count / 3 : 0), 0);
  room.userData.assetSource = "Poly Haven / Ethan Place / CC0-1.0";
  return {
    room,
    dispose() {
      room.traverse((object) => { if (object instanceof Mesh) object.geometry.dispose(); });
      ownedTextures.forEach((texture) => texture.dispose());
      new Set([...batches.keys(), ...Object.values(m)]).forEach((mat) => mat.dispose());
    },
  };
}
