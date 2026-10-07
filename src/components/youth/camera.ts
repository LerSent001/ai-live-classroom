import { YOUTH_RENDERING } from "@/lib/youth-classroom";
export type YouthPoint = readonly [number, number, number];
export type YouthPose = { position: YouthPoint; lookAt: YouthPoint; fov: number };
export function youthCameraPose(width: number, height: number, screen: boolean): YouthPose {
  const narrow = width < 700;
  if (screen) {
    const display = YOUTH_RENDERING.screen;
    const [x, y, z] = display.center;
    const fov = 42;
    const preferredFrameWidth = height * display.frameWidth * .67 / display.height;
    const panelLeft = width - 24 - 320;
    const availableRight = panelLeft - 20;
    const frameWidth = narrow ? Math.min(preferredFrameWidth, width * .86)
      : Math.min(preferredFrameWidth, availableRight - 24);
    const frameCenter = narrow ? width / 2 : (24 + availableRight) / 2;
    const worldUnitsPerPixel = display.frameWidth / frameWidth;
    const viewHeight = height * worldUnitsPerPixel;
    const distance = viewHeight / (2 * Math.tan(fov * Math.PI / 360));
    const lookX = x + (width / 2 - frameCenter) * worldUnitsPerPixel;
    return { position: [lookX, y, z + distance], lookAt: [lookX, y, z], fov };
  }
  return {
    position: narrow ? [0.7, 3.45, 10.8] : [0.7, 3.12, 7.6],
    lookAt: narrow ? [-0.7, 2.3, -2.8] : [-0.25, 1.96, -3.7],
    fov: narrow ? 58 : 48,
  };
}
export function smoothCameraProgress(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Reuses the original demo's quintic easing and gentle arc, scaled to this room.
// The endpoint is exactly the existing lobby/TV pose: no permanent layout change.
export function youthEntrancePose(width: number, height: number, progress: number, screen = false): YouthPose {
  const end = youthCameraPose(width, height, screen);
  const t = smoothCameraProgress(progress);
  const remaining = 1 - t;
  const arc = progress <= 0 || progress >= 1 ? 0 : Math.sin(t * Math.PI);
  const narrow = width < 700;
  return {
    position: [end.position[0] - .65 * remaining - .12 * arc,
      end.position[1] + (narrow ? .5 : .85) * remaining + .06 * arc,
      end.position[2] + (narrow ? .65 : 1.15) * remaining],
    lookAt: [end.lookAt[0] - .25 * remaining, end.lookAt[1] + .12 * remaining, end.lookAt[2]],
    fov: end.fov - (narrow ? 0 : 2) * remaining,
  };
}
