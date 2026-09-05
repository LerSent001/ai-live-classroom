import type { ClassroomSnapshot } from "@/lib/classroom-types";

export function lessonIsBusy(snapshot: Pick<ClassroomSnapshot, "production" | "scenes">): boolean {
  return snapshot.production.kind === "preparing" || snapshot.production.kind === "teaching" ||
    snapshot.scenes.some((scene) => scene.kind === "generating" || scene.kind === "playing");
}

export function lessonHasFailed(snapshot: Pick<ClassroomSnapshot, "production" | "scenes">): boolean {
  return (
    (snapshot.production.kind === "draining" &&
      (snapshot.production.reason === "planning-failed" || snapshot.production.reason === "render-failed")) ||
    snapshot.scenes.some((scene) =>
      scene.kind === "rejected" ||
      ((scene.kind === "ready" || scene.kind === "playing" || scene.kind === "played") && scene.segment.kind === "skipped"),
    )
  );
}
