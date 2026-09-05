import { useMemo } from "react";
import {
  CanvasTexture,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  colorSpace: typeof SRGBColorSpace | typeof NoColorSpace = SRGBColorSpace,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("The classroom needs a 2D canvas to create its materials.");
  draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makePlaster() {
  const size = 512;
  const random = mulberry32(207);
  const layers = [4, 16, 64, 256].map((cells) => ({
    cells,
    values: Float32Array.from({ length: cells * cells }, () => random() - 0.5),
  }));
  const noise = (layer: (typeof layers)[number], x: number, y: number) => {
    const gx = (x / size) * layer.cells;
    const gy = (y / size) * layer.cells;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const dx = gx - ix;
    const dy = gy - iy;
    const sx = dx * dx * (3 - 2 * dx);
    const sy = dy * dy * (3 - 2 * dy);
    const value = (xx: number, yy: number) =>
      layer.values[(yy % layer.cells) * layer.cells + (xx % layer.cells)];
    const top = value(ix, iy) * (1 - sx) + value(ix + 1, iy) * sx;
    const bottom = value(ix, iy + 1) * (1 - sx) + value(ix + 1, iy + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
  const albedo = new Uint8ClampedArray(size * size * 4);
  const relief = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const broad = noise(layers[0], x, y);
      const plaster = noise(layers[1], x, y);
      const grit = noise(layers[2], x, y);
      const grain = noise(layers[3], x, y);
      const shade = broad * 16 + plaster * 10 + grit * 7 + grain * 4;
      const height = 128 + plaster * 12 + grit * 68 + grain * 44;
      const matte = 211 + broad * 20 + grit * 28;
      const index = (y * size + x) * 4;
      albedo.set([233 + shade, 229 + shade, 217 + shade, 255], index);
      relief.set([height, height, height, 255], index);
      roughness.set([matte, matte, matte, 255], index);
    }
  }
  const fromPixels = (
    pixels: Uint8ClampedArray,
    colorSpace: typeof SRGBColorSpace | typeof NoColorSpace,
  ) =>
    makeTexture(
      size,
      size,
      (ctx) => {
        const pixelsOnCanvas = ctx.createImageData(size, size);
        pixelsOnCanvas.data.set(pixels);
        ctx.putImageData(pixelsOnCanvas, 0, 0);
      },
      colorSpace,
    );
  return {
    map: fromPixels(albedo, SRGBColorSpace),
    bumpMap: fromPixels(relief, NoColorSpace),
    roughnessMap: fromPixels(roughness, NoColorSpace),
  };
}

function repeatSurface(
  plaster: ReturnType<typeof makePlaster>,
  width: number,
  height: number,
) {
  const repeat = (source: CanvasTexture) => {
    const texture = source.clone();
    texture.wrapS = texture.wrapT = RepeatWrapping;
    // Keep the material's grain at the same scale on each wall.
    texture.repeat.set(width / 4, height / 4);
    texture.needsUpdate = true;
    return texture;
  };
  return {
    map: repeat(plaster.map),
    bumpMap: repeat(plaster.bumpMap),
    roughnessMap: repeat(plaster.roughnessMap),
  };
}

function drawAcademyWall(ctx: CanvasRenderingContext2D, plaster: CanvasTexture) {
  const random = mulberry32(304);
  ctx.fillStyle = "#d8c27e";
  ctx.fillRect(0, 0, 512, 512);
  // Irregular painted patches evoke the academy walls without flattening the plaster.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = (col + 0.5) * (512 / 3) + (random() - 0.5) * 32;
      const cy = (row + 0.5) * (512 / 3) + (random() - 0.5) * 32;
      const vertices = Array.from({ length: 7 }, (_, i) => {
        const angle = ((i + random() * 0.3) / 7) * Math.PI * 2;
        const radius = 64 + random() * 35;
        return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
      });
      ctx.fillStyle = `rgba(142, 116, 49, ${0.25 + random() * 0.13})`;
      // Wrap complete patches at tile edges so large walls have no visible UV seams.
      for (const dx of [-512, 0, 512]) {
        for (const dy of [-512, 0, 512]) {
          ctx.beginPath();
          ctx.moveTo(vertices[6].x * 0.15 + vertices[0].x * 0.85 + dx, vertices[6].y * 0.15 + vertices[0].y * 0.85 + dy);
          vertices.forEach((point, i) => {
            const previous = vertices[(i + vertices.length - 1) % vertices.length];
            const next = vertices[(i + 1) % vertices.length];
            ctx.lineTo(previous.x * 0.15 + point.x * 0.85 + dx, previous.y * 0.15 + point.y * 0.85 + dy);
            ctx.quadraticCurveTo(point.x + dx, point.y + dy, next.x * 0.15 + point.x * 0.85 + dx, next.y * 0.15 + point.y * 0.85 + dy);
          });
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(plaster.image, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

function drawSteel(ctx: CanvasRenderingContext2D) {
  const random = mulberry32(95);
  const wash = ctx.createLinearGradient(0, 0, 512, 512);
  wash.addColorStop(0, "#bcc2b6");
  wash.addColorStop(0.5, "#919b94");
  wash.addColorStop(1, "#b0b5a8");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(39, 47, 40, ${random() * 0.08})`;
    ctx.fillRect(random() * 512, random() * 512, 2 + random() * 90, 1);
  }
  for (let i = 0; i < 34; i++) {
    const x = 12 + random() * 488;
    const y = random() * 512;
    ctx.strokeStyle = i % 3 ? "rgba(229, 226, 201, .22)" : "rgba(66, 58, 40, .16)";
    ctx.lineWidth = 1 + random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3 + random() * 24, y + 20 + random() * 64);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(41, 38, 27, .26)";
  ctx.lineWidth = 9;
  ctx.strokeRect(6, 6, 500, 500);
  ctx.strokeStyle = "rgba(243, 234, 205, .55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(13, 13, 486, 486);
}

function drawWainscot(ctx: CanvasRenderingContext2D) {
  const random = mulberry32(72);
  ctx.fillStyle = "#806448";
  ctx.fillRect(0, 0, 512, 512);
  for (let board = 0; board < 8; board++) {
    const x = board * 64;
    ctx.fillStyle = ["#8b704f", "#937858", "#826847", "#967655"][board % 4];
    ctx.fillRect(x + 3, 0, 59, 512);
    for (let grain = 0; grain < 20; grain++) {
      const gx = x + 4 + random() * 56;
      ctx.strokeStyle = `rgba(40, 30, 23, ${0.06 + random() * 0.16})`;
      ctx.lineWidth = 0.5 + random() * 1.5;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx - 6, 170, gx + 5, 340, gx, 512);
      ctx.stroke();
    }
    ctx.fillStyle = "#42392c";
    ctx.fillRect(x, 0, 2, 512);
    ctx.fillStyle = "rgba(224, 198, 151, .35)";
    ctx.fillRect(x + 3, 0, 1, 512);
  }
}

function drawFloor(ctx: CanvasRenderingContext2D) {
  const random = mulberry32(11);
  const colors = ["#c4a16e", "#caae81", "#d3b68a", "#b99766", "#cfad79"];
  ctx.fillStyle = "#685137";
  ctx.fillRect(0, 0, 1024, 1024);
  for (let row = 0; row < 12; row++) {
    for (let col = -1; col < 4; col++) {
      const x = col * 342 + (row % 3) * 112;
      const y = row * 86;
      ctx.fillStyle = colors[Math.floor(random() * colors.length)];
      ctx.fillRect(x + 1, y + 1, 340, 84);
      for (let grain = 0; grain < 14; grain++) {
        ctx.strokeStyle = `rgba(84, 55, 27, ${0.06 + random() * 0.13})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const gy = y + 7 + random() * 70;
        ctx.moveTo(x + 10, gy);
        ctx.bezierCurveTo(x + 100, gy - 4, x + 240, gy + 4, x + 326, gy);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255, 250, 224, .38)";
      ctx.fillRect(x + 1, y + 1, 340, 1);
    }
  }
}

function drawWood(ctx: CanvasRenderingContext2D) {
  const random = mulberry32(41);
  ctx.fillStyle = "#c6a16c";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 105; i++) {
    const y = random() * 512;
    ctx.strokeStyle = `rgba(81, 48, 24, ${0.06 + random() * 0.19})`;
    ctx.lineWidth = 1 + random();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y - 12, 340, y + 9, 512, y + 2);
    ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = "rgba(240, 217, 169, .35)";
    ctx.fillRect(random() * 490, i % 2 ? 3 : 506, 4 + random() * 18, 2);
  }
}

