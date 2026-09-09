import assert from "node:assert/strict";
import test from "node:test";
import {
  CLASSROOM_CONFIG,
  H3_MAX_CONFIG,
  h3InputForPrompt,
  preparationPrompt,
  quoteForSceneCount,
} from "@/lib/classroom-config";
import { parseClassroomCommand } from "@/lib/classroom-boundaries";

test("TokenPay H3 keeps five-second clips while course length stays adaptive", () => {
  assert.equal(H3_MAX_CONFIG.endpoint, "https://tokendance.space/gateway/minimax/v2/video_generation");
  assert.deepEqual(h3InputForPrompt("A test scene"), {
    model: "minimax-h3-max", duration: 5, resolution: "768P", ratio: "16:9", content: [{ type: "text", text: "A test scene" }],
  });
  assert.deepEqual([CLASSROOM_CONFIG.minMainLessonScenes, CLASSROOM_CONFIG.maxMainLessonScenes], [2, 12]);
  assert.deepEqual([CLASSROOM_CONFIG.minBranchLessonScenes, CLASSROOM_CONFIG.maxBranchLessonScenes], [1, 6]);
  assert.equal(quoteForSceneCount(6).expectedCents, 30);
});

test("the API ignores a client-selected duration and lets the planner choose", () => {
  const command = parseClassroomCommand({ kind: "start", id: "adaptive-course", topic: "Why does the Moon have phases?", durationSeconds: 30, atMs: 1 });
  assert.equal(command.kind, "start");
  assert.equal("durationSeconds" in command, false);
  if (command.kind !== "start") throw new Error("Expected a start command");
  assert.equal(command.courseRole, "main");
  assert.equal(command.parentContext, null);
  assert.match(preparationPrompt(command.topic, command.teacherId, command.courseRole, null), /Choose recommendedSceneCount from 2 through 12/);
});
