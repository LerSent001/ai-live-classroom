import type { ClassroomSessionId, GeneratedSegment, LessonPlan, TeacherId, ValidatedScenePlan } from "@/lib/classroom-types";

export type SavedClassroomSummary = Readonly<{
  recordingId: ClassroomSessionId;
  teacherId: TeacherId;
  topic: string;
  available: boolean;
}>;

export type RecordedLesson = Readonly<{
  lesson: LessonPlan;
  scenes: readonly Readonly<{ plan: ValidatedScenePlan; segment: GeneratedSegment }>[];
}>;

export type RecordedClassroom = Readonly<{
  recordingId: ClassroomSessionId;
  lessons: readonly RecordedLesson[];
}>;

export function recordingTopicKey(topic: string): string {
  return topic.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
