import assert from "node:assert/strict";
import test from "node:test";
import { demoPricingAvailable, H3_MAX_CONFIG, h3InputForPrompt, quoteForDuration } from "@/lib/classroom-config";
import { parseClassroomCommand } from "@/lib/classroom-boundaries";

test("scoped H3 request uses the supported endpoint schema and 768p launch rate", () => {
  assert.equal(H3_MAX_CONFIG.endpoint, "minimax/h3-max-turbo/image-to-video");
  assert.deepEqual(h3InputForPrompt("A test scene"), {
    prompt: "A test scene", duration: 5, resolution: "768P", seed: 314159, prompt_expansion_mode: "balanced",
  });
  assert.equal(quoteForDuration(30).expectedCents + 2 * quoteForDuration(10).expectedCents, 50);
  assert.equal(demoPricingAvailable(Date.parse("2026-09-06T23:59:59Z")), true);
  assert.equal(demoPricingAvailable(Date.parse("2026-09-07T00:00:00Z")), false);
});

test("API duration boundary rejects the old long lesson lengths", () => {
  const command = { kind: "start", id: "test-demo-duration", topic: "Why does the Moon have phases?", atMs: 1 };
  for (const durationSeconds of [10, 30]) {
    assert.equal(parseClassroomCommand({ ...command, durationSeconds }).kind, "start");
  }
  for (const durationSeconds of [60, 120, "30", 20]) {
    assert.throws(() => parseClassroomCommand({ ...command, durationSeconds }), /duration/i);
  }
});
