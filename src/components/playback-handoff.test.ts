import assert from "node:assert/strict";
import test from "node:test";
import { beginHandoff, mediaReady } from "@/components/playback-handoff";
import { toSceneId } from "@/lib/classroom-boundaries";

test("a handoff waiting on media activates when that scene becomes ready", () => {
  const first = toSceneId("scene-1");
  const second = toSceneId("scene-2");
  const waiting = beginHandoff({
    finishedSceneId: first,
    nextSceneId: second,
    mediaReady: false,
  });

  assert.deepEqual(waiting, {
    kind: "waiting",
    finishedSceneId: first,
    nextSceneId: second,
  });
  if (waiting.kind !== "waiting") throw new Error("Expected a waiting handoff");
  assert.deepEqual(mediaReady(waiting, second), {
    kind: "activate",
    finishedSceneId: first,
    nextSceneId: second,
  });
});

test("an unrelated media event cannot advance a pending handoff", () => {
  const first = toSceneId("scene-1");
  const second = toSceneId("scene-2");
  const third = toSceneId("scene-3");
  const waiting = beginHandoff({
    finishedSceneId: first,
    nextSceneId: second,
    mediaReady: false,
  });

  if (waiting.kind !== "waiting") throw new Error("Expected a waiting handoff");
  assert.equal(mediaReady(waiting, third), null);
});
