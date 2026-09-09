import "server-only";

import {
  preparationPrompt,
  PLANNER_SYSTEM_PROMPT,
} from "@/lib/classroom-config";
import type {
  BranchLessonContext,
  CourseRole,
  PreparationResult,
  TeacherId,
} from "@/lib/classroom-types";
import { requestTokenPayPlan, type PlannerRecorder } from "@/server/tokenpay-planner";
import { parseInitialLesson } from "@/server/lesson-plan";

export async function prepareLesson(input: {
  teacherId: TeacherId;
  topic: string;
  courseRole: CourseRole;
  parentContext: BranchLessonContext | null;
  tokenpayKey: string;
  record?: PlannerRecorder;
}): Promise<PreparationResult> {
  const startedAtMs = Date.now();
  try {
    const output = await requestTokenPayPlan({
      apiKey: input.tokenpayKey,
      record: input.record,
      prompt: preparationPrompt(input.topic, input.teacherId, input.courseRole, input.parentContext),
      systemPrompt: PLANNER_SYSTEM_PROMPT,
    });
    const lesson = parseInitialLesson({
      teacherId: input.teacherId,
      topic: input.topic,
      courseRole: input.courseRole,
      parentContext: input.parentContext,
      output,
      latencyMs: Date.now() - startedAtMs,
      preparedBy: "TokenPay / deepseek-v3.2",
    });
    return {
      ok: true,
      lesson,
      ledger: { nextStepIndex: 0, conceptsPlanned: [], recentNarrations: [], recentVisuals: [] },
      plannerAttemptsUsed: 1,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "TokenPay 暂时无法生成课程。",
      plannerAttemptsUsed: 1,
    };
  }
}

export { compileLessonScene } from "@/server/lesson-plan";
