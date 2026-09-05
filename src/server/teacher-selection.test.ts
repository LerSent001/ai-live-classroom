import assert from "node:assert/strict";
import test from "node:test";
import { parseClassroomCommand, parseClassroomApiResponse, toClassroomSessionId } from "@/lib/classroom-boundaries";
import { DEFAULT_TEACHER_ID, TEACHERS, preparationPrompt, sceneCountForDuration } from "@/lib/classroom-config";
import type { LessonDurationSeconds, LessonLedger, TeacherId, ValidatedScenePlan } from "@/lib/classroom-types";
import { compileLessonScene, parseInitialLesson } from "@/server/lesson-plan";
import { ClassroomRuntime } from "@/server/classroom-runtime";

const start = { kind: "start", id: "teacher-start", topic: "讲讲重力的原理", durationSeconds: 30, atMs: 1 };

function plannedLesson(teacherId: TeacherId, durationSeconds: LessonDurationSeconds = 30) {
  const name = TEACHERS[teacherId].name;
  return parseInitialLesson({
    teacherId, topic: start.topic, durationSeconds, latencyMs: 1, preparedBy: "local fixture",
    output: JSON.stringify({
      // A model cannot overwrite the identity accepted by the API.
      teacherId: teacherId === "monokuma" ? "monomi" : "monokuma",
      title: "重力", bigQuestion: "物体为什么会落下？", suggestedTopics: ["月球的轨道", "太空中的失重", "物体的支撑力"],
      steps: Array.from({ length: sceneCountForDuration(durationSeconds) }, () => ({
        role: "mechanism", narration: "松开手，小球就会落向地面。", concept: "地球引力",
        visualAction: `${name} releases a ball beside a force diagram.`,
      })),
    }),
  });
}

function ledger(): LessonLedger {
  return { nextStepIndex: 0, conceptsPlanned: [], recentNarrations: [], recentVisuals: [] };
}

test("the API defaults to Monokuma and rejects unknown explicit teacher IDs", () => {
  assert.equal(DEFAULT_TEACHER_ID, "monokuma");
  const legacy = parseClassroomCommand(start);
  assert.ok(legacy.kind === "start");
  assert.equal(legacy.teacherId, "monokuma");
  for (const teacherId of ["monokuma", "monomi"] as const) {
    const command = parseClassroomCommand({ ...start, teacherId });
    assert.ok(command.kind === "start");
    assert.equal(command.teacherId, teacherId);
  }
  for (const teacherId of ["tung", "__proto__", "", null, 1]) {
    assert.throws(() => parseClassroomCommand({ ...start, teacherId }), /Unknown teacherId/);
  }
});

test("each teacher reaches both the Chinese planner and every compiled H3 beat", () => {
  for (const teacherId of ["monokuma", "monomi"] as const) {
    const name = TEACHERS[teacherId].name;
    const otherName = TEACHERS[teacherId === "monokuma" ? "monomi" : "monokuma"].name;
    const planner = preparationPrompt(start.topic, 6, teacherId);
    assert.ok(planner.includes(`named ${name}`));
    assert.ok(!planner.includes(otherName));
    assert.match(planner, /Simplified Chinese/);
    assert.match(planner, /1970s American educational television cartoon/);
    for (const durationSeconds of [30, 10] as const) {
      const lesson = plannedLesson(teacherId, durationSeconds);
      assert.equal(lesson.teacherId, teacherId);
      let currentLedger = ledger();
      for (const step of lesson.steps) {
        const scene = compileLessonScene({ lesson, ledger: currentLedger, sceneNumber: step.position, purpose: { kind: "lesson", stepId: step.id } });
        assert.equal(scene.teacherId, teacherId);
        assert.ok(scene.prompt.includes(`${name.toUpperCase()} CHARACTER SHEET`));
        assert.ok(scene.prompt.includes(step.narration));
        assert.match(scene.prompt, /Mandarin Chinese/);
        assert.match(scene.prompt, /1970s educational cartoon episode/);
        assert.match(scene.prompt, /paper grain, faint film scratches, and warm faded 16mm film color/);
        assert.match(scene.prompt, /preserve the teacher's exact colors/);
        assert.doesNotMatch(scene.prompt, /Japanese 2D|Japanese anime|Danganronpa|anime cel/);
        for (const line of TEACHERS[teacherId].characterSheet) assert.ok(scene.prompt.includes(line));
        assert.ok(!scene.prompt.includes(otherName));
        assert.doesNotMatch(scene.prompt, /\bTung\b/);
        currentLedger = scene.ledgerAfter;
      }
    }
  }
});

test("simultaneous classrooms keep distinct teachers through preparation, snapshots, and rendering", async () => {
  const rendered: Array<{ sessionId: string; plan: ValidatedScenePlan }> = [];
  const runtime = new ClassroomRuntime({
    configured: () => true, fixture: () => true,
    prepare: async ({ teacherId, durationSeconds }) => ({ ok: true, lesson: plannedLesson(teacherId, durationSeconds), ledger: ledger(), plannerAttemptsUsed: 1 }),
    compile: compileLessonScene,
    render: async ({ sessionId, plan }) => {
      rendered.push({ sessionId, plan });
      // Keep the mock jobs pending; no network request or media is needed.
      return new Promise(() => {});
    },
    clear: async () => {},
  });
  for (const teacherId of ["monokuma", "monomi"] as const) {
    const sessionId = toClassroomSessionId(`teacher-test-${teacherId}`);
    runtime.create({ sessionId });
    runtime.command(sessionId, parseClassroomCommand({ ...start, teacherId }));
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(rendered.length, 4);
  for (const { sessionId, plan } of rendered) {
    assert.equal(sessionId, `teacher-test-${plan.teacherId}`);
    assert.ok(plan.prompt.includes(TEACHERS[plan.teacherId].name));
  }
  const sessionId = toClassroomSessionId("teacher-test-monomi");
  runtime.command(sessionId, parseClassroomCommand({ ...start, id: "late-teacher-change", teacherId: "monokuma" }));
  const snapshot = runtime.view(sessionId)!;
  assert.equal(snapshot.teacherId, "monomi");
  const parsed = parseClassroomApiResponse({ ok: true, outcome: { kind: "snapshot", snapshot } });
  assert.ok(parsed.ok);
  assert.equal(parsed.outcome.snapshot.teacherId, "monomi");
  assert.equal(parsed.outcome.snapshot.lesson!.teacherId, "monomi");
  assert.ok(parsed.outcome.snapshot.scenes.every((scene) => scene.kind !== "generating" || scene.plan.teacherId === "monomi"));
});

test("a preparation identity mismatch stops before any video render", async () => {
  let renders = 0;
  const runtime = new ClassroomRuntime({
    configured: () => true, fixture: () => true,
    prepare: async () => ({ ok: true, lesson: plannedLesson("monokuma"), ledger: ledger(), plannerAttemptsUsed: 1 }),
    compile: compileLessonScene,
    render: async () => { renders++; throw new Error("Must not render a different teacher"); },
    clear: async () => {},
  });
  const sessionId = toClassroomSessionId("identity-mismatch");
  runtime.create({ sessionId });
  runtime.command(sessionId, parseClassroomCommand({ ...start, teacherId: "monomi" }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(renders, 0);
  assert.match(runtime.view(sessionId)!.warning!, /changed the selected teacher/);
});
