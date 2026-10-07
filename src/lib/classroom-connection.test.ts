import assert from "node:assert/strict";
import test from "node:test";
import { toClassroomSessionId } from "@/lib/classroom-boundaries";
import { CLASSROOM_CONFIG } from "@/lib/classroom-config";
import { ClassroomApiError, clearClassroomSession, isMissingClassroomSession, readClassroomResponse, sendClassroomCommand, shouldAcceptClassroomSnapshot, watchClassroomSession } from "@/lib/classroom-connection";
import type { ClassroomSnapshot } from "@/lib/classroom-types";
import { ClassroomRuntime } from "@/server/classroom-runtime";

const sessionId = toClassroomSessionId("connection-regression");

function idleSnapshot(): ClassroomSnapshot {
  return new ClassroomRuntime({
    configured: () => false,
    fixture: () => true,
    prepare: async () => { throw new Error("Connection tests must not plan a lesson"); },
    compile: () => { throw new Error("Connection tests must not compile a lesson"); },
    render: async () => { throw new Error("Connection tests must not render a video"); },
    clear: async () => {},
  }).create({ sessionId });
}

function success(snapshot = idleSnapshot()): Response {
  return Response.json({ ok: true, outcome: { kind: "snapshot", snapshot } });
}

function missing(): Response {
  return Response.json({ ok: false, error: { code: "SESSION_NOT_FOUND", message: "The classroom session was not found." } }, { status: 404 });
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("polling waits for the delayed create response, so GET cannot race ahead of POST", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const created = Promise.withResolvers<Response>();
  const methods: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    methods.push(init.method ?? "GET");
    return methods.length === 1 ? created.promise : success();
  });
  const received: ClassroomSnapshot[] = [];
  const stop = watchClassroomSession({ sessionId, requestTimeoutMs: 20_000, onSnapshot: (snapshot) => received.push(snapshot), onError: (error) => { throw error; } });
  t.after(stop);
  t.mock.timers.tick(10_000);
  await flush();
  assert.deepEqual(methods, ["POST"]);
  created.resolve(success());
  await flush();
  assert.equal(received.length, 1);
  t.mock.timers.tick(CLASSROOM_CONFIG.pollIntervalMs);
  await flush();
  assert.deepEqual(methods, ["POST", "GET"]);
  assert.equal(received.length, 2);
});

test("a failed connection retries only the empty create, without polling or submitting a lesson", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const errors: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, method: init.method ?? "GET", body: JSON.parse(String(init.body)) });
    if (requests.length === 1) throw new TypeError("offline");
    return success();
  });
  const stop = watchClassroomSession({ sessionId, onSnapshot: () => {}, onError: (error) => errors.push(error) });
  t.after(stop);
  await flush();
  t.mock.timers.tick(CLASSROOM_CONFIG.pollIntervalMs);
  await flush();
  assert.equal(errors.length, 1);
  assert.deepEqual(requests, Array.from({ length: 2 }, () => ({ url: "/api/classroom", method: "POST", body: { sessionId } })));
});

test("server session loss stops polling and preserves the typed error without replaying any command", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const methods: string[] = [];
  const errors: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    methods.push(init.method ?? "GET");
    return methods.length === 1 ? success() : missing();
  });
  const stop = watchClassroomSession({ sessionId, onSnapshot: () => {}, onError: (error) => errors.push(error) });
  t.after(stop);
  await flush();
  t.mock.timers.tick(CLASSROOM_CONFIG.pollIntervalMs);
  await flush();
  t.mock.timers.tick(60_000);
  await flush();
  assert.deepEqual(methods, ["POST", "GET"]);
  assert.equal(errors.length, 1);
  assert.equal(isMissingClassroomSession(errors[0]), true);
});

test("cleanup aborts in-flight work and ignores a late response from the old session", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const delayed = Promise.withResolvers<Response>();
  let requestSignal: AbortSignal | null = null;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    requestSignal = init.signal as AbortSignal;
    return delayed.promise;
  });
  const received: ClassroomSnapshot[] = [];
  const stop = watchClassroomSession({ sessionId, onSnapshot: (snapshot) => received.push(snapshot), onError: (error) => { throw error; } });
  stop();
  assert.equal((requestSignal as AbortSignal | null)?.aborted, true);
  delayed.resolve(success());
  await flush();
  t.mock.timers.tick(60_000);
  await flush();
  assert.equal(received.length, 0);
});

test("only the explicit missing-session response is eligible for session recovery", async () => {
  await assert.rejects(readClassroomResponse(missing(), sessionId), (error) => isMissingClassroomSession(error));
  assert.equal(isMissingClassroomSession(new ClassroomApiError(500, "SESSION_NOT_FOUND", "server failure")), false);
  assert.equal(isMissingClassroomSession(new ClassroomApiError(404, "OTHER_RESOURCE", "not found")), false);
  assert.equal(isMissingClassroomSession(new TypeError("offline")), false);
  await assert.rejects(readClassroomResponse(success({ ...idleSnapshot(), id: toClassroomSessionId("another-classroom") }), sessionId), /different session ID/);
});