function drawChalkboard(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#294e3c";
  ctx.fillRect(0, 0, 1536, 640);
  const random = mulberry32(51);
  for (let i = 0; i < 48; i++) {
    ctx.fillStyle = "rgba(227, 247, 226, .018)";
    ctx.fillRect(random() * 1400, random() * 600, 80 + random() * 120, 14);
  }
  const white = "#ecf1db";
  const yellow = "#f6dda0";
  const pink = "#f0c0bb";
  const blue = "#bcdedc";
  const chalk = (
    text: string,
    x: number,
    y: number,
    size: number,
    color = white,
    angle = 0,
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `${size}px Chalkduster, "Segoe Print", "Comic Sans MS", cursive`;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.86;
    ctx.fillText(text, 0, 0);
    ctx.globalAlpha = 0.16;
    ctx.fillText(text, 0.8, -0.5);
    ctx.restore();
  };
  const line = (
    points: readonly (readonly [number, number])[],
    color = white,
    width = 2.5,
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach(([x, y], i) =>
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
    );
    ctx.stroke();
  };
  const star = (x: number, y: number, r: number, color: string) => {
    const points: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const radius = i % 2 === 0 ? r : r * 0.43;
      points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
    }
    line(points, color, 2);
  };

  // Keep the main equations above and beside the TV's projected footprint.
  chalk("F = ma", 86, 116, 60, yellow, -0.015);
  line(
    [
      [79, 137],
      [342, 141],
      [360, 130],
    ],
    yellow,
    2,
  );
  chalk("E = mc²", 554, 128, 72, white, 0.012);
  line(
    [
      [548, 158],
      [924, 158],
    ],
    pink,
    3,
  );
  chalk("a² + b² = c²", 1035, 104, 42, yellow);
  chalk("π ≈ 3.14159", 563, 210, 27, blue);

  // Pendulum: length l, angle theta and a downward gravitational force.
  line(
    [
      [99, 204],
      [341, 204],
    ],
    white,
    4,
  );
  for (let x = 105; x < 340; x += 18)
    line(
      [
        [x, 205],
        [x + 13, 191],
      ],
      white,
      1.5,
    );
  ctx.setLineDash([6, 7]);
  line(
    [
      [186, 207],
      [186, 383],
    ],
    blue,
    1.5,
  );
  ctx.setLineDash([]);
  line(
    [
      [186, 207],
      [277, 360],
    ],
    white,
    3,
  );
  ctx.strokeStyle = yellow;
  ctx.beginPath();
  ctx.arc(186, 207, 57, Math.PI / 3, Math.PI / 2);
  ctx.stroke();
  chalk("θ", 203, 286, 26, yellow);
  chalk("l", 246, 288, 30);
  ctx.fillStyle = pink;
  ctx.beginPath();
  ctx.arc(277, 360, 16, 0, Math.PI * 2);
  ctx.fill();
  line(
    [
      [277, 379],
      [277, 428],
      [269, 416],
    ],
    yellow,
  );
  line(
    [
      [277, 428],
      [285, 416],
    ],
    yellow,
  );
  chalk("mg", 299, 416, 25, yellow);
  chalk("T = 2π√(l/g)", 77, 490, 34, blue);
  chalk("θ ≈ 0", 118, 532, 23, white);

  // A right triangle with its corresponding universal notation.
  line(
    [
      [1120, 159],
      [1120, 321],
      [1373, 321],
      [1120, 159],
    ],
    blue,
    3,
  );
  line(
    [
      [1120, 301],
      [1140, 301],
      [1140, 321],
    ],
    white,
    2,
  );
  chalk("a", 1084, 256, 27);
  chalk("b", 1240, 354, 27);
  chalk("c", 1284, 235, 27, pink);
  chalk("∫₀¹ x² dx = ⅓", 1047, 447, 38, white);
  chalk("e", 1102, 529, 46, yellow);
  chalk("iπ", 1134, 500, 27, yellow);
  chalk("+ 1 = 0", 1190, 529, 43, yellow);

  // A sine sketch, orbit doodle and stars fill the margins like a class chalk mural.
  ctx.save();
  ctx.translate(742, 291);
  line(
    [
      [0, 60],
      [230, 60],
      [220, 54],
    ],
    blue,
    1.8,
  );
  line(
    [
      [20, 115],
      [20, -5],
      [14, 5],
    ],
    blue,
    1.8,
  );
  const wave: [number, number][] = [];
  for (let x = 20; x <= 222; x += 3)
    wave.push([x, 60 - Math.sin((x - 20) / 29) * 38]);
  line(wave, pink, 2.5);
  chalk("y = sin x", 70, 130, 24);
  ctx.restore();
  ctx.save();
  ctx.translate(823, 517);
  ctx.rotate(-0.32);
  ctx.strokeStyle = blue;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, 57, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  star(442, 65, 18, pink);
  star(1000, 211, 14, yellow);
  star(957, 533, 17, pink);
  star(1368, 573, 12, blue);
  star(91, 579, 12, yellow);
  line(
    [
      [365, 548],
      [403, 528],
      [443, 548],
      [403, 571],
      [365, 548],
      [365, 586],
      [403, 609],
      [443, 586],
      [443, 548],
    ],
    blue,
    2,
  );
  line(
    [
      [403, 571],
      [403, 609],
    ],
    blue,
    2,
  );
}

