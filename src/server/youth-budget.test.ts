import assert from "node:assert/strict";
import test from "node:test";
import { quoteYouthLesson, YouthBudgetGuard } from "./youth-budget";
import { H3_MAX_CONFIG, LESSON_PLANNER_CONFIG } from "./youth-tokenpay-config";

const lesson = { topic: "彩虹为什么出现？", teacherId: "youth-mentor-male", durationSeconds: 30 } as const;
function request(balanceCny = 100): typeof fetch {
  return async (url, init) => {
    assert.ok(!init?.method || init.method === "GET", "preflight must never submit a billable request");
    if (String(url).endsWith("/balance")) return Response.json({ balance: { balance: balanceCny * 1_000_000 } });
    if (String(url).endsWith(H3_MAX_CONFIG.model)) return Response.json({ slug: H3_MAX_CONFIG.model, pricing: {
      items: [{ id: "minimax:video_generation_v2:video_seconds", skus: [{ specs: { resolution: "480P" }, unit: "seconds", rate: "99" }, { specs: { resolution: "768P" }, unit: "seconds", rate: ".425" }] }],
      reference: [{ id: "minimax:video_generation_v2:video_seconds", skus: [{ specs: { resolution: "768P" }, unit: "seconds", rate: ".5" }] }],
    } });
    assert.ok(String(url).endsWith(LESSON_PLANNER_CONFIG.tokenDanceModel));
    return Response.json({ slug: LESSON_PLANNER_CONFIG.tokenDanceModel, pricing: {
      items: [{ id: "openai:chat-completions:input_tokens", plans: [{ unit: "millionTokens", rate: "1" }] }, { id: "openai:chat-completions:completion_tokens", plans: [{ unit: "millionTokens", rate: "4" }] }],
      time_pricing: { options: [{ items: [{ id: "openai:chat-completions:input_tokens", plans: [{ unit: "millionTokens", rate: "2" }] }, { id: "openai:chat-completions:completion_tokens", plans: [{ unit: "millionTokens", rate: "8" }] }] }] },
    } });
  };
}
test("the CNY quote covers all six clips, capped planner tokens and a 10% margin", async () => {
  const quote = await quoteYouthLesson(lesson, request());
  assert.equal(quote.videoRateCny, .5);
  assert.ok(quote.amountCny > 16.5 && quote.amountCny < 17);
  const short = await quoteYouthLesson({ ...lesson, durationSeconds: 10 }, request());
  assert.ok(short.amountCny > 5.5 && short.amountCny < 6);
});
test("insufficient or unavailable balance and unknown prices fail closed", async () => {
  await assert.rejects(new YouthBudgetGuard(request(1)).reserve("low", "fake-key", lesson), /余额不足.*未提交付费请求/);
  await assert.rejects(new YouthBudgetGuard(async () => Response.json({})).reserve("bad", "fake-key", lesson), /未提交付费请求/);
  await assert.rejects(quoteYouthLesson(lesson, async () => new Response("gone", { status: 503 })), /价格读取失败/);
});
test("concurrent lessons on one wallet cannot both reserve the same balance", async () => {
  const guard = new YouthBudgetGuard(request(20));
  const results = await Promise.allSettled([guard.reserve("a", "same-key", lesson), guard.reserve("b", "same-key", lesson)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  guard.complete("a");
  await guard.reserve("b", "same-key", lesson);
});
test("other wallets are isolated and duplicate commands reserve only once", async () => {
  const guard = new YouthBudgetGuard(request(20));
  assert.deepEqual(await guard.reserve("a", "key-a", lesson), await guard.reserve("a", "key-a", lesson));
  await guard.reserve("b", "key-b", lesson);
});
test("exit holds accepted in-flight and uncertain tasks until receipt recovery finishes", async () => {
  const guard = new YouthBudgetGuard(request(20));
  await guard.reserve("a", "same-key", lesson);
  guard.begin("a"); guard.close("a");
  await assert.rejects(guard.reserve("b", "same-key", lesson), /余额不足/);
  guard.uncertain("a"); guard.finish("a");
  await assert.rejects(guard.reserve("b", "same-key", lesson), /余额不足/);
  guard.complete("a"); await guard.reserve("b", "same-key", lesson);
});

test("the actual short map releases the unused ceiling without counting its own hold twice", async () => {
  const guard = new YouthBudgetGuard(request(20));
  const ceiling = await guard.reserve("opening", "key", { ...lesson, adaptiveOpening: true });
  guard.begin("opening");
  await assert.rejects(guard.reserve("followup", "key", { ...lesson, durationSeconds: 10 }), /余额不足/);
  const actual = await guard.reserve("opening", "key", { ...lesson, durationSeconds: 15, phase: "lesson" });
  assert.ok(actual.amountCny < ceiling.amountCny / 2 + .1);
  assert.equal(actual.durationSeconds, 15);
  await guard.reserve("followup", "key", { ...lesson, durationSeconds: 10 });
  guard.close("opening"); guard.finish("opening");
  await guard.reserve("other", "key", { ...lesson, durationSeconds: 15 });
});

test("a late actual quote cannot revive a cancelled reservation", async () => {
  const guard = new YouthBudgetGuard(request(20));
  await guard.reserve("opening", "key", lesson); guard.begin("opening"); guard.close("opening");
  await assert.rejects(guard.reserve("opening", "key", { ...lesson, durationSeconds: 15, phase: "lesson" }), /已取消/);
  guard.finish("opening");
});

test("shrinking a planned map does not read prices or balance again and retains its conservative allowance", async () => {
  let reads = 0;
  const fixture = request(20);
  const guard = new YouthBudgetGuard(async (...args) => { reads++; return fixture(...args); });
  const ceiling = await guard.reserve("opening", "key", { ...lesson, adaptiveOpening: true });
  const initialReads = reads;
  for (const durationSeconds of [25, 20, 15] as const) {
    const actual = await guard.reserve("opening", "key", { ...lesson, durationSeconds, phase: "lesson" });
    assert.equal(reads, initialReads);
    assert.equal(actual.quotedAt, ceiling.quotedAt);
    assert.equal(actual.videoRateCny, ceiling.videoRateCny);
    const minimum = await quoteYouthLesson({ ...lesson, durationSeconds, adaptiveOpening: true }, fixture);
    assert.ok(actual.amountCny >= minimum.amountCny, "rounding must not shrink below the full fee allowance");
  }
});

test("local map adjustment cannot increase the ceiling, switch wallets or recreate a released reservation", async () => {
  const guard = new YouthBudgetGuard(request(20));
  await guard.reserve("opening", "key", lesson);
  await assert.rejects(guard.reserve("opening", "other-key", { ...lesson, phase: "lesson" }), /已取消/);
  await guard.reserve("opening", "key", { ...lesson, durationSeconds: 15, phase: "lesson" });
  await assert.rejects(guard.reserve("opening", "key", { ...lesson, phase: "lesson" }), /超出/);
  guard.complete("opening");
  await assert.rejects(guard.reserve("opening", "key", { ...lesson, phase: "lesson" }), /已取消/);
});
