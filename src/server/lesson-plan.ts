import { isRecord, toLessonStepId, toPrompt } from "@/lib/classroom-boundaries";
import { compileH3ScenePrompt, containsChinese, sceneCountForDuration } from "@/lib/classroom-config";
import { isValidTopic } from "@/lib/lesson-language";
import type { LessonDurationSeconds, LessonLedger, LessonPlan, LessonStep, Prompt, ScenePurpose, TeacherId, ValidatedScenePlan } from "@/lib/classroom-types";
import { plannerProgressionRole } from "@/server/progression-role";

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`The lesson planner omitted ${field}`);
  }
  return value.trim();
}

function jsonObject(value: string): Record<string, unknown> {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(cleaned);
  if (!isRecord(parsed)) {
    throw new Error("The lesson planner did not return a JSON object");
  }
  return parsed;
}

function parseSteps(input: {
  record: Record<string, unknown>;
  count: number;
}): readonly LessonStep[] {
  if (!Array.isArray(input.record.steps) || input.record.steps.length !== input.count) {
    throw new Error(`The lesson planner must return exactly ${input.count} steps`);
  }
  return input.record.steps.map((value, index) => {
    if (!isRecord(value)) {
      throw new Error("The lesson planner returned an invalid step");
    }
    const position = index + 1;
    const concept = requiredString(value, "concept");
    const optionalString = (field: string, fallback: string) => {
      const candidate = value[field];
      return typeof candidate === "string" && candidate.trim() ? candidate.trim() : fallback;
    };
    return {
      id: toLessonStepId(`step-${position}`),
      position,
      role: plannerProgressionRole({
        value: value.role,
        position,
        totalPositions: input.count,
      }),
      title: optionalString("title", concept.length > 60 ? `${concept.slice(0, 57)}…` : concept),
      teachingGoal: optionalString("teachingGoal", concept),
      narration: requiredString(value, "narration"),
      concept,
      summary: optionalString("summary", concept),
      visualAction: requiredString(value, "visualAction"),
      required: value.required !== false,
    };
  });
}


function fallbackSuggestedTopics(input: {
  topic: string;
  title: string;
  bigQuestion: string;
}): readonly [string, string, string] {
  const fit = (value: string) => value.trim().slice(0, 500);
  if (containsChinese(input.title)) {
    return [
      fit(`${input.title}在生活中有哪些例子？`),
      fit(`关于${input.topic}，常见的误解是什么？`),
      fit(`进一步解释：${input.bigQuestion}`),
    ];
  }
  return [
    fit(`How does ${input.title} show up in everyday life?`),
    fit(`What is a common misconception about ${input.topic}?`),
    fit(`What should I understand next after learning: ${input.bigQuestion}`),
  ];
}

function suggestedTopicsOf(
  value: unknown,
  fallback: readonly [string, string, string],
): readonly [string, string, string] {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  const topics = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  if (
    topics.some((topic) => !isValidTopic(topic)) ||
    new Set(topics.map((topic) => topic.toLowerCase())).size !== 3
  ) {
    return fallback;
  }
  return [topics[0]!, topics[1]!, topics[2]!];
}

export function parseInitialLesson(input: {
  teacherId: TeacherId;
  topic: string;
  durationSeconds: LessonDurationSeconds;
  output: string;
  latencyMs: number;
  preparedBy: string;
}): LessonPlan {
  const record = jsonObject(input.output);
  const targetSceneCount = sceneCountForDuration(input.durationSeconds);
  const steps = parseSteps({ record, count: targetSceneCount });
  const title = requiredString(record, "title");
  const bigQuestion = requiredString(record, "bigQuestion");
  return {
    topic: input.topic,
    // Identity belongs to the accepted request, never to model-generated JSON.
    teacherId: input.teacherId,
    title,
    bigQuestion,
    durationSeconds: input.durationSeconds,
    targetSceneCount,
    steps,
    preparedBy: input.preparedBy,
    preparationLatencyMs: input.latencyMs,
    suggestedTopics: suggestedTopicsOf(
      record.suggestedTopics,
      fallbackSuggestedTopics({ topic: input.topic, title, bigQuestion }),
    ),
  };
}

type SceneDraft = Readonly<{
  narration: string;
  concept: string;
  summary: string;
  visualAction: string;
}>;


function appendRecent(items: readonly string[], value: string): readonly string[] {
  return [...items, value].slice(-4);
}

function compileH3Prompt(draft: SceneDraft, sceneNumber: number, teacherId: TeacherId): Prompt {
  return toPrompt(compileH3ScenePrompt({ teacherId, sceneNumber, visualAction: draft.visualAction, narration: draft.narration }));
}

export function compileLessonScene(input: {
  lesson: LessonPlan;
  ledger: LessonLedger;
  sceneNumber: number;
  purpose: ScenePurpose;
}): ValidatedScenePlan {
  const step = input.lesson.steps.find((candidate) => candidate.id === input.purpose.stepId);
  if (!step) {
    throw new Error("The requested lesson step does not exist");
  }
  const draft: SceneDraft = {
    narration: step.narration,
    concept: step.concept,
    summary: step.summary,
    visualAction: step.visualAction,
  };
  const ledgerAfter: LessonLedger = {
    nextStepIndex: input.ledger.nextStepIndex + 1,
    conceptsPlanned: [...input.ledger.conceptsPlanned, draft.concept],
    recentNarrations: appendRecent(input.ledger.recentNarrations, draft.narration),
    recentVisuals: appendRecent(input.ledger.recentVisuals, draft.visualAction),
  };
  return {
    validation: "validated",
    teacherId: input.lesson.teacherId,
    sceneNumber: input.sceneNumber,
    purpose: input.purpose,
    prompt: compileH3Prompt(draft, input.sceneNumber, input.lesson.teacherId),
    narration: draft.narration,
    captions: [{ startSeconds: 0.2, endSeconds: 4.9, text: draft.narration }],
    concept: draft.concept,
    summary: draft.summary,
    visualAction: draft.visualAction,
    ledgerAfter,
  };
}
