import type {
  ClassroomSessionId,
  ClassroomSnapshot,
  CourseDocument,
  CoursePageMedia,
  CourseSection,
  LessonStepId,
  SceneView,
} from "@/lib/classroom-types";

function sectionId(sessionId: ClassroomSessionId): string {
  return `course-section:${sessionId}`;
}

function pageId(sessionId: ClassroomSessionId, stepId: LessonStepId): string {
  return `course-page:${sessionId}:${stepId}`;
}

function mediaForStep(scenes: readonly SceneView[], stepId: LessonStepId): CoursePageMedia {
  const scene = scenes.find((candidate) =>
    (candidate.kind === "rejected" ? candidate.purpose : candidate.plan.purpose).stepId === stepId,
  );
  if (!scene || scene.kind === "generating") {
    return { sceneId: scene?.id ?? null, status: "pending", videoUrl: null };
  }
  if (scene.kind === "rejected") {
    return { sceneId: scene.id, status: "failed", videoUrl: null };
  }
  if (scene.segment.kind === "skipped") {
    return { sceneId: scene.id, status: "failed", videoUrl: null };
  }
  return { sceneId: scene.id, status: "ready", videoUrl: scene.segment.videoUrl };
}

export function courseSectionFromSnapshot(snapshot: ClassroomSnapshot): CourseSection | null {
  const lesson = snapshot.lesson;
  if (!lesson) return null;
  const id = sectionId(snapshot.id);
  return {
    id,
    sessionId: snapshot.id,
    kind: lesson.courseRole,
    topic: lesson.topic,
    title: lesson.title,
    bigQuestion: lesson.bigQuestion,
    durationSeconds: lesson.durationSeconds,
    pages: lesson.steps.map((step) => ({
      id: pageId(snapshot.id, step.id),
      sectionId: id,
      stepId: step.id,
      position: step.position,
      role: step.role,
      title: step.title,
      teachingGoal: step.teachingGoal,
      narration: step.narration,
      concept: step.concept,
      summary: step.summary,
      visualAction: step.visualAction,
      startSeconds: (step.position - 1) * snapshot.policy.clipDurationSeconds,
      endSeconds: step.position * snapshot.policy.clipDurationSeconds,
      media: mediaForStep(snapshot.scenes, step.id),
    })),
  };
}

export function courseDocumentFromSnapshots(input: {
  id: ClassroomSessionId;
  snapshots: readonly ClassroomSnapshot[];
  activeSessionId: ClassroomSessionId;
}): CourseDocument {
  const primary = input.snapshots[0];
  if (!primary) throw new Error("The primary classroom worker is missing");
  const sections = input.snapshots
    .map(courseSectionFromSnapshot)
    .filter((section): section is CourseSection => section !== null);
  const main = sections.find((section) => section.kind === "main") ?? null;
  const appendices = sections.filter((section) => section.kind === "branch");
  const exportReady =
    main !== null &&
    [...main.pages, ...appendices.flatMap((section) => section.pages)].every(
      (page) => page.media.status !== "pending",
    );
  return {
    id: `course-document:${input.id}`,
    title: main?.title ?? primary.topic ?? "Untitled course",
    subject: main?.topic ?? primary.topic ?? "Untitled course",
    teacherId: primary.teacherId,
    main,
    appendices,
    activeSectionId: sectionId(input.activeSessionId),
    exportReady,
  };
}