test("a blackholed request cannot permanently stop the session observer", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const received: ClassroomSnapshot[] = [], errors: unknown[] = [];
  t.mock.method(globalThis, "fetch", async () => ++calls === 1 ? new Promise<Response>(() => {}) : success());
  const stop = watchClassroomSession({ sessionId, requestTimeoutMs: 100, onSnapshot: s => received.push(s), onError: e => errors.push(e) });
  t.after(stop);
  await flush(); t.mock.timers.tick(101); await flush();
  t.mock.timers.tick(CLASSROOM_CONFIG.pollIntervalMs); await flush();
  assert.equal(errors.length, 1);
  assert.equal(received.length, 1);
  assert.equal(calls, 2);
});

test("an unreadable response body has the same bounded connection timeout", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const received: ClassroomSnapshot[] = [];
  t.mock.method(globalThis, "fetch", async () => ++calls === 1 ? { ok: true, json: () => new Promise(() => {}) } as Response : success());
  const stop = watchClassroomSession({ sessionId, requestTimeoutMs: 100, onSnapshot: s => received.push(s), onError: () => {} });
  t.after(stop); await flush();
  t.mock.timers.tick(101); await flush(); t.mock.timers.tick(CLASSROOM_CONFIG.pollIntervalMs); await flush();
  assert.equal(received.length, 1);
});

test("lost acknowledgements and gateway errors reuse one identical command ID", async () => {
  const bodies: string[] = [], accepted = new Set<string>();
  const result = await sendClassroomCommand({ apiBase: "/api/youth/classroom", sessionId, commandId: "never-replace-this-id",
    command: { kind: "start", topic: "彩虹", teacherId: "youth-mentor-male", durationSeconds: 30 } }, {
    retryDelayMs: 0,
    request: async (_url, init) => {
      const body = String(init?.body); bodies.push(body); accepted.add(JSON.parse(body).id);
      if (bodies.length === 1) throw new TypeError("reply dropped AFTER the server accepted the command");
      if (bodies.length === 2) return new Response("upstream failed", { status: 502 });
      return success();
    },
  });
  assert.equal(result.snapshot.id, sessionId);
  assert.equal(bodies.length, 3); assert.equal(new Set(bodies).size, 1); assert.equal(accepted.size, 1);
});

test("permanent rejection stops command confirmation and cancellation stops all retries", async () => {
  let calls = 0;
  await assert.rejects(sendClassroomCommand({ apiBase: "/api/youth/classroom", sessionId, commandId: "rejected", command: { kind: "start" } }, {
    request: async () => { calls++; return Response.json({ ok: false, error: { code: "WALLET_REQUIRED", message: "请连接钱包。" } }, { status: 402 }); },
  }), /请连接钱包/);
  assert.equal(calls, 1);
  const controller = new AbortController();
  const pending = sendClassroomCommand({ apiBase: "/api/youth/classroom", sessionId, commandId: "cancelled", command: { kind: "start" }, signal: controller.signal }, {
    request: async () => { calls++; throw new TypeError("offline"); }, retryDelayMs: 10000,
  });
  await flush(); controller.abort(); await assert.rejects(pending, /abort/i); assert.equal(calls, 2);
});

test("a restored process with a lower version replaces the old process, but late retired replies do not", () => {
  const old = { ...idleSnapshot(), runtimeId: "before-restart", version: 99 };
  const restored = { ...old, runtimeId: "after-restart", version: 1 };
  assert.equal(shouldAcceptClassroomSnapshot(old, restored), true);
  assert.equal(shouldAcceptClassroomSnapshot(restored, old, new Set([old.runtimeId])), false);
  assert.equal(shouldAcceptClassroomSnapshot(old, { ...old, version: 98 }), false);
});

test("a lost exit reply retries the same DELETE and accepts the already-removed session", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  await clearClassroomSession({ apiBase: "/api/youth/classroom", sessionId, abandon: true }, {
    retryDelayMs: 0, request: async (url, init) => {
      calls.push({ url: String(url), method: String(init?.method) });
      if (calls.length === 1) throw new TypeError("exit accepted but reply dropped");
      return missing();
    },
  });
  assert.deepEqual(calls, Array.from({ length: 2 }, () => ({ url: `/api/youth/classroom/${sessionId}?abandon=1`, method: "DELETE" })));
});

test("a blackholed exit times out and retries without any generation request", async () => {
  let calls = 0;
  await clearClassroomSession({ apiBase: "/api/youth/classroom", sessionId }, {
    timeoutMs: 5, retryDelayMs: 0, request: async (_url, init) => {
      assert.equal(init?.method, "DELETE");
      return ++calls === 1 ? new Promise<Response>(() => {}) : Response.json({ ok: true });
    },
  });
  assert.equal(calls, 2);
});

test("a permanent exit rejection stops retries and an already-cancelled exit sends nothing", async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; return Response.json({ ok: false, error: { code: "SESSION_BUSY", message: "请等课程结束。" } }, { status: 409 }); };
  await assert.rejects(clearClassroomSession({ apiBase: "/api/youth/classroom", sessionId }, { request }), /请等课程结束/);
  assert.equal(calls, 1);
  await assert.rejects(clearClassroomSession({ apiBase: "/api/youth/classroom", sessionId, signal: AbortSignal.abort() }, { request }), /abort/i);
  assert.equal(calls, 1);
});
