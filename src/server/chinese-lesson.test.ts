import assert from "node:assert/strict";
import test from "node:test";
import { parseClassroomCommand } from "@/lib/classroom-boundaries";
import { compileH3ScenePrompt, preparationPrompt } from "@/lib/classroom-config";
import { isLessonSubmitKey, isValidTopic } from "@/lib/lesson-language";
import { parseInitialLesson } from "@/server/lesson-plan";
import { requestTokenPayPlan } from "@/server/tokenpay-planner";

test("short Chinese topics work for initial and follow-up commands with one shared limit", () => {
  for (const topic of ["重力", "光合作用", "  AI  ", "用中文讲解 F=ma"]) {
    assert.equal(isValidTopic(topic), true);
    for (const kind of ["start", "queue-lesson"]) {
      const result = parseClassroomCommand({ kind, id: "chinese-test", topic, durationSeconds: 30, atMs: 1 });
      assert.ok("topic" in result);
      assert.equal(result.topic, topic.trim());
    }
  }
  for (const topic of [" ", "a", "力".repeat(501)]) {
    assert.equal(isValidTopic(topic), false);
    assert.throws(() => parseClassroomCommand({ kind: "queue-lesson", id: "bad-test", topic, atMs: 1 }));
  }
});

test("IME confirmation and shift-enter never submit a paid lesson", () => {
  const enter = { key: "Enter", shiftKey: false, nativeEvent: { isComposing: false, keyCode: 13 } };
  assert.equal(isLessonSubmitKey(enter), true);
  assert.equal(isLessonSubmitKey({ ...enter, shiftKey: true }), false);
  assert.equal(isLessonSubmitKey({ ...enter, nativeEvent: { isComposing: true, keyCode: 13 } }), false);
  assert.equal(isLessonSubmitKey({ ...enter, nativeEvent: { isComposing: false, keyCode: 229 } }), false);
});

test("Chinese planner output reaches validated lesson and H3 dialogue unchanged", async () => {
  const narration = "松开手，小球就会被地球的引力拉向地面。";
  const script = { title: "重力", bigQuestion: "小球为什么落地？", suggestedTopics: ["月球", "失重", "轨道"], steps: [
    { role: "example", narration, concept: "地球引力使小球下落", visualAction: "Monokuma releases a ball above a floor diagram." },
    { role: "recap", narration: "引力一直存在，支撑力让我们站稳。", concept: "支撑力与重力平衡", visualAction: "Monokuma points at equal opposing force arrows." },
  ] };
  const prompt = preparationPrompt("重力", 2, "monokuma");
  assert.match(prompt, /Simplified Chinese/);
  assert.match(prompt, /natural spoken Mandarin/);
  const output = await requestTokenPayPlan({ apiKey: "mock", prompt, systemPrompt: "JSON" }, async (_url, init) => {
    assert.ok(String(init?.body).includes("重力"));
    return Response.json({ choices: [{ message: { content: JSON.stringify(script) } }] });
  });
  const lesson = parseInitialLesson({ teacherId: "monokuma", topic: "重力", durationSeconds: 10, output, latencyMs: 1, preparedBy: "mock" });
  assert.deepEqual(lesson.suggestedTopics, ["月球", "失重", "轨道"]);
  assert.equal(lesson.steps[0]!.narration, narration);
  const h3 = compileH3ScenePrompt({ teacherId: "monokuma", sceneNumber: 1, narration: lesson.steps[0]!.narration, visualAction: lesson.steps[0]!.visualAction });
  assert.ok(h3.includes(narration));
  assert.match(h3, /Mandarin Chinese/);
  assert.doesNotMatch(h3, /American English/);
  const withoutSuggestions = parseInitialLesson({ teacherId: "monokuma", topic: "重力", durationSeconds: 10, output: JSON.stringify({ ...script, suggestedTopics: [] }), latencyMs: 1, preparedBy: "mock" });
  assert.ok(withoutSuggestions.suggestedTopics.every((topic) => /[\u4e00-\u9fff]/.test(topic)));
  assert.match(preparationPrompt("Explain gravity", 6, "monokuma"), /8–12 spoken words/);
});
