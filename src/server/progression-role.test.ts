import assert from "node:assert/strict";
import test from "node:test";
import { plannerProgressionRole } from "@/server/progression-role";

test("planner role aliases normalize at the external boundary", () => {
  assert.equal(
    plannerProgressionRole({ value: "introduction", position: 1, totalPositions: 12 }),
    "hook",
  );
  assert.equal(
    plannerProgressionRole({ value: "causal explanation", position: 3, totalPositions: 12 }),
    "mechanism",
  );
  assert.equal(
    plannerProgressionRole({ value: "real_world_application", position: 9, totalPositions: 12 }),
    "application",
  );
  assert.equal(
    plannerProgressionRole({ value: "summary", position: 12, totalPositions: 12 }),
    "recap",
  );
});

test("lesson endpoints override valid but misplaced planner roles", () => {
  assert.equal(
    plannerProgressionRole({ value: "foundation", position: 1, totalPositions: 12 }),
    "hook",
  );
  assert.equal(
    plannerProgressionRole({ value: "synthesis", position: 12, totalPositions: 12 }),
    "recap",
  );
});

test("unknown planner labels use the lesson position without weakening content validation", () => {
  assert.equal(
    plannerProgressionRole({ value: "deep dive", position: 1, totalPositions: 12 }),
    "hook",
  );
  assert.equal(
    plannerProgressionRole({ value: "deep dive", position: 2, totalPositions: 12 }),
    "foundation",
  );
  assert.equal(
    plannerProgressionRole({ value: "deep dive", position: 8, totalPositions: 12 }),
    "transition",
  );
  assert.equal(
    plannerProgressionRole({ value: "deep dive", position: 11, totalPositions: 12 }),
    "synthesis",
  );
  assert.equal(
    plannerProgressionRole({ value: "deep dive", position: 12, totalPositions: 12 }),
    "recap",
  );
});