function drawClock(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#fffdf0";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#507e7c";
  for (let tick = 0; tick < 60; tick++) {
    const angle = (tick / 60) * Math.PI * 2;
    const r = tick % 5 === 0 ? 105 : 115;
    ctx.lineWidth = tick % 5 === 0 ? 4 : 1.5;
    ctx.beginPath();
    ctx.moveTo(128 + Math.sin(angle) * r, 128 - Math.cos(angle) * r);
    ctx.lineTo(128 + Math.sin(angle) * 121, 128 - Math.cos(angle) * 121);
    ctx.stroke();
  }
  ctx.fillStyle = "#507e7c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "500 28px sans-serif";
  for (let hour = 1; hour <= 12; hour++) {
    const angle = (hour / 12) * Math.PI * 2;
    ctx.fillText(
      String(hour),
      128 + Math.sin(angle) * 86,
      128 - Math.cos(angle) * 86,
    );
  }
}

function drawNotice(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#f9eed4";
  ctx.fillRect(0, 0, 768, 512);
  ctx.fillStyle = "#658b85";
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText("CLASS NOTES", 42, 56);
  for (const [x, y, color, title] of [
    [38, 90, "#fffdf5", "01 / SCIENCE"],
    [292, 90, "#edf6eb", "02 / MATH"],
    [475, 256, "#fce1dd", "03 / IDEAS"],
  ] as const) {
    ctx.fillStyle = "rgba(120, 102, 64, .1)";
    ctx.fillRect(x + 4, y + 5, 216, 208);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 216, 208);
    ctx.fillStyle = "#6b8f86";
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(title, x + 19, y + 38);
    ctx.strokeStyle = "#c4d6cb";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 20, y + 65 + i * 23);
      ctx.lineTo(x + 190, y + 65 + i * 23);
      ctx.stroke();
    }
    ctx.fillStyle = "#dba799";
    ctx.beginPath();
    ctx.arc(x + 108, y + 8, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function useClassroomTextures() {
  return useMemo(() => {
    const plaster = makePlaster();
    const academy = {
      ...plaster,
      map: makeTexture(512, 512, (ctx) => drawAcademyWall(ctx, plaster.map)),
    };
    const wainscot = { ...plaster, map: makeTexture(512, 512, drawWainscot) };
    const floorMap = makeTexture(1024, 1024, drawFloor);
    floorMap.wrapS = floorMap.wrapT = RepeatWrapping;
    floorMap.repeat.set(2.5, 4);
    return {
      wallBack: repeatSurface(academy, 22, 10),
      wallSide: repeatSurface(academy, 15, 10),
      paintBack: repeatSurface(wainscot, 22, 2.55),
      paintSide: repeatSurface(wainscot, 15, 2.55),
      ceiling: repeatSurface(plaster, 22, 32),
      steel: { ...plaster, map: makeTexture(512, 512, drawSteel) },
      floorMap,
      wood: makeTexture(512, 512, drawWood),
      chalkboard: makeTexture(1536, 640, drawChalkboard),
      clockFace: makeTexture(256, 256, drawClock),
      notice: makeTexture(768, 512, drawNotice),
    };
  }, []);
}
export type ClassroomTextures = ReturnType<typeof useClassroomTextures>;
