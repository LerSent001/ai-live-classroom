import assert from "node:assert/strict";
import test from "node:test";
import { toClassroomSessionId } from "@/lib/classroom-boundaries";
import { CLASSROOM_CONFIG } from "@/lib/classroom-config";
import { ClassroomApiError, isMissingClassroomSession, readClassroomResponse, watchClassroomSession } from "@/lib/classroom-connection";
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
  const stop = watchClassroomSession({ sessionId, onSnapshot: (snapshot) => received.push(snapshot), onError: (error) => { throw error; } });
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
