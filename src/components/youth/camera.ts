import { YOUTH_RENDERING } from "@/lib/youth-classroom";
export type YouthPoint = readonly [number, number, number];
export type YouthPose = { position: YouthPoint; lookAt: YouthPoint; fov: number };
export function youthCameraPose(width: number, height: number, screen: boolean): YouthPose {
  const narrow = width <= 700;
  if (screen) {
    const display = YOUTH_RENDERING.screen;
    const [x, y, z] = display.center;
    const fov = 42;
    // Center the TV above the bottom guide, reserving room for its controls.
    // Short landscape windows use a compact dock instead of a side panel.
    const short = height <= 600;
    const top = narrow ? 136 : 72;
    const bottom = narrow ? 282 : short ? 152 : 208;
    const availableHeight = Math.max(80, height - top - bottom);
    const frameWidth = Math.min(availableHeight * display.frameWidth / display.frameHeight, width * .86);
    const frameCenterY = top + availableHeight / 2;
    const worldUnitsPerPixel = display.frameWidth / frameWidth;
    const viewHeight = height * worldUnitsPerPixel;
    const distance = viewHeight / (2 * Math.tan(fov * Math.PI / 360));
    const lookY = y + (frameCenterY - height / 2) * worldUnitsPerPixel;
    return { position: [x, lookY, z + distance], lookAt: [x, lookY, z], fov };
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

// First arrival is a locked composition; the room reveal provides the motion.
// Lesson transitions still use the separate room-to-screen camera interpolation.
export function youthEntrancePose(width: number, height: number, progress: number, screen = false): YouthPose {
  void progress;
  return youthCameraPose(width, height, screen);
}
