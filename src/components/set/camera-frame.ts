import type { PerspectiveCamera, Vector3 } from "three";

// Run before Drei's reflection/HTML callbacks (priority 0), then the composer (1).
export const CAMERA_FRAME_PRIORITY = -1;

export function commitCameraView(camera: PerspectiveCamera, lookAt: Vector3): void {
  camera.lookAt(lookAt);
  camera.updateProjectionMatrix();
  // lookAt updates the quaternion AFTER computing matrixWorld. Offscreen passes
  // read matrixWorld before the main render can refresh it, so publish both the
  // new view matrix and its inverse in this same frame.
  camera.updateMatrixWorld();
}
