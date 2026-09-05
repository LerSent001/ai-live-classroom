export type EntrancePhase = "loading" | "entering" | "ready" | "failed";
type Point = readonly [number, number, number];

export const MAX_VIEW_YAW = Math.PI / 12;
export const ENTRANCE_SECONDS = 2.8;
export const REVEAL_SECONDS = 0.35;

export function stageOffset(width: number): number {
  if (width < 700) return 0;
  if (width < 1100) return -2.15;
  return -1.35;
}

export function dragViewYaw(yaw: number, deltaX: number, viewportWidth: number): number {
  return Math.max(-MAX_VIEW_YAW, Math.min(MAX_VIEW_YAW,
    yaw + (deltaX / viewportWidth) * MAX_VIEW_YAW * 2,
  ));
}

export function classroomPose(width: number, height: number, active: boolean) {
  const narrow = width < 700;
  if (active) {
    const x = stageOffset(width) + (narrow ? 0 : 0.55);
    return {
      position: [x, narrow ? 3.4 : 4.2, narrow ? 4.1 : 1.65] as Point,
      lookAt: [x, narrow ? 3.05 : 4.17, -1.15] as Point,
      fov: 46,
    };
  }
  const portraitFov = 2 * Math.atan(Math.tan(40 * Math.PI / 360) / (width / height)) * 180 / Math.PI;
  return {
    position: (narrow ? [4.8, 6.4, 24.5] : [3.1, 4.9, 15.8]) as Point,
    lookAt: (narrow ? [-3.4, 3.1, -2.3] : [-0.8, 2.8, -2.3]) as Point,
    fov: narrow ? Math.max(46, portraitFov) : 46,
  };
}

export function entrancePose(width: number, height: number, progress: number) {
  const end = classroomPose(width, height, false);
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * t * (t * (t * 6 - 15) + 10);
  const remaining = 1 - eased;
  const narrow = width < 700;
  const arc = Math.sin(eased * Math.PI);
  return {
    position: [
      end.position[0] - (narrow ? 4.2 : 4.4) * remaining - arc * 0.65,
      end.position[1] + (narrow ? 0.6 : 1.1) * remaining + arc * 0.22,
      end.position[2] + (narrow ? 3.6 : 3.4) * remaining,
    ] as Point,
    lookAt: [end.lookAt[0] - 1.8 * remaining, end.lookAt[1] + 0.3 * remaining, end.lookAt[2]] as Point,
    fov: end.fov - (narrow ? 0 : 4) * remaining,
  };
}
