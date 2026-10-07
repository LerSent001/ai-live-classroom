import test from "node:test";
import assert from "node:assert/strict";
import { YouthRuntimeRegistry } from "./youth-classroom-runtime";
import { toClassroomSessionId, toCommandId } from "@/lib/classroom-boundaries";
import { youthOutcome } from "./youth-api";
import { readClassroomResponse } from "@/lib/classroom-connection";
import { YOUTH_TEACHER_ID } from "@/lib/youth-classroom";
import { LESSON_PLANNER_CONFIG, YOUTH_QUESTION_GUIDANCE } from "@/lib/classroom-config";
const alice = "a".repeat(64), bob = "b".repeat(64);
const id = toClassroomSessionId("youth-runtime-test");
const output = JSON.stringify({ title: "重力", bigQuestion: "小球为什么下落？", suggestedTopics: ["月球", "失重", "轨道"], steps: Array.from({ length: 6 }, (_, n) => ({
  role: n === 0 ? "hook" : n === 5 ? "recap" : "mechanism", narration: `松开手，小球被地球的引力拉向地面。`, concept: `重力现象${n}`, visualAction: "The teacher releases a ball above a floor diagram.",
})) });
const command = { kind: "start", teacherId: YOUTH_TEACHER_ID, id: toCommandId("mock-start"), topic: "重力", durationSeconds: 30, atMs: 1 } as const;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness() {
  const keys = new Map([[alice, "fake-alice-key"], [bob, "fake-bob-key"]]);
  const versions = new Map<string, number>();
  const planned: string[] = [], rendered: string[] = [];
  const prompts: string[] = [];
  const plan = Promise.withResolvers<string>();
  const registry = new YouthRuntimeRegistry({ get: (owner) => keys.get(owner) ?? null, revision: (owner) => versions.get(owner) ?? 0 }, () => null, {
    plan: async ({ apiKey, prompt }) => { planned.push(apiKey); prompts.push(prompt); return plan.promise; },
    video: async ({ apiKey }) => { rendered.push(apiKey); return { providerUrl: "https://example.com/mock.mp4", expandedPrompt: null, queueLogs: [], timings: { requestId: "mock-video", totalMs: 1, queueWaitMs: 0, inferenceMs: 1 } }; },
  });
  return { registry, keys, versions, planned, rendered, prompts, plan };
}
test("youth sessions and providers are owner-bound; startup never calls a provider", async () => {
  const h = harness();
  const a = h.registry.get(alice), b = h.registry.get(bob);
  const state = a.create({ sessionId: id });
  assert.equal(b.view(id), null);
  assert.equal(state.configured, true);
  assert.deepEqual(h.planned, []); assert.deepEqual(h.rendered, []);
  a.command(id, command); h.plan.resolve(output); await flush();
  assert.deepEqual(h.planned, ["fake-alice-key"]);
  assert.ok(h.rendered.length > 0);
  assert.ok(h.rendered.every((key) => key === "fake-alice-key"));
  assert.equal(a.view(id)?.teacherId, YOUTH_TEACHER_ID);
  assert.ok(h.prompts[0].includes(command.topic));
  assert.ok(h.prompts[0].includes(YOUTH_QUESTION_GUIDANCE));
  assert.equal(a.view(id)?.lesson?.durationSeconds, 30);
  assert.equal(a.view(id)?.lesson?.preparedBy, `TokenDance / ${LESSON_PLANNER_CONFIG.tokenDanceModel}`);
  const response = await readClassroomResponse(youthOutcome({ kind: "snapshot", snapshot: a.view(id)! }), id);
  assert.equal(response.snapshot.metrics.estimatedSpendCents, null, "legacy fal admission estimate must not masquerade as TokenDance spend");
});
test("disconnect/reconnect to the same key cannot revive queued work on an old wallet revision", async () => {
  const h = harness();
  const original = h.registry.get(alice); original.create({ sessionId: id }); original.command(id, command);
  h.versions.set(alice, 2); // A -> disconnected -> A, even though fingerprint is unchanged.
  const replacement = h.registry.get(alice);
  assert.notEqual(replacement, original); assert.equal(replacement.view(id), null);
  h.plan.resolve(output); await flush();
  assert.deepEqual(h.rendered, [], "old planner completion cannot submit any videos");
  assert.equal(original.view(id)?.configured, false);
});
test("missing own wallet never falls back to shared server credentials", async () => {
  const h = harness(); h.keys.delete(alice);
  const a = h.registry.get(alice); a.create({ sessionId: id }); a.command(id, command);
  await flush(); assert.deepEqual(h.planned, []); assert.deepEqual(h.rendered, []);
  assert.equal(a.view(id)?.production.kind, "idle");
  assert.throws(() => h.registry.get("../owner"));
});
