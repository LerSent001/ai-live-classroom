import "server-only";

import {
  LESSON_PLANNER_CONFIG,
  sceneCountForDuration,
  preparationPrompt,
  PLANNER_SYSTEM_PROMPT,
} from "@/lib/classroom-config";
import type {
  LessonDurationSeconds,
  PreparationResult,
  TeacherId,
} from "@/lib/classroom-types";
import { requestGeminiPlan, type PlannerRecorder } from "@/server/gemini-planner";
import { parseInitialLesson } from "@/server/lesson-plan";

export async function prepareLesson(input: {
  teacherId: TeacherId;
  topic: string;
  durationSeconds: LessonDurationSeconds;
  geminiKey: string;
  record?: PlannerRecorder;
}): Promise<PreparationResult> {
  const startedAtMs = Date.now();
  try {
    const output = await requestGeminiPlan({
      apiKey: input.geminiKey,
      record: input.record,
      prompt: preparationPrompt(input.topic, sceneCountForDuration(input.durationSeconds), input.teacherId),
      systemPrompt: PLANNER_SYSTEM_PROMPT,
    });
    const lesson = parseInitialLesson({
      teacherId: input.teacherId,
      topic: input.topic,
      durationSeconds: input.durationSeconds,
      output,
      latencyMs: Date.now() - startedAtMs,
      preparedBy: `Gemini / ${LESSON_PLANNER_CONFIG.geminiModel}`,
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
      message: error instanceof Error ? error.message : "Gemini could not prepare this topic.",
      plannerAttemptsUsed: 1,
    };
  }
}

export { compileLessonScene } from "@/server/lesson-plan";
